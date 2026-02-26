import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { stringify } from 'yaml';

import {
  computeOverlapMatrix,
  extractOverlapInfo,
  generateMatrix,
  type SkillOverlapInfo,
} from '../../scripts/generate-ci-matrix.js';
import { SkillManifest } from '../types.js';
import { createTempDir, cleanup } from './test-helpers.js';

function makeManifest(overrides: Partial<SkillManifest> & { skill: string }): SkillManifest {
  return {
    version: '1.0.0',
    description: 'Test skill',
    core_version: '1.0.0',
    adds: [],
    modifies: [],
    conflicts: [],
    depends: [],
    ...overrides,
  };
}

describe('ci-matrix', () => {
  describe('computeOverlapMatrix', () => {
    it('detects overlap from shared modifies entries', () => {
      const skills: SkillOverlapInfo[] = [
        { name: 'telegram', skill: 'telegram', modifies: ['src/config.ts', 'src/index.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: [] },
        { name: 'discord', skill: 'discord', modifies: ['src/config.ts', 'src/router.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: [] },
      ];

      const matrix = computeOverlapMatrix(skills);

      expect(matrix).toHaveLength(1);
      expect(matrix[0].skills).toEqual(['telegram', 'discord']);
      expect(matrix[0].reason).toContain('shared modifies');
      expect(matrix[0].reason).toContain('src/config.ts');
    });

    it('returns no entry for non-overlapping skills', () => {
      const skills: SkillOverlapInfo[] = [
        { name: 'telegram', skill: 'telegram', modifies: ['src/telegram.ts'], npmDependencies: ['grammy'], conflicts: [], depends: [], incompatible_with: [] },
        { name: 'discord', skill: 'discord', modifies: ['src/discord.ts'], npmDependencies: ['discord.js'], conflicts: [], depends: [], incompatible_with: [] },
      ];

      const matrix = computeOverlapMatrix(skills);

      expect(matrix).toHaveLength(0);
    });

    it('detects overlap from shared npm dependencies', () => {
      const skills: SkillOverlapInfo[] = [
        { name: 'skill-a', skill: 'skill-a', modifies: ['src/a.ts'], npmDependencies: ['lodash', 'zod'], conflicts: [], depends: [], incompatible_with: [] },
        { name: 'skill-b', skill: 'skill-b', modifies: ['src/b.ts'], npmDependencies: ['zod', 'express'], conflicts: [], depends: [], incompatible_with: [] },
      ];

      const matrix = computeOverlapMatrix(skills);

      expect(matrix).toHaveLength(1);
      expect(matrix[0].skills).toEqual(['skill-a', 'skill-b']);
      expect(matrix[0].reason).toContain('shared npm packages');
      expect(matrix[0].reason).toContain('zod');
    });

    it('reports both modifies and npm overlap in one entry', () => {
      const skills: SkillOverlapInfo[] = [
        { name: 'skill-a', skill: 'skill-a', modifies: ['src/config.ts'], npmDependencies: ['zod'], conflicts: [], depends: [], incompatible_with: [] },
        { name: 'skill-b', skill: 'skill-b', modifies: ['src/config.ts'], npmDependencies: ['zod'], conflicts: [], depends: [], incompatible_with: [] },
      ];

      const matrix = computeOverlapMatrix(skills);

      expect(matrix).toHaveLength(1);
      expect(matrix[0].reason).toContain('shared modifies');
      expect(matrix[0].reason).toContain('shared npm packages');
    });

    it('handles three skills with pairwise overlaps', () => {
      const skills: SkillOverlapInfo[] = [
        { name: 'a', skill: 'a', modifies: ['src/config.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: [] },
        { name: 'b', skill: 'b', modifies: ['src/config.ts', 'src/router.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: [] },
        { name: 'c', skill: 'c', modifies: ['src/router.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: [] },
      ];

      const matrix = computeOverlapMatrix(skills);

      // a-b overlap on config.ts, b-c overlap on router.ts, a-c no overlap
      expect(matrix).toHaveLength(2);
      expect(matrix[0].skills).toEqual(['a', 'b']);
      expect(matrix[1].skills).toEqual(['b', 'c']);
    });

    it('returns empty array for single skill', () => {
      const skills: SkillOverlapInfo[] = [
        { name: 'only', skill: 'only', modifies: ['src/config.ts'], npmDependencies: ['zod'], conflicts: [], depends: [], incompatible_with: [] },
      ];

      const matrix = computeOverlapMatrix(skills);

      expect(matrix).toHaveLength(0);
    });

    it('returns empty array for no skills', () => {
      const matrix = computeOverlapMatrix([]);
      expect(matrix).toHaveLength(0);
    });

    it('excludes conflicting skill pairs', () => {
      const skills: SkillOverlapInfo[] = [
        { name: 'add-voice-transcription', skill: 'voice-transcription', modifies: ['src/channels/whatsapp.ts'], npmDependencies: [], conflicts: ['voice-transcription-elevenlabs'], depends: [], incompatible_with: [] },
        { name: 'add-voice-transcription-elevenlabs', skill: 'voice-transcription-elevenlabs', modifies: ['src/channels/whatsapp.ts'], npmDependencies: [], conflicts: ['voice-transcription'], depends: [], incompatible_with: [] },
      ];

      const matrix = computeOverlapMatrix(skills);

      expect(matrix).toHaveLength(0);
    });

    it('excludes pair when only one side declares conflict', () => {
      const skills: SkillOverlapInfo[] = [
        { name: 'a', skill: 'a', modifies: ['src/config.ts'], npmDependencies: [], conflicts: ['b'], depends: [], incompatible_with: [] },
        { name: 'b', skill: 'b', modifies: ['src/config.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: [] },
      ];

      const matrix = computeOverlapMatrix(skills);

      expect(matrix).toHaveLength(0);
    });

    it('orders skills respecting dependencies', () => {
      const skills: SkillOverlapInfo[] = [
        { name: 'add-voice-recognition', skill: 'voice-recognition', modifies: ['src/channels/whatsapp.ts'], npmDependencies: [], conflicts: [], depends: ['voice-transcription-elevenlabs'], incompatible_with: [] },
        { name: 'add-voice-transcription-elevenlabs', skill: 'voice-transcription-elevenlabs', modifies: ['src/channels/whatsapp.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: [] },
      ];

      const matrix = computeOverlapMatrix(skills);

      expect(matrix).toHaveLength(1);
      // dependency (elevenlabs) should come first
      expect(matrix[0].skills).toEqual(['add-voice-transcription-elevenlabs', 'add-voice-recognition']);
    });

    it('orders dependency first when b depends on a', () => {
      const skills: SkillOverlapInfo[] = [
        { name: 'base', skill: 'base', modifies: ['src/index.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: [] },
        { name: 'dependent', skill: 'dependent', modifies: ['src/index.ts'], npmDependencies: [], conflicts: [], depends: ['base'], incompatible_with: [] },
      ];

      const matrix = computeOverlapMatrix(skills);

      expect(matrix).toHaveLength(1);
      expect(matrix[0].skills).toEqual(['base', 'dependent']);
    });

    it('excludes pairs where either skill declares the other incompatible', () => {
      const skills: SkillOverlapInfo[] = [
        { name: 'add-discord', skill: 'discord', modifies: ['src/index.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: ['telegram'] },
        { name: 'add-telegram', skill: 'telegram', modifies: ['src/index.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: ['discord'] },
      ];

      const matrix = computeOverlapMatrix(skills);

      expect(matrix).toHaveLength(0);
    });

    it('excludes pair when only one side declares incompatible_with', () => {
      const skills: SkillOverlapInfo[] = [
        { name: 'add-voice-recognition', skill: 'voice-recognition', modifies: ['src/channels/whatsapp.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: ['voice-transcription'] },
        { name: 'add-voice-transcription', skill: 'voice-transcription', modifies: ['src/channels/whatsapp.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: [] },
      ];

      const matrix = computeOverlapMatrix(skills);

      expect(matrix).toHaveLength(0);
    });

    it('does not exclude pairs with empty incompatible_with', () => {
      const skills: SkillOverlapInfo[] = [
        { name: 'a', skill: 'a', modifies: ['src/config.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: [] },
        { name: 'b', skill: 'b', modifies: ['src/config.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: [] },
      ];

      const matrix = computeOverlapMatrix(skills);

      expect(matrix).toHaveLength(1);
    });
  });

  describe('extractOverlapInfo', () => {
    it('extracts modifies and npm dependencies using dirName', () => {
      const manifest = makeManifest({
        skill: 'telegram',
        modifies: ['src/config.ts'],
        structured: {
          npm_dependencies: { grammy: '^1.0.0', zod: '^3.0.0' },
        },
      });

      const info = extractOverlapInfo(manifest, 'add-telegram');

      expect(info.name).toBe('add-telegram');
      expect(info.modifies).toEqual(['src/config.ts']);
      expect(info.npmDependencies).toEqual(['grammy', 'zod']);
    });

    it('handles manifest without structured field', () => {
      const manifest = makeManifest({
        skill: 'simple',
        modifies: ['src/index.ts'],
      });

      const info = extractOverlapInfo(manifest, 'add-simple');

      expect(info.npmDependencies).toEqual([]);
    });

    it('extracts conflicts and depends from manifest', () => {
      const manifest = makeManifest({
        skill: 'voice-transcription-elevenlabs',
        modifies: ['src/channels/whatsapp.ts'],
        conflicts: ['voice-transcription'],
        depends: [],
      });

      const info = extractOverlapInfo(manifest, 'add-voice-transcription-elevenlabs');

      expect(info.skill).toBe('voice-transcription-elevenlabs');
      expect(info.conflicts).toEqual(['voice-transcription']);
      expect(info.depends).toEqual([]);
    });

    it('handles structured without npm_dependencies', () => {
      const manifest = makeManifest({
        skill: 'env-only',
        modifies: [],
        structured: {
          env_additions: ['MY_VAR'],
        },
      });

      const info = extractOverlapInfo(manifest, 'add-env-only');

      expect(info.npmDependencies).toEqual([]);
    });

    it('extracts incompatible_with from manifest', () => {
      const manifest = makeManifest({
        skill: 'discord',
        modifies: ['src/index.ts'],
        incompatible_with: ['telegram', 'gmail'],
      });

      const info = extractOverlapInfo(manifest, 'add-discord');

      expect(info.incompatible_with).toEqual(['telegram', 'gmail']);
    });

    it('defaults incompatible_with to empty array', () => {
      const manifest = makeManifest({
        skill: 'simple',
        modifies: ['src/index.ts'],
      });

      const info = extractOverlapInfo(manifest, 'add-simple');

      expect(info.incompatible_with).toEqual([]);
    });
  });

  describe('generateMatrix with real filesystem', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = createTempDir();
    });

    afterEach(() => {
      cleanup(tmpDir);
    });

    function createManifestDir(skillsDir: string, name: string, manifest: Record<string, unknown>): void {
      const dir = path.join(skillsDir, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'manifest.yaml'), stringify(manifest));
    }

    it('reads manifests from disk and finds overlaps', () => {
      const skillsDir = path.join(tmpDir, '.claude', 'skills');

      createManifestDir(skillsDir, 'telegram', {
        skill: 'telegram',
        version: '1.0.0',
        core_version: '1.0.0',
        adds: ['src/telegram.ts'],
        modifies: ['src/config.ts', 'src/index.ts'],
        conflicts: [],
        depends: [],
      });

      createManifestDir(skillsDir, 'discord', {
        skill: 'discord',
        version: '1.0.0',
        core_version: '1.0.0',
        adds: ['src/discord.ts'],
        modifies: ['src/config.ts', 'src/index.ts'],
        conflicts: [],
        depends: [],
      });

      const matrix = generateMatrix(skillsDir);

      expect(matrix).toHaveLength(1);
      expect(matrix[0].skills).toContain('telegram');
      expect(matrix[0].skills).toContain('discord');
    });

    it('returns empty matrix when skills dir does not exist', () => {
      const matrix = generateMatrix(path.join(tmpDir, 'nonexistent'));
      expect(matrix).toHaveLength(0);
    });

    it('returns empty matrix for non-overlapping skills on disk', () => {
      const skillsDir = path.join(tmpDir, '.claude', 'skills');

      createManifestDir(skillsDir, 'alpha', {
        skill: 'alpha',
        version: '1.0.0',
        core_version: '1.0.0',
        adds: ['src/alpha.ts'],
        modifies: ['src/alpha-config.ts'],
        conflicts: [],
        depends: [],
      });

      createManifestDir(skillsDir, 'beta', {
        skill: 'beta',
        version: '1.0.0',
        core_version: '1.0.0',
        adds: ['src/beta.ts'],
        modifies: ['src/beta-config.ts'],
        conflicts: [],
        depends: [],
      });

      const matrix = generateMatrix(skillsDir);
      expect(matrix).toHaveLength(0);
    });

    it('detects structured npm overlap from disk manifests', () => {
      const skillsDir = path.join(tmpDir, '.claude', 'skills');

      createManifestDir(skillsDir, 'skill-x', {
        skill: 'skill-x',
        version: '1.0.0',
        core_version: '1.0.0',
        adds: [],
        modifies: ['src/x.ts'],
        conflicts: [],
        depends: [],
        structured: {
          npm_dependencies: { lodash: '^4.0.0' },
        },
      });

      createManifestDir(skillsDir, 'skill-y', {
        skill: 'skill-y',
        version: '1.0.0',
        core_version: '1.0.0',
        adds: [],
        modifies: ['src/y.ts'],
        conflicts: [],
        depends: [],
        structured: {
          npm_dependencies: { lodash: '^4.1.0' },
        },
      });

      const matrix = generateMatrix(skillsDir);

      expect(matrix).toHaveLength(1);
      expect(matrix[0].reason).toContain('lodash');
    });
  });
});
