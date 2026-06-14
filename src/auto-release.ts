/**
 * Auto-release — creates GitHub releases from conventional commits.
 *
 * Detects project type, gets commits since last tag, determines version
 * bump from conventional commit prefixes, and creates a GitHub release.
 */

import { Octokit } from '@octokit/rest';
import {
  createOctokit,
  createRelease,
  getCommitsSinceTag,
  getLatestTag,
  getPackageJson,
  parseRepoEnv,
} from './github';

interface BumpType {
  type: 'major' | 'minor' | 'patch' | 'none';
  reason: string;
}

interface ReleaseResult {
  released: boolean;
  tag: string;
  version: string;
  url: string;
  message: string;
}

/** Parse conventional commit message to determine bump type. */
export function parseBumpType(commits: Array<{ message: string }>): BumpType {
  let hasMajor = false;
  let hasMinor = false;
  let hasPatch = false;

  for (const commit of commits) {
    const lines = commit.message.split('\n');
    const firstLine = lines[0];

    // Breaking change in footer
    const hasBreakingFooter = commit.message.includes('BREAKING CHANGE:') ||
      commit.message.includes('BREAKING-CHANGE:');

    // feat! or fix! (breaking change shorthand)
    const hasBreakingPrefix = /^[a-z]+(\(.+\))?!:/.test(firstLine);

    if (hasBreakingFooter || hasBreakingPrefix) {
      hasMajor = true;
    }

    if (/^feat(\(.+\))?!?:/.test(firstLine)) {
      if (hasBreakingPrefix || hasBreakingFooter) {
        hasMajor = true;
      } else {
        hasMinor = true;
      }
    } else if (/^fix(\(.+\))?!?:/.test(firstLine)) {
      if (hasBreakingPrefix || hasBreakingFooter) {
        hasMajor = true;
      } else {
        hasPatch = true;
      }
    } else if (/^(perf|refactor|docs|style|test|ci|build|chore)(\(.+\))?!?:/.test(firstLine)) {
      if (hasBreakingPrefix || hasBreakingFooter) {
        hasMajor = true;
      }
      // Non-breaking perf/refactor counts as patch
      if (/^perf(\(.+\))?!?:/.test(firstLine) && !hasBreakingPrefix && !hasBreakingFooter) {
        hasPatch = true;
      }
    }
  }

  if (hasMajor) {
    return { type: 'major', reason: 'Breaking change detected in commits' };
  }
  if (hasMinor) {
    return { type: 'minor', reason: 'New feature (feat:) detected in commits' };
  }
  if (hasPatch) {
    return { type: 'patch', reason: 'Bug fix (fix:) or performance improvement detected in commits' };
  }

  return { type: 'none', reason: 'No version-bumping conventional commits found' };
}

/** Bump a semver string. */
export function bumpVersion(current: string, bump: 'major' | 'minor' | 'patch'): string {
  const parts = current.replace(/^v/, '').split('.').map(Number);
  const [major = 0, minor = 0, patch = 0] = parts;

  switch (bump) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
  }
}

/** Generate release notes from conventional commits. */
export function generateReleaseNotes(commits: Array<{ message: string }>): string {
  const sections: Record<string, string[]> = {
    'Features': [],
    'Bug Fixes': [],
    'Performance': [],
    'Breaking Changes': [],
    'Other': [],
  };

  for (const commit of commits) {
    const lines = commit.message.split('\n');
    const firstLine = lines[0];
    const breaking = commit.message.includes('BREAKING CHANGE:') ||
      commit.message.includes('BREAKING-CHANGE:') ||
      /^[a-z]+(\(.+\))?!:/.test(firstLine);

    if (breaking) {
      const bcBody = commit.message.match(/BREAKING[- ]CHANGE:\s*(.+)/s);
      sections['Breaking Changes'].push(`- ${firstLine}${bcBody ? `\n  ${bcBody[1].trim()}` : ''}`);
    }

    if (/^feat/.test(firstLine)) {
      sections['Features'].push(`- ${firstLine}`);
    } else if (/^fix/.test(firstLine)) {
      sections['Bug Fixes'].push(`- ${firstLine}`);
    } else if (/^perf/.test(firstLine)) {
      sections['Performance'].push(`- ${firstLine}`);
    }
  }

  const parts: string[] = [];
  for (const [title, items] of Object.entries(sections)) {
    if (items.length === 0) continue;
    parts.push(`### ${title}`);
    parts.push(items.join('\n'));
    parts.push('');
  }

  return parts.length > 0 ? parts.join('\n') : 'No notable changes.';
}

/** Main auto-release function. */
export async function runAutoRelease(params: {
  octokit?: Octokit;
  githubToken?: string;
  branch?: string;
}): Promise<ReleaseResult> {
  const { owner, repo } = parseRepoEnv();
  const branch = params.branch ?? process.env.GITHUB_REF_NAME ?? 'main';

  const octokit = params.octokit ?? createOctokit(
    params.githubToken ?? process.env.GITHUB_TOKEN ?? ''
  );

  const packageJson = await getPackageJson(octokit, owner, repo);
  const isNpmPackage = packageJson !== null && (
    !!(packageJson.bin) ||
    !!(packageJson.main) ||
    !!(packageJson.exports)
  );

  const currentTag = await getLatestTag(octokit, owner, repo);
  const currentVersion = currentTag?.replace(/^v/, '') ?? '0.0.0';

  const commits = currentTag
    ? await getCommitsSinceTag(octokit, owner, repo, currentTag, branch)
    : await getCommitsSinceTag(octokit, owner, repo, '', branch);

  if (commits.length === 0) {
    return {
      released: false,
      tag: '',
      version: currentVersion,
      url: '',
      message: 'No commits found since last release',
    };
  }

  const bump = parseBumpType(commits);

  if (bump.type === 'none') {
    return {
      released: false,
      tag: currentTag ?? '',
      version: currentVersion,
      url: '',
      message: `No release needed: ${bump.reason}`,
    };
  }

  const newVersion = bumpVersion(currentVersion, bump.type);
  const newTag = `v${newVersion}`;

  const releaseNotes = generateReleaseNotes(commits);
  const title = isNpmPackage
    ? `v${newVersion}`
    : `Release ${newTag}`;

  const fullBody = `${releaseNotes}\n\n---\n\n${bump.reason}\n\n${commits.length} commit(s) since ${currentTag ?? 'start'}`;

  try {
    const releaseUrl = await createRelease(octokit, owner, repo, {
      tag: newTag,
      title,
      body: fullBody,
      targetCommitish: branch,
    });

    return {
      released: true,
      tag: newTag,
      version: newVersion,
      url: releaseUrl,
      message: `Released ${newTag}: ${bump.reason}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      released: false,
      tag: newTag,
      version: newVersion,
      url: '',
      message: `Release creation failed: ${msg}`,
    };
  }
}
