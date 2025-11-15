const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { scanWGSPackages, scanPackageContainers } = require('../scanners');
const { getExporter } = require('../exporters');
const {
	displayPackagesTable,
	displayContainerSummaryTable,
	displayContainerFilesTable,
	promptPackageSelection,
	promptExportConfirmation,
	promptExportDestination,
	displayExportResults,
} = require('./helpers');

async function runCLI() {
	console.log(chalk.bold.cyan('\n' + '='.repeat(80)));
	console.log(chalk.bold.cyan("Windows Gaming Services - Save Files' Inspector & Exporter"));
	console.log(chalk.bold.cyan('='.repeat(80)));

	try {
		const { packages, basePath } = scanWGSPackages();
		console.log(chalk.bold(`\n🔍 Scanning for WGS packages in: ${chalk.gray(basePath)}`));

		if (packages.length === 0) {
			console.log(chalk.red('\n✗ No WGS packages found.'));
			console.log(chalk.yellow('Make sure you have Game Pass games installed.'));
			waitForExit();
			return;
		}

		console.log(chalk.green(`\n✓ Found ${packages.length} package(s) with WGS data`));
		displayPackagesTable(packages);

		const selectedPackage = await promptPackageSelection(packages);
		const packagePath = path.join(basePath, selectedPackage.packageName);
		console.log(chalk.bold(`\n📦 Selected: ${chalk.cyan(packagePath)}`));

		const containerFolder = path.dirname(selectedPackage.containersIndexPath);
		const shortPath = path.relative(packagePath, containerFolder);
		console.log(chalk.bold(`\n🔍 Scanning containers in: ${chalk.gray(shortPath)}`));
		const scanData = scanPackageContainers(selectedPackage.containersIndexPath);

		if (!scanData.entries || scanData.entries.length === 0) {
			console.log(chalk.red('\n✗ No containers found in this package.'));
			waitForExit();
			return;
		}

		console.log(chalk.green(`\n✓ Found ${scanData.entries.length} container(s)`));
		displayContainerSummaryTable(scanData.entries);

		displayContainerFilesTable(scanData.entries);

		const availableExporter = getExporter(selectedPackage.packageName);
		const genericExporter = getExporter('generic');
		const { shouldExport, useExporter, exportMethod } = await promptExportConfirmation(
			availableExporter,
			genericExporter
		);

		if (!shouldExport) {
			console.log(chalk.yellow('\n⊘ Export cancelled.'));
			waitForExit();
			return;
		}

		let exporter = null;

		if (useExporter) {
			const exporterModule = exportMethod === 'generic' ? genericExporter : availableExporter;
			exporter = exporterModule.exporter;

			const exporterName = exporterModule.name;
			const exporterColor = exporterModule.color || 'green';
			console.log(chalk.bold.green(`\n✓ Using ${chalk[exporterColor](exporterName)} exporter`));
		}

		const defaultExportPath = path.join(process.cwd(), 'exported_save_files');
		const exportPath = await promptExportDestination(defaultExportPath);

		console.log(chalk.bold(`\n📤 Exporting to: ${chalk.cyan(exportPath)}`));

		const results = {
			exported: [],
			skipped: [],
			errors: [],
		};

		if (!fs.existsSync(exportPath)) {
			fs.mkdirSync(exportPath, { recursive: true });
		}

		const resolvedExportPath = path.resolve(exportPath);
		const exportResult = exporter(scanData, resolvedExportPath, results);

		displayExportResults(exportResult);

		if (exportResult.exported.length > 0) {
			console.log(chalk.bold.green(`\n✓ Export complete! Files saved to: ${exportPath}`));
		} else {
			console.log(chalk.bold.yellow('\n● No files were exported.'));
		}

		waitForExit();
	} catch (error) {
		console.error(chalk.red(`\n✗ Error: ${error.message}`));
		console.error(chalk.gray(error.stack));
		waitForExit();
		process.exit(1);
	}
}

function waitForExit() {
	console.log(chalk.gray('\nPress Enter to exit...'));
	process.stdin.setRawMode(false);
	process.stdin.resume();
	process.stdin.once('data', () => {
		process.exit(0);
	});
}

module.exports = { runCLI };
