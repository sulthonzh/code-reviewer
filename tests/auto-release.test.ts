import { describe, it, expect } from 'vitest';
import { parseBumpType, bumpVersion, generateReleaseNotes } from '../src/auto-release';

describe('parseBumpType', () => {
  it('detects major bump from feat! prefix', () => {
    const result = parseBumpType([{ message: 'feat!: breaking change in API' }]);
    expect(result.type).toBe('major');
  });

  it('detects major bump from BREAKING CHANGE footer', () => {
    const result = parseBumpType([{
      message: 'feat: new API\n\nBREAKING CHANGE: completely new interface',
    }]);
    expect(result.type).toBe('major');
  });

  it('detects major bump from fix! prefix', () => {
    const result = parseBumpType([{ message: 'fix!: breaking bug fix' }]);
    expect(result.type).toBe('major');
  });

  it('detects minor bump from feat', () => {
    const result = parseBumpType([{ message: 'feat: add new feature' }]);
    expect(result.type).toBe('minor');
  });

  it('detects minor bump from feat with scope', () => {
    const result = parseBumpType([{ message: 'feat(auth): add OAuth support' }]);
    expect(result.type).toBe('minor');
  });

  it('detects patch bump from fix', () => {
    const result = parseBumpType([{ message: 'fix: correct null pointer' }]);
    expect(result.type).toBe('patch');
  });

  it('detects patch bump from perf', () => {
    const result = parseBumpType([{ message: 'perf: optimize query' }]);
    expect(result.type).toBe('patch');
  });

  it('returns none for chore commits', () => {
    const result = parseBumpType([{ message: 'chore: update deps' }]);
    expect(result.type).toBe('none');
  });

  it('returns none for empty commits', () => {
    const result = parseBumpType([]);
    expect(result.type).toBe('none');
  });

  it('handles mixed commits (major wins)', () => {
    const result = parseBumpType([
      { message: 'fix: small fix' },
      { message: 'feat!: breaking API change' },
      { message: 'chore: cleanup' },
    ]);
    expect(result.type).toBe('major');
  });

  it('handles mixed commits (minor wins over patch)', () => {
    const result = parseBumpType([
      { message: 'fix: bug fix' },
      { message: 'feat: new feature' },
    ]);
    expect(result.type).toBe('minor');
  });
});

describe('bumpVersion', () => {
  it('bumps major version', () => {
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
  });

  it('bumps minor version', () => {
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0');
  });

  it('bumps patch version', () => {
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4');
  });

  it('handles version with v prefix', () => {
    expect(bumpVersion('v1.2.3', 'patch')).toBe('1.2.4');
  });

  it('handles 0.0.0', () => {
    expect(bumpVersion('0.0.0', 'minor')).toBe('0.1.0');
  });
});

describe('generateReleaseNotes', () => {
  it('generates notes from conventional commits', () => {
    const commits = [
      { message: 'feat: add user authentication' },
      { message: 'fix: correct login redirect' },
      { message: 'perf: optimize database query' },
    ];
    const notes = generateReleaseNotes(commits);
    expect(notes).toContain('Features');
    expect(notes).toContain('Bug Fixes');
    expect(notes).toContain('Performance');
    expect(notes).toContain('add user authentication');
  });

  it('generates breaking change section', () => {
    const commits = [
      { message: 'feat!: new API\n\nBREAKING CHANGE: old API removed' },
    ];
    const notes = generateReleaseNotes(commits);
    expect(notes).toContain('Breaking Changes');
  });

  it('handles empty commits', () => {
    const notes = generateReleaseNotes([]);
    expect(notes).toContain('No notable changes');
  });
});
