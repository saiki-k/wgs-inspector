const { copyFileSync, mkdirSync } = require('fs');
const { execSync } = require('child_process');
const path = require('path');

console.log('Building single executable application...\n');

// Ensure build directory exists
const buildDir = path.join(__dirname, '..', 'build');
mkdirSync(buildDir, { recursive: true });

const outputExePath = path.join(buildDir, 'silksong-wgs-exporter.exe');
const blobFilePath = path.join(buildDir, 'sea-prep.blob');
const seaConfigPath = path.join(__dirname, '..', 'sea-config.json');

console.log('1. Generating SEA blob...');
execSync(`node --experimental-sea-config "${seaConfigPath}"`, { stdio: 'inherit' });

console.log('2. Copying Node.js executable...');
copyFileSync(process.execPath, outputExePath);

console.log('3. Injecting application code...');
execSync(
	`npx postject "${outputExePath}" NODE_SEA_BLOB "${blobFilePath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`,
	{ stdio: 'inherit' }
);

console.log(`\n✅ Build complete! Created ${path.relative(process.cwd(), outputExePath)}`);
