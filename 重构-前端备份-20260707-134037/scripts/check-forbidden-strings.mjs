import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN_STRINGS = ['skin' + 'StationApi'];

const ROOT_DIR = process.cwd();
const ALLOWED_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.vue', '.json', '.yml', '.yaml'
]);

const SKIP_DIRS = new Set([
  '.git',
  '.idea',
  '.vscode',
  '.cursor',
  'node_modules',
  'dist',
  'coverage',
  'build'
]);

function shouldScanFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

function walk(dirPath, outFiles) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      walk(fullPath, outFiles);
      continue;
    }

    if (entry.isFile() && shouldScanFile(fullPath)) {
      outFiles.push(fullPath);
    }
  }
}

function findForbiddenHits(filePath, text) {
  const lines = text.split(/\r?\n/);
  const hits = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    for (const forbidden of FORBIDDEN_STRINGS) {
      if (line.includes(forbidden)) {
        hits.push({
          filePath,
          lineNumber: i + 1,
          forbidden,
          line: line.trim()
        });
      }
    }
  }

  return hits;
}

function main() {
  const files = [];
  walk(ROOT_DIR, files);

  const allHits = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const hits = findForbiddenHits(file, content);
    allHits.push(...hits);
  }

  if (allHits.length === 0) {
    console.log('✅ Forbidden string check passed.');
    process.exit(0);
  }

  console.error('❌ Forbidden string detected:');

  for (const hit of allHits) {
    const relativePath = path.relative(ROOT_DIR, hit.filePath).replace(/\\/g, '/');
    console.error(`- ${relativePath}:${hit.lineNumber} contains "${hit.forbidden}"`);
    if (hit.line) {
      console.error(`  ${hit.line}`);
    }
  }

  process.exit(1);
}

main();
