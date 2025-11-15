const genericExporter = require('./generic');
const hollowKnightExporter = require('./hollowKnight');

/**
 * Map of package names to their exporter modules
 * Add new game exporters here
 */
const PACKAGE_EXPORTER_MAP = {
	'TeamCherry.HollowKnightSilksong_y4jvztpgccj42': hollowKnightExporter, // Hollow Knight: Silksong
	'TeamCherry.15373CD61C66B_y4jvztpgccj42': hollowKnightExporter, // Hollow Knight
};

/**
 * Get exporter for a package
 * @param {string} packageName - Full package name
 * @returns {Object} Exporter module (returns generic exporter if no specific exporter exists)
 */
function getExporter(packageName) {
	return PACKAGE_EXPORTER_MAP[packageName] || genericExporter;
}

/**
 * Check if an exporter exists for a package
 * @param {string} packageName - Full package name
 * @returns {boolean} True if exporter exists
 */
function hasExporter(packageName) {
	return packageName in PACKAGE_EXPORTER_MAP;
}

module.exports = {
	getExporter,
	hasExporter,
	PACKAGE_EXPORTER_MAP,
};
