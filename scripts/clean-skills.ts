#!/usr/bin/env npx tsx
/**
 * Restore src/ and container/ to clean upstream state by resetting to .nanoclaw/base/.
 *
 * Removes all files added by skills and restores all modified files from the
 * base snapshot. Also restores package.json and runs npm install.
 *
 * Usage:
 *   npx tsx scripts/clean-skills.ts [--force]
 *
 * Options:
 *   --force  Skip the uncommitted-changes safety check
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { readState, writeState } from '../skills-engine/state.js';
import { readManifest } from '../skills-engine/manifest.js';
import { findSkillDir } from '../skills-engine/replay.js';
import { BASE_DIR, NANOCLAW_DIR } from '../skills-engine/constants.js';

const projectRoot = process.cwd();
const force = process.argv.includes('--force');

// 1. Read state to find applied skills
const state = readState();

if (state.applied_skills.length === 0) {
  console.log('No skills currently applied.');
  process.exit(0);
}

// 2. Check for uncommitted changes in src/ and container/
if (!force) {
  try {
    execSync('git diff --quiet HEAD -- src/ container/', {
      cwd: projectRoot,
      stdio: 'pipe',
    });
  } catch {
    console.error(
      'Error: Uncommitted changes detected in src/ or container/.',
    );
    console.error('Commit or stash your changes first, or use --force to override.');
    process.exit(1);
  }
}

// 3. Collect all adds and modifies from each applied skill's manifest
const deleted: string[] = [];
const restored: string[] = [];
const errors: string[] = [];

for (const skill of state.applied_skills) {
  const skillDir = findSkillDir(skill.name, projectRoot);
  if (!skillDir) {
    errors.push(`Skill directory not found for: ${skill.name} (skipping)`);
    continue;
  }

  let manifest;
  try {
    manifest = readManifest(skillDir);
  } catch (err) {
    errors.push(
      `Failed to read manifest for ${skill.name}: ${err instanceof Error ? err.message : String(err)}`,
    );
    continue;
  }

  // 4. Delete files that were added by the skill
  for (const relPath of manifest.adds) {
    const fullPath = path.join(projectRoot, relPath);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
        deleted.push(relPath);

        // Clean up empty parent directories
        let dir = path.dirname(fullPath);
        while (dir !== projectRoot) {
          const entries = fs.readdirSync(dir);
          if (entries.length === 0) {
            fs.rmdirSync(dir);
            dir = path.dirname(dir);
          } else {
            break;
          }
        }
      } catch (err) {
        errors.push(
          `Failed to delete ${relPath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // 5. Restore files that were modified by the skill from base
  for (const relPath of manifest.modifies) {
    const basePath = path.join(projectRoot, BASE_DIR, relPath);
    const currentPath = path.join(projectRoot, relPath);

    if (fs.existsSync(basePath)) {
      try {
        fs.mkdirSync(path.dirname(currentPath), { recursive: true });
        fs.copyFileSync(basePath, currentPath);
        restored.push(relPath);
      } catch (err) {
        errors.push(
          `Failed to restore ${relPath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      errors.push(`Base file not found for ${relPath} -- cannot restore`);
    }
  }
}

// 6. Restore package.json from base and run npm install
const basePkgPath = path.join(projectRoot, BASE_DIR, 'package.json');
const currentPkgPath = path.join(projectRoot, 'package.json');

if (fs.existsSync(basePkgPath)) {
  try {
    fs.copyFileSync(basePkgPath, currentPkgPath);
    if (!restored.includes('package.json')) {
      restored.push('package.json');
    }

    console.log('Running npm install to restore dependencies...');
    execSync('npm install --silent', {
      cwd: projectRoot,
      stdio: 'inherit',
    });
  } catch (err) {
    errors.push(
      `Failed to restore package.json or run npm install: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// 7. Reset state.yaml to empty applied_skills
writeState({
  ...state,
  applied_skills: [],
});

// 8. Print summary
console.log('\n=== Clean Skills Summary ===');

if (deleted.length > 0) {
  console.log(`\nDeleted ${deleted.length} skill-added file(s):`);
  for (const f of deleted) {
    console.log(`  - ${f}`);
  }
}

if (restored.length > 0) {
  console.log(`\nRestored ${restored.length} file(s) from base:`);
  for (const f of restored) {
    console.log(`  - ${f}`);
  }
}

if (errors.length > 0) {
  console.log(`\nWarnings/errors (${errors.length}):`);
  for (const e of errors) {
    console.warn(`  ! ${e}`);
  }
}

if (deleted.length === 0 && restored.length === 0) {
  console.log('\nNo files needed cleaning.');
}

console.log('\nState reset: applied_skills cleared.');
