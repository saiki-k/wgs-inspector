const fs = require('fs');
const path = require('path');

class ContainerScanner {
	constructor(filePath) {
		this.filePath = filePath;
		this.containerIndexBuffer = fs.readFileSync(filePath);
	}

	tryReadU32(offset) {
		if (offset + 4 > this.containerIndexBuffer.length) return [null, offset];
		const value = this.containerIndexBuffer.readUInt32LE(offset);
		return [value, offset + 4];
	}

	tryReadUTF16(offset, maxChars = 512) {
		const [length, afterLength] = this.tryReadU32(offset);

		if (length === null || length <= 0 || length > maxChars) {
			return [null, offset];
		}

		const stringEnd = afterLength + length * 2;

		if (stringEnd > this.containerIndexBuffer.length) {
			return [null, offset];
		}

		try {
			const str = this.containerIndexBuffer.toString('utf16le', afterLength, stringEnd).replace(/\0/g, '');
			return [str, stringEnd];
		} catch (e) {
			return [null, offset];
		}
	}

	tryReadGUID(offset, buffer = null) {
		const buf = buffer || this.containerIndexBuffer;
		if (offset + 16 > buf.length) return [null, offset];

		const bytes = buf.subarray(offset, offset + 16);
		const hex = bytes.toString('hex').toUpperCase();

		const guid = [
			hex.substring(6, 8) + hex.substring(4, 6) + hex.substring(2, 4) + hex.substring(0, 2),
			hex.substring(10, 12) + hex.substring(8, 10),
			hex.substring(14, 16) + hex.substring(12, 14),
			hex.substring(16, 20),
			hex.substring(20, 32),
		].join('-');

		return [guid, offset + 16];
	}

	parseHeader() {
		try {
			let offset = 0;

			const [version, off1] = this.tryReadU32(offset);
			if (version === null) return null;
			offset = off1;

			const [containerCount, off2] = this.tryReadU32(offset);
			if (containerCount === null) return null;
			offset = off2;

			const [unknown, off3] = this.tryReadU32(offset);
			offset = off3;

			const [packageName, off4] = this.tryReadUTF16(offset, 256);
			if (packageName === null) return null;
			offset = off4;

			const timestampBytes = this.containerIndexBuffer.subarray(offset, offset + 8);
			const timestamp = timestampBytes.readBigUInt64LE(0);
			offset += 8;

			const [secondCount, off5] = this.tryReadU32(offset);
			offset = off5;

			const [containerId, off6] = this.tryReadUTF16(offset, 128);

			return {
				version: version,
				container_count: containerCount,
				second_count: secondCount,
				unknown_field: unknown,
				package_name: packageName,
				timestamp: this.formatTimestamp(timestamp),
				container_id: containerId,
			};
		} catch (e) {
			return null;
		}
	}

	formatTimestamp(fileTime) {
		const EPOCH_DIFF = 116444736000000000n;
		const INTERVALS_PER_MS = 10000n;
		const unixTime = (fileTime - EPOCH_DIFF) / INTERVALS_PER_MS;
		return new Date(Number(unixTime)).toISOString();
	}

