const fs = require('fs');
const path = require('path');
const os = require('os');
const ContainerIndexScanner = require('./containerIndexScanner');
const ContainerScanner = require('./containerScanner');

/**
 * Scans all packages in AppData/Local/Packages for WGS containers
 * @returns {Object} Object with packages array and base path
 */
function scanWGSPackages() {
	const packagesBasePath = path.join(os.homedir(), 'AppData/Local/Packages');

	if (!fs.existsSync(packagesBasePath)) {
		throw new Error(`Packages directory not found: ${packagesBasePath}`);
	}

	const packages = [];
	const packageDirs = fs.readdirSync(packagesBasePath);

	for (const packageDir of packageDirs) {
		const packagePath = path.join(packagesBasePath, packageDir);

		if (!fs.statSync(packagePath).isDirectory()) {
			continue;
		}

		const wgsPath = path.join(packagePath, 'SystemAppData/wgs');
		if (!fs.existsSync(wgsPath)) {
			continue;
		}

		// Find the WGS subfolder (not named 't')
		try {
			const wgsFolders = fs.readdirSync(wgsPath);
			const targetFolder = wgsFolders.find((f) => {
				const folderPath = path.join(wgsPath, f);
				return f !== 't' && fs.statSync(folderPath).isDirectory();
			});

			if (!targetFolder) {
				continue;
			}

			const containersIndexPath = path.join(wgsPath, targetFolder, 'containers.index');
			if (!fs.existsSync(containersIndexPath)) {
				continue;
			}

			try {
				const scanner = new ContainerIndexScanner(containersIndexPath);
				const data = scanner.parse();

				packages.push({
					packageName: packageDir,
					displayName: data.packageName || packageDir,
					containersIndexPath: containersIndexPath,
					containerCount: data.containerCount || 0,
					timestamp: data.timestamp || null,
					wgsFolder: targetFolder,
				});
			} catch (err) {
				packages.push({
					packageName: packageDir,
					displayName: packageDir,
					containersIndexPath: containersIndexPath,
					containerCount: 0,
					timestamp: null,
					wgsFolder: targetFolder,
					error: `Parse error: ${err.message}`,
				});
			}
		} catch (err) {
			continue;
		}
	}

	return { packages, basePath: packagesBasePath };
}

/**
 * Scans a specific package for detailed container information
 * @param {string} containersIndexPath - Path to containers.index file
 * @returns {Object} Detailed container and file information
 */
function scanPackageContainers(containersIndexPath) {
	const indexScanner = new ContainerIndexScanner(containersIndexPath);
	const indexData = indexScanner.parse();

	const baseDir = path.dirname(path.resolve(containersIndexPath));
	indexData.wgsBasePath = baseDir;

	const containerScanner = new ContainerScanner();
	const results = [];

	for (const entry of indexData.entries) {
		const folderName = entry.guid.toUpperCase().replace(/-/g, '');
		const containerDir = path.join(baseDir, folderName);

		if (!fs.existsSync(containerDir)) {
			results.push({
				...entry,
				containerData: null,
				error: `Folder not found: ${folderName}`,
			});
			continue;
		}

		const files = fs.readdirSync(containerDir);
		const containerFile = files.find((f) => f.startsWith('container.'));

		if (!containerFile) {
			results.push({
				...entry,
				containerData: null,
				error: 'No container file found in directory',
			});
			continue;
		}

		const containerPath = path.join(containerDir, containerFile);
		try {
			const parsed = containerScanner.parse(containerPath);

			if (parsed.files) {
				parsed.files = parsed.files.map((file) => {
					const fileGuid = file.guid.toUpperCase().replace(/-/g, '');
					const filePath = path.join(containerDir, fileGuid);
					let size = 0;
					if (fs.existsSync(filePath)) {
						size = fs.statSync(filePath).size;
					}
					return {
						...file,
						size,
						fileGuid: fileGuid,
					};
				});
			}

			results.push({
				...entry,
				folderName: folderName,
				containerData: parsed,
			});
		} catch (err) {
			results.push({
				...entry,
				containerData: null,
				error: `Failed to parse: ${err.message}`,
			});
		}
	}

	indexData.entries = results;
	return indexData;
}

module.exports = {
	scanWGSPackages,
	scanPackageContainers,
};
