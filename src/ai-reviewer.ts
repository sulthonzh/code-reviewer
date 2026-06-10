/**
 * AI reviewer — sends diffs to Z.AI for review and posts findings.
 *
 * Uses OpenAI SDK pointed at Z.AI's OpenAI-compatible endpoint.
 * Implements model routing: glm-4.5 (cheap/fast) → glm-5.1 (expensive/slow)
 * for escalation when complexity is detected.
 */

import OpenAI from 'openai';
import { AiFinding, ReviewResult, DiffFile } from './types';
import { parseDiff, countAddedLines, diffToText } from './diff-parser';
import { buildSystemPrompt, buildUserPrompt } from './prompt-builder';
import { ProjectContext } from './types';
import {
  createOctokit,
  GitHubContext,
  createReview,
  postReviewComment,
  setStatusCheck,
  sanitizeToken,
} from './github';

const ZAI_BASE_URL = process.env.INPUT_ZAI_BASE_URL ?? 'https://api.z.ai/api/coding/paas/v4/';
const DEFAULT_MODEL = process.env.INPUT_MODEL ?? 'glm-4.5';
const ESCALATION_MODEL = 'glm-5.1';

/** Diff size thresholds */
const PER_FILE_THRESHOLD = 15_000; // chars
const WHOLE_DIFF_THRESHOLD = 50_000; // chars

/** Signals that trigger escalation to expensive model */
const ESCALATION_SIGNALS = [
  /\bcrypto\b/i,
  /\bencrypt|\bdecrypt\b/i,
  /\bhash\b/i,
  /\b(password|passwd|secret)\b/i,
  /\bSQL\b/i,
  /\b(auth|token|session)\b/i,
  /\bexec\s*\(/i,
  /\beval\s*\(/i,
];

interface ZAiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function createClient(config: ZAiConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
}

/** Decide if we should escalate to the expensive model. */
function shouldEscalate(diffText: string): boolean {
  let signalCount = 0;
  for (const signal of ESCALATION_SIGNALS) {
    if (signal.test(diffText)) {
      signalCount++;
    }
  }
  return signalCount >= 2;
}

/** Determine complexity level from diff size and content. */
function assessComplexty(files: DiffFile[]): 'low' | 'medium' | 'high' {
  const lines = countAddedLines(files);
  if (lines < 50) return 'low';
  if (lines < 200) return 'medium';
  return 'high';
}

/** Parse the JSON array of findings from the model response. */
function parseFindingsResponse(text: string): AiFinding[] {
  const trimmed = text.trim();

  // Try direct JSON parse
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return validateFindings(parsed);
    }
  } catch {
    // Not direct JSON, try to extract from markdown
  }

  // Try to extract JSON from markdown code block
  const jsonMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch && jsonMatch[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (Array.isArray(parsed)) {
        return validateFindings(parsed);
      }
    } catch {
      // Not valid JSON in code block
    }
  }

  // Try to find array in text
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        return validateFindings(parsed);
      }
    } catch {
      // Not valid JSON array
    }
  }

  return [];
}

function validateFindings(raw: unknown[]): AiFinding[] {
  const validSeverities = new Set(['critical', 'high', 'medium', 'low']);
  const validDimensions = new Set(['security', 'correctness', 'patterns', 'performance']);

  return raw.filter((item): item is AiFinding => {
    if (typeof item !== 'object' || item === null) return false;
    const obj = item as Record<string, unknown>;
    return (
      typeof obj.file === 'string' &&
      typeof obj.line === 'number' &&
      typeof obj.severity === 'string' &&
      validSeverities.has(obj.severity) &&
      typeof obj.dimension === 'string' &&
      validDimensions.has(obj.dimension) &&
      typeof obj.message === 'string' &&
      typeof obj.suggestion === 'string'
    );
  });
}

