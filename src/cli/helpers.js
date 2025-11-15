const path = require('path');
const Table = require('cli-table3');
const chalk = require('chalk');
const inquirer = require('inquirer');

function formatSize(bytes) {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function displayPackagesTable(packages) {
	if (packages.length === 0) {
		console.log(chalk.yellow('\nNo WGS packages found.'));
		return;
	}

	const table = new Table({
		head: [chalk.cyan('Package'), chalk.cyan('Containers')],
		colWidths: [60, 12],
		wordWrap: true,
	});

	packages.forEach((pkg, index) => {
		const row = [pkg.packageName, pkg.error ? chalk.red('Error') : pkg.containerCount];
		table.push(row);
	});

	console.log('\n' + table.toString());
}

function displayContainerSummaryTable(containers) {
	if (!containers || containers.length === 0) {
		console.log(chalk.yellow('\nNo containers found.'));
		return;
	}

	const table = new Table({
		head: [chalk.cyan('Container'), chalk.cyan('Folder (on disk)'), chalk.cyan('Files')],
		colWidths: [20, 35, 8],
	});

	containers.forEach((container, index) => {
		const fileCount = container.containerData?.fileCount || 0;
		const folderName = container.folderName || container.guid.toUpperCase().replace(/-/g, '');

		table.push([
			container.displayName,
			chalk.gray(folderName),
			fileCount > 0 ? chalk.green(fileCount) : chalk.red('0'),
		]);
	});

	console.log(chalk.bold('\n📁 Containers:'));
	console.log(table.toString());
}

function displayContainerFilesTable(containers) {
	if (!containers || containers.length === 0) {
		console.log(chalk.yellow('\nNo containers found.'));
		return;
	}

	const table = new Table({
		head: [chalk.cyan('Container'), chalk.cyan('File'), chalk.cyan('File (on disk)'), chalk.cyan('Size')],
		colWidths: [20, 25, 35, 12],
	});

	let totalFiles = 0;
	for (const container of containers) {
		if (!container.containerData || !container.containerData.files) {
			continue;
		}

		for (const file of container.containerData.files) {
			const fileName = file.fileGuid || file.guid.toUpperCase().replace(/-/g, '');
			table.push([
				chalk.gray(container.displayName),
				file.filename || chalk.gray('(no name)'),
				chalk.gray(fileName),
				file.size ? chalk.green(formatSize(file.size)) : chalk.red('0 B'),
			]);
			totalFiles++;
		}
	}

	if (totalFiles === 0) {
		console.log(chalk.yellow('No files found in any container.'));
		return;
	}

	console.log(chalk.bold('\n📄 Container Files:'));
	console.log(table.toString());
}

async function promptPackageSelection(packages) {
	const choices = packages.map((pkg, index) => ({
		name: `${pkg.packageName} (${pkg.containerCount} containers)`,
		value: index,
	}));

	const { packageIndex } = await inquirer.prompt([
		{
			type: 'list',
			name: 'packageIndex',
			message: 'Select a package to scan:',
			choices,
		},
	]);

	return packages[packageIndex];
}

async function promptExportConfirmation(availableExporter, genericExporter) {
	const { shouldExport } = await inquirer.prompt([
		{
			type: 'confirm',
			name: 'shouldExport',
			message: 'Do you want to export these files?',
			default: true,
		},
	]);

	if (!shouldExport || !availableExporter) {
		return { shouldExport, useExporter: false };
	}

	// If the available exporter is already generic, skip the choice
	if (availableExporter.name === genericExporter.name) {
		return {
			shouldExport: true,
			useExporter: true,
			exportMethod: 'generic',
		};
	}

	const exporterName = availableExporter.name;
	const exporterColor = availableExporter.color || 'cyan';
	const genericName = genericExporter.name;
	const genericColor = genericExporter.color || 'yellow';

	const { exportMethod } = await inquirer.prompt([
		{
			type: 'list',
			name: 'exportMethod',
			message: 'How would you like to export these files?',
			choices: [
				{
					name: `Use ${chalk[exporterColor](exporterName)} exporter`,
					value: 'exporter',
				},
				{
					name: `Use ${chalk[genericColor](genericName)} exporter`,
					value: 'generic',
				},
				{
					name: 'Cancel export',
					value: 'cancel',
				},
			],
			default: 'exporter',
		},
	]);

	if (exportMethod === 'cancel') {
		return { shouldExport: false, useExporter: false, exportMethod: null };
	}

	return {
		shouldExport: true,
		useExporter: true,
		exportMethod: exportMethod,
	};
}

async function promptExportDestination(defaultPath) {
	const relativePath = path.relative(process.cwd(), defaultPath) || defaultPath;
	const { exportPath } = await inquirer.prompt([
		{
			type: 'input',
			name: 'exportPath',
			message: 'Enter export destination:',
			default: relativePath,
		},
	]);

	return path.resolve(exportPath);
}

function displayExportResults(results) {
	console.log(chalk.bold('\n' + '='.repeat(80)));
	console.log(chalk.bold('Export Results:'));
	console.log('='.repeat(80));

	console.log(chalk.green(`✓ Exported:  ${results.exported.length}`));
	console.log(chalk.yellow(`⊘ Skipped:   ${results.skipped.length}`));
	console.log(chalk.red(`✗ Errors:    ${results.errors.length}`));

	if (results.exported.length > 0) {
		console.log(chalk.bold('\nExported files:'));
		results.exported.forEach((e) => {
			console.log(chalk.green(`  ✓ ${e.relativePath}`));
		});
	}

	if (results.skipped.length > 0) {
		console.log(chalk.bold('\nSkipped:'));
		results.skipped.slice(0, 10).forEach((e) => {
			console.log(chalk.yellow(`  ⊘ ${e.container}/${e.file}: ${e.reason}`));
		});
	}

	if (results.errors.length > 0) {
		console.log(chalk.bold('\nErrors:'));
		results.errors.slice(0, 10).forEach((e) => {
			console.log(chalk.red(`  ✗ ${e.file}: ${e.reason}`));
		});
	}

	console.log('\n' + '='.repeat(80));
}

module.exports = {
	formatSize,
	displayPackagesTable,
	displayContainerSummaryTable,
	displayContainerFilesTable,
	promptPackageSelection,
	promptExportConfirmation,
	promptExportDestination,
	displayExportResults,
};
