# Scanner Module

The scanner module handles discovery and parsing of Windows Gaming Services (WGS) container files.

## Overview

Windows Gaming Services stores game data in obfuscated binary containers using GUID-based naming and proprietary formats. The container structure makes save files difficult to access directly, as files are stored with cryptic GUID names rather than readable filenames.

The scanner module provides:

-   **Package Discovery** - Scans `AppData/Local/Packages` to find all WGS-enabled games
-   **Index Parsing** - Decodes `containers.index` files to extract container metadata
-   **Container Enumeration** - Reads individual container files to map GUIDs to logical filenames
-   **File Metadata** - Retrieves file sizes and validates container structure

## WGS Container Structure

```
WGS_Directory/
├── containers.index             # Master index (what we parse)
├── {GUID-1}/                    # Container folder (no dashes in name)
│   ├── container.5              # Container metadata
│   └── {FILE-GUID}              # Actual save file (named by GUID)
├── {GUID-2}/
│   ├── container.6
│   └── {FILE-GUID}
└── ...
```

## File Format Details

### containers.index Format

The main contianers.index file uses **length-prefixed string format** with UTF-16LE encoding:

```
[4 bytes: length] [2×length bytes: UTF-16LE string data]

Example - "hello" (5 characters):
  05 00 00 00  68 00  65 00  6C 00  6C 00  6F 00
  ^^^^^^^^^^^  ^^^^^  ^^^^^  ^^^^^  ^^^^^  ^^^^^
  Length = 5     h      e      l      l      o
```

**Header Structure:**

-   Bytes 0-3: Version number (4 bytes, little-endian)
-   Bytes 4-7: Container count (4 bytes, little-endian)
-   Bytes 8-11: Unknown/reserved field
-   Bytes 12+: Package name (length-prefixed UTF-16LE string)
-   Following: Timestamp (8 bytes, Windows FILETIME)
-   Following: Secondary count field (4 bytes)
-   Following: Container ID (length-prefixed UTF-16LE string)

**Container Entry Structure:**

The `containers.index` file contains multiple container entries, but the exact structure of each entry varies between games. Two primary formats have been identified:

**Format 1 (Silksong):**

1. Display name (length-prefixed UTF-16LE string, e.g., "save1")
2. Display name duplicate (same value, repeated)
3. Identifier (length-prefixed UTF-16LE string, e.g., "0x...")
4. Container number (1 byte)
5. Unknown padding (4 bytes)
6. Container GUID (16 bytes, binary, mixed-endian)

**Format 2 (Hollow Knight):**

1. Display name (length-prefixed UTF-16LE string, e.g., "Preferences")
2. Padding (4 bytes: 00 00 00 00)
3. Identifier (length-prefixed UTF-16LE string, e.g., "0x...")
4. Container number (1 byte)
5. Unknown padding (4 bytes)
6. Container GUID (16 bytes, binary, mixed-endian)

The key difference is that Format 1 duplicates the display name, while Format 2 uses null byte padding instead. The scanner attempts to parse both formats at each position to handle these variations.

### container.# Files

Individual container files in GUID subdirectories:

```
[4 bytes: version]
[4 bytes: file count]
[160-byte entries × file count]:
  - 128 bytes: UTF-16LE null-terminated filename (padded)
  - 16 bytes: GUID (identifies actual save file)
  - 16 bytes: GUID duplicate (same value)
```

## Pattern Matching Algorithm

Since the complete WGS format specification isn't public, the scanner uses **pattern-matching**:

1. Scans every byte position in containers.index as a potential container entry
2. Attempts to parse multiple format variants at each position
3. Validates by checking if the identifier starts with "0x"
4. Filters duplicates based on GUID (not offset, as same container may match multiple formats)
5. Sorts results by order of appearance

This brute-force approach ensures all container entries are found regardless of variable-length fields, unknown padding, or format variations between games.

## GUID Format Handling

GUIDs in WGS containers use **mixed-endian byte ordering**:

```
GUID in text: FA22B52C-35CB-4C3C-9EEB-A2B4D5D6AD11
Binary bytes: 2C B5 22 FA CB 35 3C 4C 9E EB A2 B4 D5 D6 AD 11
              └─────────┘ └───┘ └───┘ └───┘ └───────────────┘
              Little-endian │     │     │   Big-endian
              (reversed)    │     │     └─> Big-endian
                            │     └────> Little-endian
                            └─────────> Little-endian
```

**First 3 sections** (4+2+2 bytes): Little-endian (bytes reversed)  
**Last 2 sections** (2+6 bytes): Big-endian (bytes in order)

## Directory Name Mapping

Container folders are named using their GUID **without dashes**:

```
GUID in index:     A25851B1-62E1-4AB2-A61A-2A3DC07387AB
Folder name:       A25851B162E14AB2A61A2A3DC07387AB
```

## File Name Mapping

