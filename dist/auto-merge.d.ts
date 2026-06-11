/**
 * Auto-merge — approves and merges PRs using GitHub App token.
 *
 * Generates a GitHub App installation token from APP_ID + APP_PRIVATE_KEY,
 * then approves and merges the PR. Falls back to GITHUB_TOKEN if App
 * secrets are not available.
 */
interface AutoMergeParams {
    appId?: string;
    appPrivateKey?: string;
    githubToken?: string;
    pullNumber?: number;
    owner?: string;
    repo?: string;
    sha?: string;
    commitTitle?: string;
}
/** Main auto-merge function. */
export declare function runAutoMerge(params: AutoMergeParams): Promise<{
    merged: boolean;
    method: string;
    message: string;
}>;
export {};
