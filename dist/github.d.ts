/**
 * GitHub API helpers using Octokit.
 *
 * Provides functions for: getting PR diff, posting review comments,
 * creating reviews, setting status checks, creating releases.
 * All tokens are sanitized before any output.
 */
import { Octokit } from '@octokit/rest';
export declare function sanitizeToken(text: string): string;
export declare function createOctokit(token: string): Octokit;
export interface GitHubContext {
    owner: string;
    repo: string;
    pullNumber: number;
    sha: string;
}
/** Fetch the PR diff as raw text. */
export declare function getPRDiff(octokit: Octokit, ctx: GitHubContext): Promise<string>;
/** List files changed in the PR. */
export declare function getPRFiles(octokit: Octokit, ctx: GitHubContext): Promise<string[]>;
/** Post an inline comment on a specific line of a file in the PR. */
export declare function postReviewComment(octokit: Octokit, ctx: GitHubContext, params: {
    body: string;
    path: string;
    line: number;
    side?: 'LEFT' | 'RIGHT';
    startLine?: number;
    startSide?: 'LEFT' | 'RIGHT';
}): Promise<void>;
/** Create a PR review (APPROVE, REQUEST_CHANGES, or COMMENT). */
export declare function createReview(octokit: Octokit, ctx: GitHubContext, event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT', body: string, comments?: Array<{
    path: string;
    position: number;
    body: string;
}>): Promise<void>;
/** Set a status check on the commit. */
export declare function setStatusCheck(octokit: Octokit, ctx: GitHubContext, params: {
    state: 'error' | 'failure' | 'pending' | 'success';
    description: string;
    context: string;
    targetUrl?: string;
}): Promise<void>;
/** Create a GitHub release. */
export declare function createRelease(octokit: Octokit, owner: string, repo: string, params: {
    tag: string;
    title: string;
    body: string;
    targetCommitish?: string;
    draft?: boolean;
}): Promise<string>;
/** Merge a PR (squash merge preferred). */
export declare function mergePR(octokit: Octokit, ctx: GitHubContext, commitTitle?: string): Promise<void>;
/** Get commits since a given tag. */
export declare function getCommitsSinceTag(octokit: Octokit, owner: string, repo: string, sinceTag: string, branch: string): Promise<Array<{
    sha: string;
    message: string;
}>>;
/** Get the package.json content from the repo. */
export declare function getPackageJson(octokit: Octokit, owner: string, repo: string, ref?: string): Promise<Record<string, unknown> | null>;
/** Get the latest tag from the repo. */
export declare function getLatestTag(octokit: Octokit, owner: string, repo: string): Promise<string | null>;
/** Parse GITHUB_REPOSITORY env var into owner and repo. */
export declare function parseRepoEnv(): {
    owner: string;
    repo: string;
};
/** Get PR number and SHA from GitHub Actions environment. */
export declare function parseActionContext(): GitHubContext;
