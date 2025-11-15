const fs = require('fs');

class ContainerScanner {
	tryReadGUID(offset, buffer) {
		if (offset + 16 > buffer.length) return [null, offset];

		const bytes = buffer.subarray(offset, offset + 16);
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

	parse(filePath) {
		const buffer = fs.readFileSync(filePath);
		let offset = 0;

		if (buffer.length < 8) {
			return { rawSize: buffer.length, error: 'File too small' };
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
						fileCount: fileCount,
						rawSize: buffer.length,
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
				guidDuplicate: guid2,
			});
		}

		return {
			version,
			fileCount: fileCount,
			files,
			totalSize: buffer.length,
		};
	}
}

module.exports = ContainerScanner;
