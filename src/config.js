const path = require('path');
const fs = require('fs');
const os = require('os');

// Find the WGS folder (the one that's not named 't')
function getContainersIndexPath() {
	const wgsBasePath = path.join(
		os.homedir(),
		'AppData/Local/Packages/TeamCherry.HollowKnightSilksong_y4jvztpgccj42/SystemAppData/wgs'
	);

	try {
		if (!fs.existsSync(wgsBasePath)) {
			throw new Error('WGS base path does not exist.');
		}

		const folders = fs.readdirSync(wgsBasePath);
		const targetFolder = folders.find((f) => f !== 't' && fs.statSync(path.join(wgsBasePath, f)).isDirectory());

		if (!targetFolder) {
			throw new Error('No valid WGS folder found.');
		}

		return path.join(wgsBasePath, targetFolder, 'containers.index');
	} catch (err) {
		console.error('Error finding containers.index:', err.message);
		process.exit(1);
	}
}

module.exports = {
	CONTAINERS_INDEX_PATH: getContainersIndexPath(),
	EXPORT_DIRECTORY: path.join(process.cwd(), 'exported_save_files'),
};
