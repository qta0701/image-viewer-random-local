const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '../package.json');

try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const currentVersion = packageJson.version;
    const versionParts = currentVersion.split('.');

    // Increment patch version
    versionParts[2] = parseInt(versionParts[2]) + 1;
    const newVersion = versionParts.join('.');

    packageJson.version = newVersion;

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log(`Version incremented: ${currentVersion} -> ${newVersion}`);
} catch (error) {
    console.error('Failed to increment version:', error);
    process.exit(1);
}
