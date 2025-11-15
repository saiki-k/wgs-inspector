# Exporters Module

The exporters module converts WGS container files to platform-specific formats or extracts them in their original structure.

## Overview

After the scanner module identifies and maps save files, exporters handle the conversion to usable formats. Each exporter is tailored to specific games or provides generic extraction capabilities.

The exporters module provides:

-   **Game-Specific Exporters** - Convert WGS saves to platform-specific formats (e.g., Steam)
-   **Generic Exporter** - Extracts files preserving the WGS container structure
-   **Exporter Registry** - Maps package names to appropriate exporters
-   **Format Conversion** - Handles encryption, encoding, and file structure transformation

## Exporter Registry

The registry maps game package names to their respective exporters:

```javascript
const PACKAGE_EXPORTER_MAP = {
	'TeamCherry.HollowKnight': hollowKnightExporter,
	'TeamCherry.HollowKnightSilksong': hollowKnightExporter,
};
```

### `getExporter(packageName)`

Retrieves the appropriate exporter for a given package.

**Parameters:**

-   `packageName` (string) - Full package name or 'generic'

**Returns:** Exporter object with `{ name, color, exporter }`

-   `name` (string) - Display name (e.g., "Hollow Knight", "Generic")
-   `color` (string) - Terminal color for display (e.g., "cyan", "yellow")
-   `exporter` (function) - Export function `(scanData, destinationDir, results)`

If no game-specific exporter exists, returns the generic exporter as fallback.

**Example:**

```javascript
const { getExporter } = require('./exporters');

const exporter = getExporter('TeamCherry.HollowKnight');
console.log(`Using ${exporter.name} exporter`);

const results = { success: [], failed: [] };
exporter.exporter(scanData, './output', results);
```

## Generic Exporter

Located in `exporters/generic/`, this exporter extracts files exactly as they appear in WGS containers.

**Behavior:**

-   Preserves container folder structure
-   Uses logical filenames from `container.*` metadata
-   No format conversion or encryption changes
-   Suitable for any game without a specific exporter

**Output Structure:**

```
destination/
├── PackageName/
│   ├── container1-name/
│   │   ├── file1.dat
│   │   └── file2.json
│   └── container2-name/
│       └── preferences.cfg
```

## Game-Specific Exporters

### Hollow Knight / Silksong

See [HOLLOW_KNIGHT.md](./HOLLOW_KNIGHT.md) for detailed documentation.

Converts WGS save files to Steam-compatible format:
- Encrypts SharedData JSON files using AES-256-ECB
- Organizes user saves and restore points into Steam directory structure
- Copies already-encrypted save files directly

## Creating Custom Exporters

Each exporter should export an object with:

```javascript
module.exports = {
	name: 'Game Name', // Display name
	color: 'cyan', // Terminal color (chalk color name)
	exporter: exporterFunction, // Export function
};
```

**Export Function Signature:**

```javascript
function exporterFunction(scanData, destinationDir, results) {
	// scanData: Output from scanPackageContainers()
	// destinationDir: Target directory for exported files
	// results: { success: [], failed: [] } - tracks export status
}
```

**Adding to Registry:**

Update `PACKAGE_EXPORTER_MAP` in `exporters/index.js`:

```javascript
const PACKAGE_EXPORTER_MAP = {
	'Publisher.GameName': require('./gameName'),
	// ...existing entries
};
```

## Module Structure

-   `index.js` - Exporter registry and getExporter()
-   `generic/` - Generic exporter for all games
-   `hollowKnight/` - Hollow Knight/Silksong specific exporter
    -   `index.js` - Main export logic
    -   `codec.js` - AES-256-ECB encryption/decryption
