# Technical Documentation - WGS Container Format

This document provides detailed technical information about the Windows Gaming Services (WGS) container format used by Hollow Knight: Silksong, and other Game Pass titles, and the implementation details of this exporter.

## Table of Contents

-   [File Format Overview](#file-format-overview)
-   [How It Works](#how-it-works)
-   [API Reference](#api-reference)

---

## File Format Overview

### WGS Container Structure

Windows Gaming Services stores game data in encrypted containers across multiple files:

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

### containers.index Format

The master index file uses a **length-prefixed string format** with UTF-16LE encoding:

```
[4 bytes: length] [2×length bytes: UTF-16LE string data]

Example - "hello" (5 characters):
  05 00 00 00  68 00  65 00  6C 00  6C 00  6F 00
  ^^^^^^^^^^^  ^^^^^  ^^^^^  ^^^^^  ^^^^^  ^^^^^
  Length = 5     h      e      l      l      o
```

**Header Structure (containers.index):**

-   Bytes 0-3: Version number (4 bytes, little-endian)
-   Bytes 4-7: Container count (4 bytes, little-endian)
-   Bytes 8-11: Unknown/reserved field
-   Bytes 12+: Package name (length-prefixed UTF-16LE string)
-   Following: Timestamp (8 bytes, Windows FILETIME)
-   Following: Secondary count field (4 bytes)
-   Following: Container ID (length-prefixed UTF-16LE string)

**Container Entry Structure:**
Each container entry in the index contains:

1. Display name (length-prefixed UTF-16LE string, e.g., "save1")
2. Display name duplicate (same value, repeated)
3. Identifier (length-prefixed UTF-16LE string, e.g., "0x...")
4. Container number (1 byte)
5. Unknown padding (4 bytes)
6. Container GUID (16 bytes, binary, mixed-endian)

### container.# Files

Individual container files in GUID subdirectories follow this structure:

```
[4 bytes: version]
[4 bytes: file count]
[160-byte entries × file count]:
  - 128 bytes: UTF-16LE null-terminated filename (padded)
  - 16 bytes: GUID (identifies actual save file)
  - 16 bytes: GUID duplicate (same value)
```

**Important:** Each file entry is **exactly 160 bytes** with no extra padding between entries.

---

## How It Works

### 1. Pattern Matching Scanner

Since we don't have the complete specification for the WGS format, this tool uses a **pattern-matching approach**:

-   **Scans every byte position** in containers.index as a potential container entry start
-   **Attempts to parse** the expected sequence of fields at each position
-   **Validates** by checking if the identifier starts with "0x"
-   **Filters duplicates** based on file offset
-   **Sorts results** by order of appearance in the file

This is like "trying every key in every lock" - when all fields parse successfully AND validation passes, we found a valid container entry.

### 2. GUID Format Handling

GUIDs in WGS containers use **mixed-endian byte ordering**:

```
GUID in text: FA22B52C-35CB-4C3C-9EEB-A2B4D5D6AD11
Binary bytes: 2C B5 22 FA CB 35 3C 4C 9E EB A2 B4 D5 D6 AD 11
              └─────────┘ └───┘ └───┘ └───┘ └───────────────┘
              Little-endian │     │     │   Big-endian (stays same)
              (reversed)    │     │     └─> Big-endian
                            │     └────> Little-endian
                            └─────────> Little-endian
```

**First 3 sections** (4+2+2 bytes): Little-endian (bytes reversed)  
**Last 2 sections** (2+6 bytes): Big-endian (bytes in order)

The tool automatically handles this conversion when reading GUIDs from binary data.

### 3. Directory Name Mapping

Container folders are named using their GUID **without dashes**:

```
GUID in index:     A25851B1-62E1-4AB2-A61A-2A3DC07387AB
Folder name:       A25851B162E14AB2A61A2A3DC07387AB
```

The tool strips dashes and converts to uppercase when looking up container directories.

### 4. File Export Logic

The export process organizes files based on container type:

**sharedData container:**

-   File: `sharedData.dat` → Renamed to `shared.dat` in root

**save# containers (save1, save2, ...):**

-   Files: `user*.dat` → Copied to root as-is

**restore# containers (restore1, restore2, ...):**

-   Files starting with `user`:
    -   `user1.dat`, `user1_1.0.28891.dat`, etc. → Copied to root
-   Files NOT starting with `user`:
    -   `NODELrestoreData1.dat` → Copied to `Restore_Points#/`

This organization keeps primary saves in the root and backup/restore data in subdirectories.

### 5. Timestamp Conversion

Windows FILETIME format stores timestamps as:

-   **64-bit integer** (big-endian in file)
-   **100-nanosecond intervals** since January 1, 1601 UTC

Conversion to JavaScript Date:

```javascript
const EPOCH_DIFF = 116444736000000000n; // Difference between 1601 and 1970
const INTERVALS_PER_MS = 10000n; // 100ns intervals per millisecond
const unixTime = (fileTime - EPOCH_DIFF) / INTERVALS_PER_MS;
return new Date(Number(unixTime)).toISOString();
```

---

## API Reference

### Class: `ContainerScanner`

#### Constructor

```javascript
new ContainerScanner(filePath);
```

-   **filePath** (string): Path to the `containers.index` file
-   Reads and buffers the entire file into memory

#### Methods

##### `tryReadU32(offset)`

Reads a 32-bit little-endian unsigned integer.

**Parameters:**

-   `offset` (number): Byte position to read from

**Returns:** `[value, newOffset]` or `[null, oldOffset]` if failed

**Purpose:** Safely read integer values with bounds checking.

---

##### `tryReadUTF16(offset, maxChars = 512)`

Reads a length-prefixed UTF-16LE string from the container index buffer.

**Parameters:**

-   `offset` (number): Starting byte position
-   `maxChars` (number): Maximum allowed string length (safety limit)

**Returns:** `[string, newOffset]` or `[null, oldOffset]` if failed

**Process:**

1. Read 4-byte length prefix (character count)
2. Validate length is reasonable (0 < length ≤ maxChars)
3. Calculate byte count (length × 2)
4. Decode UTF-16LE bytes to string
5. Strip null characters
6. Return string and position after data

**Error Handling:**

-   Returns `[null, offset]` if:
    -   Length prefix is invalid
    -   Not enough bytes remaining
    -   Decoding fails

---

##### `tryReadGUID(offset, buffer = null)`

Reads and formats a 16-byte GUID with mixed-endian byte ordering.

**Parameters:**

-   `offset` (number): Starting byte position
-   `buffer` (Buffer, optional): Buffer to read from (defaults to `this.containerIndexBuffer`)

**Returns:** `[guid, newOffset]` or `[null, oldOffset]` if failed

**Process:**

1. Read 16 raw bytes
2. Convert to hex string (uppercase)
3. Apply mixed-endian transformation:
    - First 3 sections (4+2+2 bytes): Reverse byte order
    - Last 2 sections (2+6 bytes): Keep original order
4. Insert dashes to form standard GUID format
5. Return formatted GUID string

**Why the buffer parameter?**
This method works on both:

-   Container index file GUIDs (uses `this.containerIndexBuffer`)
-   Container file GUIDs (pass custom buffer)

---

##### `parseHeader()`

Extracts header information from containers.index.

**Returns:** Object with header fields or `null` if parsing fails

**Fields:**

-   `version` (number): Format version
-   `container_count` (number): Total number of containers
-   `second_count` (number): Secondary count (purpose unknown)
-   `unknown_field` (number): Reserved/unknown data
-   `package_name` (string): Game package identifier
-   `timestamp` (string): ISO 8601 formatted timestamp
-   `container_id` (string): Master container GUID

**Layout:**

```
[Version][Count][Unknown][PackageName][Timestamp][SecondCount][ContainerID]
   4B      4B      4B     Var-length      8B         4B        Var-length
```

---

##### `formatTimestamp(fileTime)`

Converts Windows FILETIME to ISO 8601 string.

**Parameters:**

-   `fileTime` (BigInt): Windows FILETIME value

**Returns:** ISO 8601 date string (e.g., "2025-11-07T12:23:45.678Z")

**Conversion:**

-   FILETIME epoch: January 1, 1601
-   Unix epoch: January 1, 1970
-   Difference: 116,444,736,000,000,000 × 100ns
-   Final: Convert to milliseconds, create Date object

---

##### `parseContainerIndexFile()`

Main parsing method that scans the entire containers.index file.

**Returns:** Object containing:

-   Header fields (version, count, package name, timestamp, container ID)
-   `entries` array: List of discovered container entries

**Algorithm:**

1. Parse header section
2. Scan byte-by-byte through file (brute-force pattern matching)
3. At each position, attempt to read:
    - Display name (UTF-16 string)
    - Display name duplicate
    - Identifier (UTF-16 string)
    - Container number (1 byte) + padding (4 bytes)
    - Container GUID (16 bytes)
4. Validate: Identifier must start with "0x"
5. Deduplicate by offset
6. Sort by file position

**Why scan every byte?**
Without complete format documentation, pattern matching ensures we find all container entries regardless of variable-length fields or unknown padding.

---

##### `parseContainerFiles(entries, baseDir)`

Reads and parses container.# files from GUID subdirectories.

**Parameters:**

-   `entries` (Array): Container entries from `parseContainerIndexFile()`
-   `baseDir` (string): Base directory containing GUID folders

**Returns:** Array of entries with added `container_data` field

**Process for each entry:**

1. Convert GUID to folder name (uppercase, no dashes)
2. Check if folder exists
3. Find `container.*` file in folder
4. Read and parse binary container file
5. Attach parsed data to entry

**Error Handling:**

-   Sets `error` field if folder/file not found
-   Sets `error` field if parsing fails
-   Continues processing remaining entries

---

##### `parseContainerFile(buffer)`

Parses binary container file data.

**Parameters:**

-   `buffer` (Buffer): Binary data from container.# file

**Returns:** Object with:

-   `version` (number): Container version (typically 4)
-   `file_count` (number): Number of files in container
-   `files` (Array): File entry objects
-   `total_size` (number): Buffer size in bytes
-   `error` (string, optional): Error message if parsing failed

**File Structure:**

```
[Version: 4B][FileCount: 4B][Entry1: 160B][Entry2: 160B]...

Each 160-byte entry:
  [Filename: 128B UTF-16LE null-terminated + padding]
  [GUID1: 16B]
  [GUID2: 16B duplicate]
```

**Filename Parsing:**

1. Read UTF-16LE characters (2 bytes each)
2. Stop at null terminator (0x0000)
3. Skip to offset 128 (start of GUID section)
4. Read both GUIDs using `tryReadGUID()`

**Safety Checks:**

-   Validates file size (minimum 8 bytes for header)
-   Guards against infinite loops (200 character limit)
-   Ensures exact 160-byte entry boundaries

---

##### `exportSaveFiles(exportedDir = './exported_save_files')`

Exports and organizes save files into clean folder structure.

**Parameters:**

-   `exportedDir` (string): Output directory path (absolute or relative)

**Returns:** Object with export results:

-   `exported` (Array): Successfully exported files
    -   `container` (string): Source container name
    -   `file` (string): Display name
    -   `path` (string): Full destination path
-   `skipped` (Array): Files not exported
    -   `container` (string)
    -   `file` (string)
    -   `reason` (string)
-   `errors` (Array): Export failures
    -   `file` (string)
    -   `reason` (string)

**Export Rules:**

| Container               | File Pattern           | Destination                            |
| ----------------------- | ---------------------- | -------------------------------------- |
| sharedData              | sharedData.dat         | `exported_save_files/shared.dat`       |
| save1, save2, ...       | user\*.dat             | `exported_save_files/user*.dat`        |
| restore1, restore2, ... | user\*.dat             | `exported_save_files/user*.dat`        |
| restore1, restore2, ... | NODELrestoreData\*.dat | `exported_save_files/Restore_Points#/` |

**Process:**

1. Parse container index
2. Parse all container files
3. For each file entry:
    - Determine destination based on container type
    - Create subdirectories as needed
    - Copy file from GUID-named source to human-readable destination
4. Track results for reporting

**Directory Creation:**

-   Main export directory created if needed
-   Restore_Points# folders created on-demand
-   Uses `fs.mkdirSync()` (non-recursive, single level)

---

## Programmatic Use

```javascript
const ContainerScanner = require('./index');
const path = require('path');

const scanner = new ContainerScanner('./path/to/containers.index');

// Get parsed data
const data = scanner.parseContainerIndexFile();
const baseDir = path.dirname(path.resolve('./path/to/containers.index'));
data.entries = scanner.parseContainerFiles(data.entries, baseDir);

// Export files
const results = scanner.exportSaveFiles('./my_output_dir');

console.log(`Exported ${results.exported.length} files`);
console.log(`Errors: ${results.errors.length}`);
```
