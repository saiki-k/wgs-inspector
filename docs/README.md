# WGS Inspector Documentation

Technical documentation for the WGS Inspector project.

## Overview

WGS Inspector provides tools to access save files from Windows Gaming Services (Game Pass) games. The system consists of two main components:

1. **Scanner** - Discovers and parses WGS containers to map cryptic GUID-named files to logical filenames
2. **Exporters** - Converts or extracts save files to usable formats for other platforms

For general usage information, see the [main README](../README.md).

## Modules

### [Scanner Module](./SCANNERS.md)

Handles discovery and parsing of Windows Gaming Services (WGS) container files.

-   Package discovery in `AppData/Local/Packages`
-   Binary parsing of `containers.index` files
-   Container file enumeration and GUID mapping
-   File metadata extraction

### [Exporters Module](./exporters/)

Converts WGS container files to platform-specific formats or extracts them in their original structure.

-   Game-specific exporters (Steam, etc.)
-   Generic exporter for any game
-   Exporter registry system
-   Format conversion utilities

## Game-Specific Exporters

-   [Hollow Knight / Silksong](./exporters/HOLLOW_KNIGHT.md) - Steam save format conversion
