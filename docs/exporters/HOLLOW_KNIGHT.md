# Hollow Knight / Hollow Knight: Silksong Exporter

This exporter converts WGS container files for Hollow Knight and Hollow Knight: Silksong to the format used by the Steam version of these games.

## File Organization

| WGS Container           | File Pattern           | Exported As                            |
| ----------------------- | ---------------------- | -------------------------------------- |
| SharedData              | sharedData.dat         | `exported_save_files/shared.dat`       |
| Save1, Save2, ...       | user\*.dat             | `exported_save_files/user*.dat`        |
| Restore1, Restore2, ... | user\*.dat             | `exported_save_files/user*.dat`        |
| Restore1, Restore2, ... | NODELrestoreData\*.dat | `exported_save_files/Restore_Points#/` |

## Encryption

### SharedData File

-   **WGS Format**: Plain JSON
-   **Steam Format**: Encrypted .dat format
-   **Conversion**: Encrypts using AES-256-ECB with game-specific key if not already encrypted

### Save Files

-   Already encrypted by WGS
-   Copied directly without modification

## Codec (codec.js)

AES-256-ECB encryption/decryption with C# binary header format:

```javascript
const { encodeData, decodeData, CSHARP_HEADER } = require('./codec');

// Encrypt JSON to .dat format
const encryptedBytes = encodeData(jsonString);

// Decrypt .dat to JSON
const jsonString = decodeData(fileBytes);

// Check if file is already encrypted
const isEncrypted = fileContent.subarray(0, CSHARP_HEADER.length).equals(CSHARP_HEADER);
```

**Header Format:**

```
[22-byte C# header]
[Variable-length encoded length]
[Base64-encoded encrypted data]
[1-byte terminator: 0x0b]
```

**Encryption:**

-   Algorithm: AES-256-ECB
-   Key: Game-specific (stored in codec.js)
-   Padding: PKCS7 (automatic)

## Configuration

This exporter is automatically selected for the following packages as defined in `PACKAGE_EXPORTER_MAP`:

-   `TeamCherry.15373CD61C66B_y4jvztpgccj42` (Hollow Knight)
-   `TeamCherry.HollowKnightSilksong_y4jvztpgccj42` (Hollow Knight: Silksong)

## Example Usage

```javascript
const { getExporter } = require('../');

const exporterModule = getExporter('TeamCherry.15373CD61C66B_y4jvztpgccj42');
const results = exporterModule.exporter(scanData, './output_dir', { exported: [], skipped: [], errors: [] });
```

## Output Structure

```
exported_save_files/
├── user1.dat                    # Save slot 1
├── user2.dat                    # Save slot 2
├── shared.dat                   # Shared game data (encrypted for Steam)
├── Restore_Points1/             # Restore points for slot 1
│   ├── NODELrestoreData1.dat
│   ├── restoreData2.dat
│   └── ...
├── Restore_Points2/             # Restore points for slot 2
│    ├── NODELrestoreData2.dat
│    └── ...
└── ...
```