	parseContainerIndexFile() {
		const finalResult = {};

		const header = this.parseHeader();
		if (header) {
			finalResult.version = header.version;
			finalResult.container_count = header.container_count;
			finalResult.package_name = header.package_name;
			finalResult.timestamp = header.timestamp;
			finalResult.container_id = header.container_id;
		}

		const foundContainers = [];

		for (let candidateOffset = 0; candidateOffset < this.containerIndexBuffer.length - 64; candidateOffset++) {
			let currentPosition = candidateOffset;

			const [displayName, positionAfterName1] = this.tryReadUTF16(currentPosition);
			if (!displayName) continue;
			currentPosition = positionAfterName1;

			const [displayNameDup, positionAfterName2] = this.tryReadUTF16(currentPosition);
			if (displayNameDup === null) continue;
			currentPosition = positionAfterName2;

			const [hexIdentifier, positionAfterIdentifier] = this.tryReadUTF16(currentPosition);
			if (hexIdentifier === null) continue;
			currentPosition = positionAfterIdentifier;

			if (currentPosition + 5 > this.containerIndexBuffer.length) continue;
			const containerNumber = this.containerIndexBuffer.readUInt8(currentPosition);
			currentPosition += 5;

			const [containerGuid, positionAfterGuid] = this.tryReadGUID(currentPosition);
			if (!containerGuid) continue;

			if (hexIdentifier.startsWith('0x') || hexIdentifier.startsWith('"0x')) {
				foundContainers.push({
					offset: candidateOffset,
					display_name: displayName,
					identifier: hexIdentifier.replace(/"/g, ''),
					container_number: containerNumber,
					guid: containerGuid,
				});
			}
		}

		const seenOffsets = new Set();
		const uniqueContainers = foundContainers.filter((container) => {
			if (seenOffsets.has(container.offset)) return false;
			seenOffsets.add(container.offset);
			return true;
		});

		finalResult.entries = uniqueContainers.sort((a, b) => a.offset - b.offset);

		return finalResult;
	}

	parseContainerFiles(entries, baseDir) {
		const results = [];

		for (const entry of entries) {
			const folderName = entry.guid.toUpperCase().replace(/-/g, '');
			const containerDir = path.join(baseDir, folderName);

			if (!fs.existsSync(containerDir)) {
				results.push({
					...entry,
					container_data: null,
					error: `Folder not found: ${folderName}`,
				});
				continue;
			}

			const files = fs.readdirSync(containerDir);
			const containerFile = files.find((f) => f.startsWith('container.'));

			if (!containerFile) {
				results.push({
					...entry,
					container_data: null,
					error: 'No container file found in directory',
				});
				continue;
			}

			const containerPath = path.join(containerDir, containerFile);
			try {
				const containerBuffer = fs.readFileSync(containerPath);
				const parsed = this.parseContainerFile(containerBuffer);

				results.push({
					...entry,
					container_data: parsed,
				});
			} catch (err) {
				results.push({
					...entry,
					container_data: null,
					error: `Failed to parse: ${err.message}`,
				});
			}
		}

		return results;
	}

	parseContainerFile(buffer) {
		let offset = 0;

		if (buffer.length < 8) {
			return { raw_size: buffer.length, error: 'File too small' };
		}

		const version = buffer.readUInt32LE(offset);
		offset += 4;

		const fileCount = buffer.readUInt32LE(offset);
		offset += 4;

		const files = [];

		for (let i = 0; i < fileCount; i++) {
			const entryStart = offset;

			let filename = '';
			while (offset - entryStart < 128 && offset + 1 < buffer.length) {
				const charCode = buffer.readUInt16LE(offset);
				offset += 2;

				if (charCode === 0) {
					offset = entryStart + 128;
					break;
				}

				filename += String.fromCharCode(charCode);

				if (filename.length > 200) {
					return {
						version,
						file_count: fileCount,
						raw_size: buffer.length,
						error: `Filename ${i + 1} too long - possibly corrupt data`,
					};
				}
			}

			offset = entryStart + 128;

			let guid1 = null;
			let guid2 = null;

			if (offset + 32 <= buffer.length) {
				const [g1] = this.tryReadGUID(offset, buffer);
				guid1 = g1;
				offset += 16;

				const [g2] = this.tryReadGUID(offset, buffer);
				guid2 = g2;
				offset += 16;
			}

			files.push({
				filename: filename || null,
				guid: guid1,
				guid_duplicate: guid2,
			});
		}

		return {
			version,
			file_count: fileCount,
			files,
			total_size: buffer.length,
		};
	}

	exportSaveFiles(exportedDir = './exported_save_files') {
		const containerBaseDir = path.dirname(path.resolve(this.filePath));
		const resolvedExportedDir = path.resolve(exportedDir);

		if (!fs.existsSync(resolvedExportedDir)) {
			fs.mkdirSync(resolvedExportedDir);
		}

		const data = this.parseContainerIndexFile();
		const entries = this.parseContainerFiles(data.entries, containerBaseDir);

		const results = {
			exported: [],
			skipped: [],
			errors: [],
		};

		for (const entry of entries) {
			const containerName = entry.display_name.toLowerCase();
			const folderName = entry.guid.toUpperCase().replace(/-/g, '');
			const containerDir = path.join(containerBaseDir, folderName);

			if (!entry.container_data || !entry.container_data.files) {
				results.skipped.push({ container: containerName, reason: 'No file data' });
				continue;
			}

			for (const fileEntry of entry.container_data.files) {
				const filename = fileEntry.filename;
				if (!filename) continue;

				const fileGuid = fileEntry.guid.toUpperCase().replace(/-/g, '');
				const sourcePath = path.join(containerDir, fileGuid);

				if (!fs.existsSync(sourcePath)) {
					results.errors.push({ file: filename, reason: 'File not found' });
					continue;
				}

				let destPath;
				let displayName = filename;

				if (containerName === 'shareddata') {
					destPath = path.join(resolvedExportedDir, 'shared.dat');
					displayName = 'shared.dat';
				} else if (containerName.startsWith('restore')) {
					const restoreNum = containerName.replace('restore', '');

					if (filename.startsWith('user')) {
						destPath = path.join(resolvedExportedDir, filename);
					} else {
						const restorePointsDir = path.join(resolvedExportedDir, `Restore_Points${restoreNum}`);
						if (!fs.existsSync(restorePointsDir)) {
							fs.mkdirSync(restorePointsDir);
						}
						destPath = path.join(restorePointsDir, filename);
					}
				} else if (containerName.startsWith('save')) {
					destPath = path.join(resolvedExportedDir, filename);
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
					results.exported.push({ container: containerName, file: displayName, path: destPath });
				} catch (err) {
					results.errors.push({ file: filename, reason: err.message });
				}
			}
		}

		return results;
	}
}

module.exports = ContainerScanner;

if (require.main === module) {
	const config = require('./config');

	console.log('='.repeat(80));
	console.log('Windows Gaming Services - Container Scanner');
	console.log('='.repeat(80));
	console.log(`\nScanning file: ${config.CONTAINERS_INDEX_PATH}\n`);

	try {
		const scanner = new ContainerScanner(config.CONTAINERS_INDEX_PATH);

		const data = scanner.parseContainerIndexFile();
		const baseDir = path.dirname(path.resolve(config.CONTAINERS_INDEX_PATH));
		data.entries = scanner.parseContainerFiles(data.entries, baseDir);

		console.log('HEADER INFORMATION:');
		console.log('-'.repeat(80));
		if (data.version !== undefined) {
			console.log(`Version:          ${data.version}`);
			console.log(`Container Count:  ${data.container_count}`);
			console.log(`Package Name:     ${data.package_name}`);
			console.log(`Timestamp:        ${data.timestamp}`);
			console.log(`Container ID:     ${data.container_id}`);
		} else {
			console.log('(No header found)');
		}

		console.log('\n' + '='.repeat(80));
		console.log('CONTAINERS:');
		console.log('='.repeat(80));
		console.log(`\nFound ${data.entries.length} containers:\n`);

		data.entries.forEach((entry, index) => {
			console.log(`Container #${index + 1} (at offset 0x${entry.offset.toString(16)}):`);
			console.log(`  Display Name:     ${entry.display_name}`);
			console.log(`  Identifier:       ${entry.identifier}`);
			console.log(`  Container Number: ${entry.container_number}`);
			console.log(`  GUID:             ${entry.guid}`);
			if (entry.container_data) {
				console.log(`  Container Data:`);
				console.log(`    Version:        ${entry.container_data.version}`);
				console.log(`    File Count:     ${entry.container_data.file_count}`);
				console.log(`    Total Size:     ${entry.container_data.total_size} bytes`);
				if (entry.container_data.files) {
					entry.container_data.files.forEach((file, idx) => {
						console.log(`    File ${idx + 1}:`);
						console.log(`      Filename:     ${file.filename}`);
						console.log(`      GUID:         ${file.guid}`);
					});
				}
			} else if (entry.error) {
				console.log(`  Error:            ${entry.error}`);
			}
			console.log();
		});

		console.log('\n' + '='.repeat(80));
		console.log(`Exporting files into: ${config.EXPORT_DIRECTORY}`);
		const exportResults = scanner.exportSaveFiles(config.EXPORT_DIRECTORY);

		console.log(`\nExport results:`);
		console.log(`  Exported: ${exportResults.exported.length}`);
		console.log(`  Skipped:   ${exportResults.skipped.length}`);
		console.log(`  Errors:    ${exportResults.errors.length}`);

		if (exportResults.exported.length) {
			console.log('\nExported files:');
			exportResults.exported
				.sort((a, b) => a.path.localeCompare(b.path))
				.forEach((e) => {
					const relativePath = path.relative(path.resolve(config.EXPORT_DIRECTORY), e.path);
					console.log(`  - ${relativePath}`);
				});
		}

		if (exportResults.errors.length) {
			console.log('\nErrors:');
			exportResults.errors.slice(0, 10).forEach((e) => console.log(`  - ${e.file}: ${e.reason}`));
		}

		console.log('\n' + '='.repeat(80));
		console.log('Press Enter to exit...');
		process.stdin.once('data', () => {
			process.exit(0);
		});
	} catch (error) {
		console.error(`Error scanning file: ${error.message}`);
		console.error(error.stack);
		console.log('\nPress Enter to exit...');
		process.stdin.once('data', () => {
			process.exit(1);
		});
	}
}
