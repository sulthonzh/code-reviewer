/**
 * Auto-release — creates GitHub releases from conventional commits.
 *
 * Detects project type, gets commits since last tag, determines version
 * bump from conventional commit prefixes, and creates a GitHub release.
 */
import { Octokit } from '@octokit/rest';
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
export declare function parseBumpType(commits: Array<{
    message: string;
}>): BumpType;
/** Bump a semver string. */
export declare function bumpVersion(current: string, bump: 'major' | 'minor' | 'patch'): string;
/** Generate release notes from conventional commits. */
export declare function generateReleaseNotes(commits: Array<{
    message: string;
}>): string;
/** Main auto-release function. */
export declare function runAutoRelease(params: {
    octokit?: Octokit;
    githubToken?: string;
    branch?: string;
}): Promise<ReleaseResult>;
export {};
