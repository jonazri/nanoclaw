import fs from 'fs';

import { defineConfig } from 'vitest/config';

const appliedSkills = (process.env.APPLIED_SKILLS || '').split(',').filter(Boolean);

const include = appliedSkills.length > 0
  ? appliedSkills.map((s) => `.claude/skills/${s}/tests/*.test.ts`)
  : ['.claude/skills/**/tests/*.test.ts'];

// Warn when no test files exist for the applied skills (visible in CI logs)
if (appliedSkills.length > 0) {
  const hasTests = appliedSkills.some((s) => {
    const testDir = `.claude/skills/${s}/tests`;
    return fs.existsSync(testDir) && fs.readdirSync(testDir).some((f) => f.endsWith('.test.ts'));
  });
  if (!hasTests) {
    console.warn(`⚠ No test files found for applied skills: ${appliedSkills.join(', ')}`);
  }
}

export default defineConfig({
  test: {
    include,
    passWithNoTests: true,
  },
});
