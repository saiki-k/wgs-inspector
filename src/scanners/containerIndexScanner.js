const fs = require('fs');

class ContainerIndexScanner {
	constructor(filePath) {
		this.filePath = filePath;
		this.buffer = fs.readFileSync(filePath);
	}

	tryReadU32(offset) {
		if (offset + 4 > this.buffer.length) return [null, offset];
		const value = this.buffer.readUInt32LE(offset);
		return [value, offset + 4];
	}

	tryReadUTF16(offset, maxChars = 512) {
		const [length, afterLength] = this.tryReadU32(offset);

		if (length === null || length <= 0 || length > maxChars) {
			return [null, offset];
		}

		const stringEnd = afterLength + length * 2;

		if (stringEnd > this.buffer.length) {
			return [null, offset];
		}

		try {
			const str = this.buffer.toString('utf16le', afterLength, stringEnd).replace(/\0/g, '');
			return [str, stringEnd];
		} catch (err) {
			return [null, offset];
		}
	}

	tryReadGUID(offset) {
		if (offset + 16 > this.buffer.length) return [null, offset];

		const bytes = this.buffer.subarray(offset, offset + 16);
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

			const timestampBytes = this.buffer.subarray(offset, offset + 8);
			const timestamp = timestampBytes.readBigUInt64LE(0);
			offset += 8;

			const [secondCount, off5] = this.tryReadU32(offset);
			offset = off5;

			const [containerId, off6] = this.tryReadUTF16(offset, 128);

			return {
				version: version,
				containerCount: containerCount,
				secondCount: secondCount,
				unknownField: unknown,
				packageName: packageName,
				timestamp: this.formatTimestamp(timestamp),
				containerId: containerId,
			};
		} catch (err) {
			return null;
		}
	}

	formatTimestamp(fileTime) {
		const EPOCH_DIFF = 116444736000000000n;
		const INTERVALS_PER_MS = 10000n;
		const unixTime = (fileTime - EPOCH_DIFF) / INTERVALS_PER_MS;
		return new Date(Number(unixTime)).toISOString();
	}

	parse() {
		const result = {};

		const header = this.parseHeader();
		if (header) {
			result.version = header.version;
			result.containerCount = header.containerCount;
			result.packageName = header.packageName;
			result.timestamp = header.timestamp;
			result.containerId = header.containerId;
		}

		const foundContainers = [];

		for (let candidateOffset = 0; candidateOffset < this.buffer.length - 64; candidateOffset++) {
			const container = this.parseContainerEntry(candidateOffset);
			if (container) {
				foundContainers.push(container);
			}
		}

		const seenGuids = new Set();
		const uniqueContainers = foundContainers.filter((container) => {
			if (seenGuids.has(container.guid)) return false;
			seenGuids.add(container.guid);
			return true;
		});

		result.entries = uniqueContainers.sort((a, b) => a.offset - b.offset);

		return result;
	}

	parseContainerEntry(offset) {
		let currentPosition = offset;

		const [displayName, positionAfterName] = this.tryReadUTF16(currentPosition);
		if (!displayName) return null;
		currentPosition = positionAfterName;

		// Try different container entry formats
		const formats = [
			this.parseContainerEntryFormatWithNameDup.bind(this),
			this.parseContainerEntryFormatWithPadding.bind(this),
		];

		let hexIdentifier = null;
		let positionAfterIdentifier = currentPosition;

		for (const formatParser of formats) {
			const result = formatParser(currentPosition);
			if (result) {
				hexIdentifier = result.identifier;
				positionAfterIdentifier = result.position;
				break;
			}
		}

		if (!hexIdentifier) return null;
		currentPosition = positionAfterIdentifier;

		if (currentPosition + 5 > this.buffer.length) return null;
		const containerNumber = this.buffer.readUInt8(currentPosition);
		currentPosition += 5;

		const [containerGuid, positionAfterGuid] = this.tryReadGUID(currentPosition);
		if (!containerGuid) return null;

		return {
			offset: offset,
			displayName: displayName,
			identifier: hexIdentifier.replace(/"/g, ''),
			containerNumber: containerNumber,
			guid: containerGuid,
		};
	}

	parseContainerEntryFormatWithNameDup(offset) {
		// Format: displayName → displayNameDup → hexIdentifier (Silksong format)
		const [displayNameDup, positionAfterName2] = this.tryReadUTF16(offset);
		if (displayNameDup === null) return null;

		const [hexId, posAfterHex] = this.tryReadUTF16(positionAfterName2);
		if (hexId === null || !(hexId.startsWith('0x') || hexId.startsWith('"0x'))) return null;

		return {
			identifier: hexId,
			position: posAfterHex,
		};
	}

	parseContainerEntryFormatWithPadding(offset) {
		// Format: displayName → padding (00 00 00 00) → hexIdentifier (Hollow Knight format)
		let paddingPosition = offset;

		if (paddingPosition + 4 <= this.buffer.length) {
			const paddingBytes = this.buffer.readUInt32LE(paddingPosition);
			if (paddingBytes === 0) {
				paddingPosition += 4;
			}
		}

		const [hexId, posAfterHex] = this.tryReadUTF16(paddingPosition);
		if (hexId === null || !(hexId.startsWith('0x') || hexId.startsWith('"0x'))) return null;

		return {
			identifier: hexId,
			position: posAfterHex,
		};
	}
}

module.exports = ContainerIndexScanner;
