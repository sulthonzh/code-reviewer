/**
 * GitHub API helpers using Octokit.
 *
 * Provides functions for: getting PR diff, posting review comments,
 * creating reviews, setting status checks, creating releases.
 * All tokens are sanitized before any output.
 */

import { Octokit } from '@octokit/rest';
import { SecretFinding, QualityFinding } from './types';

const TOKEN_PATTERNS = [
  /\bghp_[A-Za-z0-9_]{36,255}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{22,255}\b/g,
  /\bnpm_[A-Za-z0-9]{36,255}\b/g,
  /\bzai_[A-Za-z0-9_\-]{20,255}\b/g,
];

export function sanitizeToken(text: string): string {
  let result = text;
  for (const pattern of TOKEN_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, '****REDACTED****');
  }
  return result;
}

export function createOctokit(token: string): Octokit {
  return new Octokit({ auth: token });
}

export interface GitHubContext {
  owner: string;
  repo: string;
  pullNumber: number;
  sha: string;
}

/** Fetch the PR diff as raw text. */
export async function getPRDiff(
  octokit: Octokit,
  ctx: GitHubContext,
): Promise<string> {
  const response = await octokit.pulls.get({
    owner: ctx.owner,
    repo: ctx.repo,
    pull_number: ctx.pullNumber,
    mediaType: { format: 'diff' },
  });
  return String(response.data);
}

/** List files changed in the PR. */
export async function getPRFiles(
  octokit: Octokit,
  ctx: GitHubContext,
): Promise<string[]> {
  const response = await octokit.pulls.listFiles({
    owner: ctx.owner,
    repo: ctx.repo,
    pull_number: ctx.pullNumber,
  });
  return response.data.map(f => f.filename);
}

/** Post an inline comment on a specific line of a file in the PR. */
export async function postReviewComment(
  octokit: Octokit,
  ctx: GitHubContext,
  params: {
    body: string;
    path: string;
    line: number;
    side?: 'LEFT' | 'RIGHT';
    startLine?: number;
    startSide?: 'LEFT' | 'RIGHT';
  },
): Promise<void> {
  const sanitized = sanitizeToken(params.body);
  await octokit.pulls.createReviewComment({
    owner: ctx.owner,
    repo: ctx.repo,
    pull_number: ctx.pullNumber,
    body: sanitized,
    path: params.path,
    line: params.line,
    side: params.side ?? 'RIGHT',
    start_line: params.startLine,
    start_side: params.startSide,
    commit_id: ctx.sha,
  });
}

/** Create a PR review (APPROVE, REQUEST_CHANGES, or COMMENT). */
export async function createReview(
  octokit: Octokit,
  ctx: GitHubContext,
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
  body: string,
  comments: Array<{ path: string; position: number; body: string }> = [],
): Promise<void> {
  const sanitized = sanitizeToken(body);
  const sanitizedComments = comments.map(c => ({
    ...c,
    body: sanitizeToken(c.body),
  }));

  await octokit.pulls.createReview({
    owner: ctx.owner,
    repo: ctx.repo,
    pull_number: ctx.pullNumber,
    commit_id: ctx.sha,
    event,
    body: sanitized,
    comments: sanitizedComments,
  });
}

/** Set a status check on the commit. */
export async function setStatusCheck(
  octokit: Octokit,
  ctx: GitHubContext,
  params: {
    state: 'error' | 'failure' | 'pending' | 'success';
    description: string;
    context: string;
    targetUrl?: string;
  },
): Promise<void> {
  await octokit.repos.createCommitStatus({
    owner: ctx.owner,
    repo: ctx.repo,
    sha: ctx.sha,
    state: params.state,
    description: sanitizeToken(params.description),
    context: params.context,
    target_url: params.targetUrl,
  });
}

/** Create a GitHub release. */
export async function createRelease(
  octokit: Octokit,
  owner: string,
  repo: string,
  params: {
    tag: string;
    title: string;
    body: string;
    targetCommitish?: string;
    draft?: boolean;
  },
): Promise<string> {
  const response = await octokit.repos.createRelease({
    owner,
    repo,
    tag_name: params.tag,
    name: params.title,
    body: sanitizeToken(params.body),
    target_commitish: params.targetCommitish,
    draft: params.draft ?? false,
  });
  return response.data.html_url;
}

/** Merge a PR (squash merge preferred). */
export async function mergePR(
  octokit: Octokit,
  ctx: GitHubContext,
  commitTitle?: string,
): Promise<void> {
  await octokit.pulls.merge({
    owner: ctx.owner,
    repo: ctx.repo,
    pull_number: ctx.pullNumber,
    commit_title: commitTitle,
    merge_method: 'squash',
  });
}

/** Get commits since a given tag. */
export async function getCommitsSinceTag(
  octokit: Octokit,
  owner: string,
  repo: string,
  sinceTag: string,
  branch: string,
): Promise<Array<{ sha: string; message: string }>> {
  let sinceDate: string | undefined;
  try {
    const tagRef = await octokit.git.getRef({
      owner,
      repo,
      ref: `tags/${sinceTag}`,
    });
    const tagObj = await octokit.git.getTag({
      owner,
      repo,
      tag_sha: tagRef.data.object.sha,
    });
    sinceDate = (tagObj.data as { tagger?: { date?: string } }).tagger?.date;
  } catch {
    // Tag not found, get all commits
  }

  const response = await octokit.repos.listCommits({
    owner,
    repo,
    sha: branch,
    since: sinceDate,
    per_page: 100,
  });

  return response.data.map(c => ({
    sha: c.sha,
    message: c.commit.message,
  }));
}

/** Get the package.json content from the repo. */
export async function getPackageJson(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref?: string,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: 'package.json',
      ref,
    });
    if ('content' in response.data) {
      const decoded = Buffer.from(response.data.content, 'base64').toString('utf-8');
      return JSON.parse(decoded) as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/** Get the latest tag from the repo. */
export async function getLatestTag(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<string | null> {
  try {
    const response = await octokit.repos.listTags({
      owner,
      repo,
      per_page: 1,
    });
    if (response.data.length > 0) {
      return response.data[0].name;
    }
    return null;
  } catch {
    return null;
  }
}

/** Parse GITHUB_REPOSITORY env var into owner and repo. */
export function parseRepoEnv(): { owner: string; repo: string } {
  const repoEnv = process.env.GITHUB_REPOSITORY ?? '';
  const parts = repoEnv.split('/');
  return {
    owner: parts[0] ?? '',
    repo: parts[1] ?? '',
  };
}

/** Get PR number and SHA from GitHub Actions environment. */
export function parseActionContext(): GitHubContext {
  const { owner, repo } = parseRepoEnv();
  const eventPath = process.env.GITHUB_EVENT_PATH;

  let pullNumber = 0;
  let sha = process.env.GITHUB_SHA ?? '';

  if (eventPath) {
    try {
      const fs = require('fs');
      const event = JSON.parse(fs.readFileSync(eventPath, 'utf-8'));
      if (event.pull_request) {
        pullNumber = event.pull_request.number;
        sha = event.pull_request.head.sha ?? sha;
      }
    } catch {
      // Event file not available or invalid
    }
  }

  return { owner, repo, pullNumber, sha };
}
