const fs = require('fs');
const path = require('path');
const { encodeData, CSHARP_HEADER } = require('./codec');

/**
 * Hollow Knight-specific exporter
 * Exports files in a structured format as defined by this exporter
 * @param {Object} scanData - Scanned container data
 * @param {string} destinationDir - Export destination directory
 * @param {Object} results - Results object to populate
 * @returns {Object} Export results
 */
function hollowKnightExporter(scanData, destinationDir, results) {
	const firstContainer = scanData.entries[0];
	if (!firstContainer || !firstContainer.folderName) {
		results.errors.push({ file: 'N/A', reason: 'No containers found in scan data' });
		return results;
	}

	const wgsBasePath = scanData.wgsBasePath;

	if (!wgsBasePath) {
		results.errors.push({ file: 'N/A', reason: 'WGS base path not provided in scan data' });
		return results;
	}

	for (const entry of scanData.entries) {
		const containerName = entry.displayName.toLowerCase();
		const folderName = entry.folderName;
		const containerDir = path.join(wgsBasePath, folderName);

		if (!entry.containerData || !entry.containerData.files) {
			results.skipped.push({ container: containerName, reason: 'No file data' });
			continue;
		}

		for (const fileEntry of entry.containerData.files) {
			const filename = fileEntry.filename;
			if (!filename) continue;

			const fileGuid = fileEntry.fileGuid || fileEntry.guid.toUpperCase().replace(/-/g, '');
			const sourcePath = path.join(containerDir, fileGuid);

			if (!fs.existsSync(sourcePath)) {
				results.errors.push({ file: filename, reason: 'File not found' });
				continue;
			}

			let destPath;
			let displayName = filename;

			if (containerName === 'shareddata') {
				destPath = path.join(destinationDir, 'shared.dat');
				displayName = 'shared.dat';

				try {
					const fileContent = fs.readFileSync(sourcePath);

					const isAlreadyEncrypted =
						fileContent.length > CSHARP_HEADER.length &&
						fileContent.subarray(0, CSHARP_HEADER.length).equals(CSHARP_HEADER);

					if (isAlreadyEncrypted) {
						fs.copyFileSync(sourcePath, destPath);
					} else {
						const jsonContent = fileContent.toString('utf8');
						const encryptedBytes = encodeData(jsonContent);
						fs.writeFileSync(destPath, encryptedBytes);
					}

					const relativePath = path.relative(destinationDir, destPath);
					results.exported.push({
						container: containerName,
						file: displayName,
						path: destPath,
						relativePath: relativePath,
					});
				} catch (err) {
					results.errors.push({ file: filename, reason: err.message });
				}
				continue;
			}

			if (containerName.startsWith('restore')) {
				const restoreNum = containerName.replace('restore', '');

				if (filename.startsWith('user')) {
					destPath = path.join(destinationDir, filename);
				} else {
					const restorePointsDir = path.join(destinationDir, `Restore_Points${restoreNum}`);
					if (!fs.existsSync(restorePointsDir)) {
						fs.mkdirSync(restorePointsDir, { recursive: true });
					}
					destPath = path.join(restorePointsDir, filename);
				}
			} else if (containerName.startsWith('save')) {
				destPath = path.join(destinationDir, filename);
			} else {
				results.skipped.push({
					container: containerName,
					file: filename,
					reason: 'Unknown container type',
				});
				continue;
			}

			try {
				fs.copyFileSync(sourcePath, destPath);
				const relativePath = path.relative(destinationDir, destPath);
				results.exported.push({
					container: containerName,
					file: displayName,
					path: destPath,
					relativePath: relativePath,
				});
			} catch (err) {
				results.errors.push({ file: filename, reason: err.message });
			}
		}
	}

	return results;
}

module.exports = {
	name: 'Hollow Knight / Hollow Knight: Silksong (Steam)',
	color: 'magenta',
	exporter: hollowKnightExporter,
};
