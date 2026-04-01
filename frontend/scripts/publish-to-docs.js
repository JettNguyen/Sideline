// This file is for GitHub pages deployment

const fs = require('fs');
const path = require('path');

const frontendDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(frontendDir, '..');
const buildDir = path.join(frontendDir, 'build');
const docsDir = path.join(repoRoot, 'docs');

if (!fs.existsSync(buildDir)) {
  throw new Error(`Build directory not found: ${buildDir}`);
}

if (fs.existsSync(docsDir)) {
  fs.rmSync(docsDir, { recursive: true, force: true });
}

fs.cpSync(buildDir, docsDir, { recursive: true });

const indexPath = path.join(docsDir, 'index.html');
const notFoundPath = path.join(docsDir, '404.html');

if (fs.existsSync(indexPath)) {
  fs.copyFileSync(indexPath, notFoundPath);
}

console.log(`Published frontend build to ${docsDir}`);
