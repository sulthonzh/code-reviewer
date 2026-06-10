/**
 * Main entry point for the AI Code Reviewer GitHub Action.
 *
 * Routes commands to the appropriate module and handles
 * input/output via GitHub Actions environment.
 */

import { scanDiffForSecrets, formatSecretFindings } from './secret-scanner';
import { detectProjectContext } from './context-detector';
import { runAiReview } from './ai-reviewer';
import { runQualityGate, formatQualityReport, qualityGatePassed } from './quality-gate';
import { runAutoMerge } from './auto-merge';
import { runAutoRelease } from './auto-release';
import { parseDiff } from './diff-parser';
import {
  parseActionContext,
  getPRDiff,
  getPRFiles,
  getPackageJson,
  createOctokit,
  setStatusCheck,
} from './github';

/** Read GitHub Action input from environment. */
function getInput(name: string): string {
  // GitHub Actions preserves hyphens in env var names:
  // input "github-token" → INPUT_GITHUB-TOKEN (not INPUT_GITHUB_TOKEN)
  const envName = `INPUT_${name.toUpperCase()}`;
  return process.env[envName] ?? '';
}

/** Write GitHub Action output. */
function setOutput(name: string, value: string): void {
  const filePath = process.env.GITHUB_OUTPUT;
  if (filePath) {
    const fs = require('fs');
    fs.appendFileSync(filePath, `${name}=${value}\n`);
  } else {
    console.log(`::set-output name=${name}::${value}`);
  }
}

/** Log an error annotation. */
function logError(message: string): void {
  console.log(`::error::${message}`);
}

/** Log a notice annotation. */
function logNotice(message: string): void {
  console.log(`::notice::${message}`);
}

/** Log a warning annotation. */
function logWarning(message: string): void {
  console.log(`::warning::${message}`);
}

