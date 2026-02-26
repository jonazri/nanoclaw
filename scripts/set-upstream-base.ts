import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { BASE_DIR, BASE_INCLUDES } from '../skills-engine/constants.js';

const projectRoot = process.cwd();
const baseDir = path.join(projectRoot, BASE_DIR);

function copyFromUpstream(relPath: string): void {
  const destPath = path.join(baseDir, relPath);
  try {
    const content = execSync(`git show upstream/main:${relPath}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('does not exist') || msg.includes('not found')) {
      // File doesn't exist in upstream — expected, skip silently
    } else {
      console.warn(`Warning: failed to copy ${relPath} from upstream: ${msg}`);
    }
  }
}

function walkUpstream(dirPath: string): void {
  let listing: string;
  try {
    listing = execSync(`git ls-tree -r --name-only upstream/main ${dirPath}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('not found') && !msg.includes('does not exist')) {
      console.warn(`Warning: failed to list upstream directory ${dirPath}: ${msg}`);
    }
    return;
  }
  for (const line of listing.trim().split('\n')) {
    if (line) copyFromUpstream(line);
  }
}

// Clean existing base
if (fs.existsSync(baseDir)) {
  fs.rmSync(baseDir, { recursive: true, force: true });
}
fs.mkdirSync(baseDir, { recursive: true });

for (const include of BASE_INCLUDES) {
  if (include.endsWith('/')) {
    walkUpstream(include);
  } else {
    copyFromUpstream(include);
  }
}

console.log('Base set to upstream/main');
