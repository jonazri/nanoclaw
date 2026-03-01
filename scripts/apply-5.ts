import fs from 'fs';
import path from 'path';
import { initNanoclawDir } from '../skills-engine/init.js';
import { readManifest } from '../skills-engine/manifest.js';
import { replaySkills, findSkillDir } from '../skills-engine/replay.js';

const first5 = ['reactions', 'refresh-oauth', 'auth-recovery', 'group-lifecycle', 'google-home'];
const skillDirs: Record<string, string> = {};
for (const name of first5) {
  const dir = findSkillDir(name);
  if (!dir) { console.error('Not found: ' + name); process.exit(1); }
  skillDirs[name] = dir;
}
initNanoclawDir();
async function run() {
  const result = await replaySkills({ skills: first5, skillDirs });
  if (!result.success) {
    console.error('FAILED:', result.error);
    process.exit(1);
  }
  console.log('OK - first 5 skills applied');
}
run();