/** Call the model and get findings. */
async function callModel(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<AiFinding[]> {
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.1,
    max_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content ?? '';
  return parseFindingsResponse(content);
}

/** Main AI review function. */
export async function runAiReview(params: {
  diffText: string;
  context: ProjectContext;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  githubToken?: string;
  githubCtx?: GitHubContext;
}): Promise<ReviewResult> {
  const {
    diffText,
    context,
    apiKey,
    baseUrl = ZAI_BASE_URL,
    model = DEFAULT_MODEL,
    githubToken,
    githubCtx,
  } = params;

  const files = parseDiff(diffText);
  const complexity = assessComplexty(files);
  const systemPrompt = buildSystemPrompt(context);
  const client = createClient({ apiKey, baseUrl, model });

  let allFindings: AiFinding[] = [];
  let modelUsed = model;

  // Decide: per-file or whole-diff analysis
  const totalDiffSize = diffText.length;

  if (totalDiffSize > WHOLE_DIFF_THRESHOLD) {
    // Per-file analysis for large diffs
    for (const file of files) {
      if (file.isBinary) continue;
      const fileDiff = diffToText([file]);
      if (fileDiff.length > PER_FILE_THRESHOLD) {
        // Split large files by hunk
        for (let i = 0; i < file.hunks.length; i++) {
          const hunkFiles: DiffFile[] = [{
            ...file,
            hunks: [file.hunks[i]],
            additions: file.hunks[i].lines.filter(l => l.type === 'add'),
            deletions: file.hunks[i].lines.filter(l => l.type === 'remove'),
          }];
          const hunkPrompt = buildUserPrompt(hunkFiles);
          const findings = await callModel(client, modelUsed, systemPrompt, hunkPrompt);
          allFindings = allFindings.concat(findings);
        }
      } else {
        const filePrompt = buildUserPrompt([file]);
        const findings = await callModel(client, modelUsed, systemPrompt, filePrompt);
        allFindings = allFindings.concat(findings);
      }
    }
  } else {
    // Whole-diff analysis for small/medium diffs
    const userPrompt = buildUserPrompt(files);
    allFindings = await callModel(client, modelUsed, systemPrompt, userPrompt);
  }

  // Escalation: if initial model flags complexity, re-run with expensive model
  if (shouldEscalate(diffText) && modelUsed !== ESCALATION_MODEL) {
    const criticalCount = allFindings.filter(f => f.severity === 'critical' || f.severity === 'high').length;
    if (criticalCount > 0) {
      const expensiveClient = createClient({ apiKey, baseUrl, model: ESCALATION_MODEL });
      const userPrompt = buildUserPrompt(files);
      const escalatedFindings = await callModel(expensiveClient, ESCALATION_MODEL, systemPrompt, userPrompt);
      // Merge: prefer escalated findings for security issues
      const nonSecurity = allFindings.filter(f => f.dimension !== 'security');
      allFindings = [...nonSecurity, ...escalatedFindings];
      modelUsed = `${modelUsed} + ${ESCALATION_MODEL}`;
    }
  }

  // Determine approval
  const hasBlockers = allFindings.some(
    f => f.severity === 'critical' || f.severity === 'high'
  );
  const approved = !hasBlockers;

  // Post to GitHub if token provided
  if (githubToken && githubCtx && githubCtx.pullNumber > 0) {
    try {
      await postFindingsToGitHub(githubToken, githubCtx, allFindings, approved);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`::warning::Failed to post review to GitHub: ${sanitizeToken(message)}`);
    }
  }

  return {
    approved,
    model: modelUsed,
    complexity,
    findings: allFindings,
    summary: buildSummary(allFindings, approved),
  };
}

async function postFindingsToGitHub(
  token: string,
  ctx: GitHubContext,
  findings: AiFinding[],
  approved: boolean,
): Promise<void> {
  const octokit = createOctokit(token);
  const event = approved ? 'COMMENT' : 'REQUEST_CHANGES';
  const summary = buildSummary(findings, approved);

  // Post inline comments for critical/high findings (max 20 to avoid rate limits)
  const inlineFindings = findings
    .filter(f => f.severity === 'critical' || f.severity === 'high')
    .slice(0, 20);

  for (const finding of inlineFindings) {
    try {
      await postReviewComment(octokit, ctx, {
        body: `**[${finding.severity.toUpperCase()}] ${finding.dimension}**\n${finding.message}\n\n💡 ${finding.suggestion}`,
        path: finding.file,
        line: finding.line,
      });
    } catch {
      // Skip if line position is invalid (file may have changed)
    }
  }

  // Create review with summary
  const reviewComments = findings
    .filter(f => f.severity !== 'critical' && f.severity !== 'high')
    .slice(0, 10)
    .map(f => ({
      path: f.file,
      position: f.line,
      body: sanitizeToken(`[${f.severity.toUpperCase()}] ${f.dimension}: ${f.message}\n\n💡 ${f.suggestion}`),
    }));

  await createReview(octokit, ctx, event, summary, reviewComments);

  // Set status check
  await setStatusCheck(octokit, ctx, {
    state: approved ? 'success' : 'failure',
    description: approved
      ? 'AI review passed — no critical or high findings'
      : `AI review found ${findings.filter(f => f.severity === 'critical' || f.severity === 'high').length} critical/high issues`,
    context: 'ai-code-reviewer',
  });
}

function buildSummary(findings: AiFinding[], approved: boolean): string {
  if (findings.length === 0) {
    return '## AI Code Review ✅\n\nNo issues found. LGTM!';
  }

  const lines: string[] = [
    `## AI Code Review ${approved ? '✅' : '❌'}`,
    '',
    `Found **${findings.length}** finding(s):`,
  ];

  const bySeverity = {
    critical: findings.filter(f => f.severity === 'critical'),
    high: findings.filter(f => f.severity === 'high'),
    medium: findings.filter(f => f.severity === 'medium'),
    low: findings.filter(f => f.severity === 'low'),
  };

  for (const [severity, items] of Object.entries(bySeverity)) {
    if (items.length === 0) continue;
    lines.push('');
    lines.push(`### ${severity.toUpperCase()} (${items.length})`);
    for (const item of items.slice(0, 10)) {
      lines.push(`- \`${item.file}:${item.line}\` — ${item.message}`);
    }
    if (items.length > 10) {
      lines.push(`- ... and ${items.length - 10} more`);
    }
  }

  if (!approved) {
    lines.push('');
    lines.push('⚠️ **Review blocked** due to critical/high severity findings.');
  }

  return lines.join('\n');
}
