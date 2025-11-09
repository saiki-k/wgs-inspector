# Hollow Knight: Silksong Save Exporter

Export Hollow Knight: Silksong saves from Game Pass to Steam-compatible format.

## Quick Start

**Download** the [latest release](../../releases) executable and run it, or:

```bash
npm install
node src/index.js
```

Save files are exported to a directory called `exported_save_files/`, created next to the executable, or the current working directory if run from source.

## Build

```bash
npm run build  # → build/silksong-wgs-exporter.exe
```

Requires Node.js 20+. See [src/TECHNICAL.md](src/TECHNICAL.md) for more details.
