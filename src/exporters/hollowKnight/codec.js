const crypto = require('crypto');

const CSHARP_HEADER = Buffer.from([0, 1, 0, 0, 0, 255, 255, 255, 255, 1, 0, 0, 0, 0, 0, 0, 0, 6, 1, 0, 0, 0]);
const AES_KEY_STRING = 'UKu52ePUBwetZ9wNX88o54dnfKRu0T1l';

function removeHeader(bytes) {
	const bytesWithoutHeader = bytes.subarray(CSHARP_HEADER.length, bytes.length - 1);

	let counter = 0;
	for (let i = 0; i < 5; i++) {
		counter++;
		if ((bytesWithoutHeader[i] & 0x80) === 0) break;
	}
	return bytesWithoutHeader.subarray(counter);
}

function addHeader(base64Bytes) {
	const lenBytes = [];
	let length = Math.min(0x7fffffff, base64Bytes.length);
	for (let i = 0; i < 4; i++) {
		if (length >> 7 !== 0) {
			lenBytes.push((length & 0x7f) | 0x80);
			length >>= 7;
		} else {
			lenBytes.push(length & 0x7f);
			break;
		}
	}

	const newBytes = Buffer.alloc(CSHARP_HEADER.length + lenBytes.length + base64Bytes.length + 1);
	CSHARP_HEADER.copy(newBytes, 0);
	Buffer.from(lenBytes).copy(newBytes, CSHARP_HEADER.length);
	base64Bytes.copy(newBytes, CSHARP_HEADER.length + lenBytes.length);
	newBytes[newBytes.length - 1] = 0x0b;
	return newBytes;
}

function decodeData(fileBytes) {
	const bytesWithoutHeader = removeHeader(fileBytes);
	const base64String = bytesWithoutHeader.toString('utf8');
	const encryptedBytes = Buffer.from(base64String, 'base64');
	const decipher = crypto.createDecipheriv('aes-256-ecb', Buffer.from(AES_KEY_STRING, 'utf8'), null);
	decipher.setAutoPadding(true);
	const decrypted = Buffer.concat([decipher.update(encryptedBytes), decipher.final()]);
	return decrypted.toString('utf8');
}

function encodeData(jsonString) {
	const cipher = crypto.createCipheriv('aes-256-ecb', Buffer.from(AES_KEY_STRING, 'utf8'), null);
	cipher.setAutoPadding(true);
	const encrypted = Buffer.concat([cipher.update(Buffer.from(jsonString, 'utf8')), cipher.final()]);
	const base64String = encrypted.toString('base64');
	const base64Bytes = Buffer.from(base64String, 'utf8');
	return addHeader(base64Bytes);
}

module.exports = {
	decodeData,
	encodeData,
	CSHARP_HEADER,
};