Save files within container folders follow the same GUID naming convention. The `container.*` metadata file maps logical filenames to GUID-named files:

```
Logical filename:  user1.dat
File GUID:         FA22B52C-35CB-4C3C-9EEB-A2B4D5D6AD11
Actual filename:   FA22B52C35CB4C3C9EEBA2B4D5D6AD11  (no dashes or extension)
```

The scanner reads `container.*` files to build this mapping, allowing exporters to restore meaningful filenames when extracting save data.

## Timestamp Conversion

Windows FILETIME format:

-   **64-bit integer** (big-endian in file)
-   **100-nanosecond intervals** since January 1, 1601 UTC

Conversion to JavaScript Date:

```javascript
const EPOCH_DIFF = 116444736000000000n; // Difference between 1601 and 1970
const INTERVALS_PER_MS = 10000n; // 100ns intervals per millisecond
const unixTime = (fileTime - EPOCH_DIFF) / INTERVALS_PER_MS;
return new Date(Number(unixTime)).toISOString();
```

## API Reference

### Core Functions

#### `scanWGSPackages()`

Discovers all WGS-enabled packages on the system.

**Returns:** `{ packages, basePath }`

-   `packages` (Array) - List of discovered packages:
    -   `packageName` - Full package directory name
    -   `displayName` - Friendly game name extracted from containers.index
    -   `containersIndexPath` - Absolute path to containers.index
    -   `containerCount` - Number of save containers
    -   `timestamp` - Last modification time (ISO 8601)
    -   `wgsFolder` - WGS subdirectory identifier
-   `basePath` (string) - Root packages directory path

**Example:**

```javascript
const { scanWGSPackages } = require('./scanner');
const { packages } = scanWGSPackages();

packages.forEach((pkg) => {
	console.log(`${pkg.displayName}: ${pkg.containerCount} containers`);
});
```

#### `scanPackageContainers(containersIndexPath)`

Scans a specific package to retrieve detailed container and file information.

**Parameters:**

-   `containersIndexPath` (string) - Path to the containers.index file

**Returns:** Object with header fields and entries array:

-   `version` - Container format version
-   `containerCount` - Total number of containers
-   `packageName` - Game package name
-   `timestamp` - Last modification timestamp
-   `containerId` - Package container identifier
-   `wgsBasePath` - Base WGS directory path
-   `entries` (Array) - Container details:
    -   `displayName` - User-facing container name (e.g., "save1", "Preferences")
    -   `identifier` - Hexadecimal identifier (e.g., "0x...")
    -   `containerNumber` - Container sequence number
    -   `guid` - Container GUID (with dashes)
    -   `folderName` - GUID without dashes (actual folder name)
    -   `containerData` - Parsed file metadata:
        -   `version` - Container version
        -   `fileCount` - Number of files
        -   `files` - File entries:
            -   `filename` - Logical filename
            -   `guid` - File GUID (with dashes)
            -   `fileGuid` - File GUID without dashes (actual filename)
            -   `size` - File size in bytes

**Example:**

```javascript
const { scanPackageContainers } = require('./scanner');
const data = scanPackageContainers('/path/to/containers.index');

data.entries.forEach((container) => {
	console.log(`Container: ${container.displayName}`);
	container.containerData.files.forEach((file) => {
		console.log(`  ${file.filename} (${file.size} bytes)`);
	});
});
```

### Internal Classes

#### `ContainerIndexScanner`

Parses the binary `containers.index` file to extract package and container metadata.

**Constructor:** `new ContainerIndexScanner(filePath)`

**Methods:**

-   `parse()` - Parses entire index file, returns header and container entries
-   `parseHeader()` - Extracts version, count, package name, and timestamp
-   `parseContainerEntry(offset)` - Attempts to parse container entry at byte offset
-   `tryReadU32(offset)` - Reads 32-bit unsigned integer (little-endian)
-   `tryReadUTF16(offset, maxChars)` - Reads length-prefixed UTF-16LE string
-   `tryReadGUID(offset)` - Reads 16-byte GUID with mixed-endian conversion
-   `formatTimestamp(fileTime)` - Converts Windows FILETIME to ISO 8601

The scanner uses pattern-matching to handle format variations between games, scanning every byte position and filtering duplicates by GUID.

#### `ContainerScanner`

Parses individual `container.*` files within GUID subdirectories.

**Methods:**

-   `parse(filePath)` - Parses container file, returns version, file count, and file entries
-   `tryReadGUID(offset, buffer)` - Reads 16-byte GUID (same implementation as `ContainerIndexScanner`)

Each container file contains fixed 160-byte entries with UTF-16LE filenames (128 bytes) and two GUID fields (32 bytes).

## Module Structure

-   `index.js` - Package discovery and high-level orchestration
-   `containerIndexScanner.js` - Binary parser for containers.index files
-   `containerScanner.js` - Binary parser for individual container.\* files
