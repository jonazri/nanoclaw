import fs from 'fs';
import path from 'path';

import { initNanoclawDir } from '../skills-engine/init.js';
import { readManifest } from '../skills-engine/manifest.js';
import { replaySkills, findSkillDir } from '../skills-engine/replay.js';

const INSTALLED = path.join(process.cwd(), '.nanoclaw', 'installed-skills.yaml');
const yaml = fs.readFileSync(INSTALLED, 'utf-8');
const skills = yaml.match(/^\s+-\s+(.+)$/gm)?.map(l => l.trim().replace(/^-\s+/, '')) ?? [];

console.log(`Skills to apply: ${skills.join(', ')}`);

// Initialize base
initNanoclawDir();

// Build skillDirs map
const skillDirs: Record<string, string> = {};
for (const name of skills) {
  const dir = findSkillDir(name);
  if (!dir) {
    console.error(`Cannot find skill dir for: ${name}`);
    process.exit(1);
  }
  skillDirs[name] = dir;
}

// Apply one at a time
async function run() {
  for (let i = 0; i < skills.length; i++) {
    const subset = skills.slice(0, i + 1);
    console.log(`\n--- Applying skill ${i+1}/${skills.length}: ${skills[i]} ---`);
    
    const result = await replaySkills({
      skills: subset,
      skillDirs,
    });
    
    if (!result.success) {
      console.error(`FAILED at skill: ${skills[i]}`);
      console.error(`Conflicts: ${result.mergeConflicts?.join(', ')}`);
      console.error(`Error: ${result.error}`);
      
      const manifest = readManifest(skillDirs[skills[i]]);
      console.error(`Skill modifies: ${manifest.modifies.join(', ')}`);
      process.exit(1);
    }
    
    console.log(`OK: ${skills[i]}`);
  }
  
  console.log('\n=== All skills applied successfully ===');
}

run();
