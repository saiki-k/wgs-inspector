const fs = require('fs');
const path = require('path');

/**
 * Generic exporter for WGS containers
 * Exports files as they are found in the container structure
 * @param {Object} scanData - Scanned container data from scanner
 * @param {string} destinationDir - Export destination directory
 * @param {Object} results - Results object to populate
 * @returns {Object} Export results
 */
function genericExporter(scanData, destinationDir, results) {
	const wgsBasePath = scanData.wgsBasePath;

	if (!wgsBasePath) {
		throw new Error('WGS base path not found in scan data');
	}

	for (const entry of scanData.entries) {
		const containerName = entry.displayName;
		const folderName = entry.folderName;

		if (!entry.containerData || !entry.containerData.files) {
			results.skipped.push({ container: containerName, reason: 'No file data' });
			continue;
		}

		const containerDestDir = path.join(destinationDir, containerName);
		if (!fs.existsSync(containerDestDir)) {
			fs.mkdirSync(containerDestDir, { recursive: true });
		}

		const containerSourceDir = path.join(wgsBasePath, folderName);

		for (const fileEntry of entry.containerData.files) {
			const filename = fileEntry.filename;
			if (!filename) {
				results.skipped.push({ container: containerName, file: '(no name)', reason: 'Missing filename' });
				continue;
			}

			const fileGuid = fileEntry.fileGuid || fileEntry.guid.toUpperCase().replace(/-/g, '');
			const sourcePath = path.join(containerSourceDir, fileGuid);

			if (!fs.existsSync(sourcePath)) {
				results.errors.push({ file: filename, reason: 'File not found in source' });
				continue;
			}

			const destPath = path.join(containerDestDir, filename);

			try {
				fs.copyFileSync(sourcePath, destPath);
				const relativePath = path.relative(destinationDir, destPath);
				results.exported.push({
					container: containerName,
					file: filename,
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
	name: 'Generic',
	color: 'yellow',
	exporter: genericExporter,
};
