/**
 * Auto-merge — approves and merges PRs using GitHub App token.
 *
 * Generates a GitHub App installation token from APP_ID + APP_PRIVATE_KEY,
 * then approves and merges the PR. Falls back to GITHUB_TOKEN if App
 * secrets are not available.
 */

import jwt from 'jsonwebtoken';
import { Octokit } from '@octokit/rest';
import {
  createOctokit,
  GitHubContext,
  createReview,
  mergePR,
  parseActionContext,
  parseRepoEnv,
} from './github';

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

/** Generate a GitHub App installation token. */
async function getAppInstallationToken(
  appId: string,
  privateKey: string,
  owner: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,        // issued at (60s in the past for clock drift)
    exp: now + 10 * 60,   // expiration (10 minutes)
    iss: appId,
  };

  const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

  const appOctokit = new Octokit({ auth: token });
  const installations = await appOctokit.apps.listInstallations();

  if (installations.data.length === 0) {
    throw new Error('GitHub App has no installations');
  }

  const installation = installations.data.find(
    inst => inst.account?.login === owner
  ) ?? installations.data[0];

  const accessToken = await appOctokit.apps.createInstallationAccessToken({
    installation_id: installation.id,
  });

  return accessToken.data.token;
}

/** Main auto-merge function. */
export async function runAutoMerge(params: AutoMergeParams): Promise<{
  merged: boolean;
  method: string;
  message: string;
}> {
  const {
    appId,
    appPrivateKey,
    githubToken: inputToken,
    commitTitle,
  } = params;

  const actionCtx = parseActionContext();
  const { owner, repo } = parseRepoEnv();
  const pullNumber = params.pullNumber ?? actionCtx.pullNumber;
  const sha = params.sha ?? actionCtx.sha;
  const ctx: GitHubContext = { owner, repo, pullNumber, sha };

  if (pullNumber === 0) {
    return {
      merged: false,
      method: 'none',
      message: 'No pull request number found — not in PR context',
    };
  }

  let token: string;
  let tokenSource: string;
  if (appId && appPrivateKey) {
    try {
      token = await getAppInstallationToken(appId, appPrivateKey, owner);
      tokenSource = 'github-app';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`::warning::App token generation failed: ${msg}. Falling back to GITHUB_TOKEN.`);
      if (!inputToken) {
        return {
          merged: false,
          method: 'none',
          message: `App token failed and no fallback token: ${msg}`,
        };
      }
      token = inputToken;
      tokenSource = 'github-token-fallback';
    }
  } else if (inputToken) {
    token = inputToken;
    tokenSource = 'github-token';
  } else {
    return {
      merged: false,
      method: 'none',
      message: 'No authentication available — provide GITHUB_TOKEN or App secrets',
    };
  }

  const octokit = createOctokit(token);

  try {
    await createReview(octokit, ctx, 'APPROVE', 'Auto-approved by AI Code Reviewer — all checks passed.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // May already be approved — that's OK
    console.log(`::notice::Approval note: ${msg}`);
  }

  try {
    await mergePR(octokit, ctx, commitTitle);
    return {
      merged: true,
      method: 'squash',
      message: `PR #${pullNumber} merged successfully via ${tokenSource}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      merged: false,
      method: 'squash',
      message: `Merge failed: ${msg}`,
    };
  }
}