async function main(): Promise<void> {
  const command = getInput('command');

  if (!command) {
    logError('INPUT_COMMAND is required but not set');
    process.exit(1);
  }

  const supportedCommands = [
    'secret-scan',
    'detect-context',
    'ai-review',
    'quality-gate',
    'auto-merge',
    'auto-release',
    'post-status',
  ];

  if (!supportedCommands.includes(command)) {
    logError(`Unknown command: ${command}. Supported: ${supportedCommands.join(', ')}`);
    process.exit(1);
  }

  console.log(`::group::Running command: ${command}`);

  try {
    switch (command) {
      case 'secret-scan':
        await handleSecretScan();
        break;
      case 'detect-context':
        await handleDetectContext();
        break;
      case 'ai-review':
        await handleAiReview();
        break;
      case 'quality-gate':
        await handleQualityGate();
        break;
      case 'auto-merge':
        await handleAutoMerge();
        break;
      case 'auto-release':
        await handleAutoRelease();
        break;
      case 'post-status':
        await handlePostStatus();
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(`${command} failed: ${message}`);
    process.exit(1);
  }

  console.log('::endgroup::');
}

async function handleSecretScan(): Promise<void> {
  const githubToken = getInput('github-token') || getInput('reviewer-pat');
  const ctx = parseActionContext();

  if (ctx.pullNumber === 0) {
    logWarning('No pull request context — skipping secret scan');
    setOutput('found', 'false');
    setOutput('count', '0');
    return;
  }

  const octokit = createOctokit(githubToken);
  const diffText = await getPRDiff(octokit, ctx);
  const findings = scanDiffForSecrets(diffText);

  const found = findings.length > 0 ? 'true' : 'false';
  setOutput('found', found);
  setOutput('count', String(findings.length));

  console.log(formatSecretFindings(findings));

  if (findings.length > 0) {
    logError(`Found ${findings.length} potential secret(s) in the diff`);
  } else {
    logNotice('No secrets found in the diff');
  }
}

async function handleDetectContext(): Promise<void> {
  const githubToken = getInput('github-token') || getInput('reviewer-pat');
  const projectTypeOverride = getInput('project-type');
  const ctx = parseActionContext();

  if (projectTypeOverride && projectTypeOverride !== 'auto') {
    setOutput('project_type', projectTypeOverride);
    logNotice(`Project type overridden: ${projectTypeOverride}`);
    return;
  }

  const octokit = createOctokit(githubToken);
  const files = await getPRFiles(octokit, ctx);
  const packageJson = await getPackageJson(octokit, ctx.owner, ctx.repo);

  const context = detectProjectContext({
    files,
    packageJson,
  });

  setOutput('project_type', context.type);
  logNotice(`Detected project: ${context.type} (${context.language})`);
}

async function handleAiReview(): Promise<void> {
  const githubToken = getInput('github-token') || getInput('reviewer-pat');
  const apiKey = getInput('zai-api-key');
  const baseUrl = getInput('zai-base-url') || 'https://api.z.ai/api/coding/paas/v4/';
  const model = getInput('model') || 'glm-4.5';
  const projectTypeOverride = getInput('project-type');
  const ctx = parseActionContext();

  if (!apiKey) {
    logError('zai-api-key is required for ai-review command');
    process.exit(1);
  }

  if (ctx.pullNumber === 0) {
    logWarning('No pull request context — skipping AI review');
    setOutput('approved', 'false');
    setOutput('model', model);
    setOutput('complexity', 'unknown');
    return;
  }

  const octokit = createOctokit(githubToken);
  const diffText = await getPRDiff(octokit, ctx);
  const files = await getPRFiles(octokit, ctx);
  const packageJson = await getPackageJson(octokit, ctx.owner, ctx.repo);

  let projectContext = detectProjectContext({ files, packageJson });
  if (projectTypeOverride && projectTypeOverride !== 'auto') {
    projectContext = { ...projectContext, type: projectTypeOverride as typeof projectContext.type };
  }

  const result = await runAiReview({
    diffText,
    context: projectContext,
    apiKey,
    baseUrl,
    model,
    githubToken,
    githubCtx: ctx,
  });

  setOutput('approved', String(result.approved));
  setOutput('model', result.model);
  setOutput('complexity', result.complexity);

  console.log(result.summary);
}

async function handleQualityGate(): Promise<void> {
  const githubToken = getInput('github-token') || getInput('reviewer-pat');
  const ctx = parseActionContext();

  if (ctx.pullNumber === 0) {
    logWarning('No pull request context — skipping quality gate');
    setOutput('passed', 'true');
    return;
  }

  const octokit = createOctokit(githubToken);
  const diffText = await getPRDiff(octokit, ctx);
  const files = parseDiff(diffText);
  const findings = runQualityGate(files);
  const passed = qualityGatePassed(findings);

  setOutput('passed', String(passed));

  console.log(formatQualityReport(findings));

  // Post as status check
  await setStatusCheck(octokit, ctx, {
    state: passed ? 'success' : 'failure',
    description: passed
      ? 'Quality gate passed'
      : `Quality gate failed: ${findings.filter(f => f.severity === 'error').length} error(s)`,
    context: 'quality-gate',
  });
}

async function handleAutoMerge(): Promise<void> {
  const githubToken = getInput('github-token');
  const appId = getInput('app-id');
  const appPrivateKey = getInput('app-private-key');
  const passed = getInput('passed');

  if (passed === 'false') {
    logWarning('Quality gate did not pass — skipping auto-merge');
    setOutput('approved', 'false');
    return;
  }

  const result = await runAutoMerge({
    appId,
    appPrivateKey,
    githubToken,
  });

  if (result.merged) {
    logNotice(result.message);
  } else {
    logWarning(result.message);
  }
}

async function handleAutoRelease(): Promise<void> {
  const githubToken = getInput('github-token');
  const branch = process.env.GITHUB_REF_NAME;

  const result = await runAutoRelease({
    githubToken,
    branch,
  });

  if (result.released) {
    logNotice(result.message);
  } else {
    logNotice(result.message);
  }
}

async function handlePostStatus(): Promise<void> {
  const githubToken = getInput('github-token');
  const passed = getInput('passed');
  const ctx = parseActionContext();

  const octokit = createOctokit(githubToken);
  await setStatusCheck(octokit, ctx, {
    state: passed === 'true' ? 'success' : 'failure',
    description: passed === 'true' ? 'All checks passed' : 'One or more checks failed',
    context: 'code-reviewer',
  });

  logNotice(`Status posted: ${passed}`);
}

// Run
main().catch(err => {
  logError(`Unhandled error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
