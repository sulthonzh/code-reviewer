/**
 * Prompt builder — constructs AI review prompts with project context.
 *
 * Injects project-specific rules into system prompts and structures
 * the expected JSON output format for findings.
 */

import { ProjectContext, DiffFile } from './types';

export function buildSystemPrompt(context: ProjectContext): string {
  const langRules = getLanguageRules(context);
  const projectRules = getProjectRules(context);

  return `You are an expert code reviewer. Analyze the provided diff and return findings as a JSON array.

## Review Dimensions (by priority)
1. **security** (critical): Secret leaks, injection vulnerabilities, auth issues, unsafe deserialization
2. **correctness** (high): Logic errors, race conditions, null/undefined handling, error handling gaps
3. **patterns** (medium): Code style, naming, anti-patterns, missing abstractions
4. **performance** (low): N+1 queries, unnecessary allocations, blocking calls

${langRules}

${projectRules}

## Output Format
Return ONLY a JSON array of findings. Each finding must have:
- "file": string (file path)
- "line": number (line number in the diff)
- "severity": "critical" | "high" | "medium" | "low"
- "dimension": "security" | "correctness" | "patterns" | "performance"
- "message": string (what's wrong)
- "suggestion": string (how to fix it)

If no issues found, return an empty array: []

Rules:
- Only flag lines that are ADDED (prefixed with +) in the diff
- Do not flag removed lines
- Be specific: reference exact code, suggest exact fixes
- Do NOT flag stylistic preferences as "critical" or "high"
- For TypeScript: always prefer type safety over convenience`;
}

export function buildUserPrompt(files: DiffFile[]): string {
  const parts: string[] = [];

  for (const file of files) {
    if (file.isBinary) continue;
    parts.push(`## File: ${file.path}${file.isNew ? ' (new file)' : ''}`);
    for (const hunk of file.hunks) {
      parts.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);
      for (const line of hunk.lines) {
        const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
        parts.push(`${prefix}${line.content}`);
      }
    }
    parts.push('');
  }

  return parts.join('\n');
}

function getLanguageRules(context: ProjectContext): string {
  switch (context.language) {
    case 'typescript':
    case 'javascript':
      return `## TypeScript/JavaScript Rules
- NO \`as any\` — use proper type definitions
- NO \`@ts-ignore\` or \`@ts-expect-error\` — fix the type error instead
- All function parameters must be typed
- Prefer \`const\` over \`let\`
- Use explicit return types on exported functions
- Prefer early returns over nested if/else
- Use optional chaining (?.) and nullish coalescing (??)`;

    case 'python':
      return `## Python Rules
- NO bare \`except:\` — always specify exception type
- Use type hints on function signatures
- Use f-strings over .format() or % formatting
- Prefer pathlib over os.path
- Use dataclasses or Pydantic models over raw dicts`;

    case 'go':
      return `## Go Rules
- Always wrap errors with context: \`fmt.Errorf("doing X: %w", err)\`
- Pass context.Context as first parameter
- Handle all errors explicitly (no discarded errors)
- Use structured logging (slog) over fmt.Println
- Close resources with defer`;

    case 'zig':
      return `## Zig Rules
- Handle all error unions explicitly
- Use proper allocator patterns
- Prefer bounded arrays over sentinel-terminated pointers
- Defer resource cleanup`;

    default:
      return '';
  }
}

function getProjectRules(context: ProjectContext): string {
  switch (context.type) {
    case 'nextjs':
      return `## Next.js Specific Rules
- Server Components: NO useState, useEffect, or browser APIs
- Client Components: must have "use client" directive when using hooks
- NEVER pass non-serializable props from Server to Client components
- Loading boundaries: add loading.tsx for route segments
- Error boundaries: add error.tsx for error handling
- Use \`next/image\` for images, not raw \`<img>\`
- Never expose server secrets to client components
- Use metadata API over next/head`;

    case 'cli':
      return `## CLI Specific Rules
- Validate argv/inputs before processing
- Use proper exit codes (0 = success, 1 = error, 2 = usage)
- Provide --help and --version flags
- Use descriptive error messages with actionable suggestions
- Handle SIGINT/SIGTERM gracefully
- Never hardcode file paths — use proper resolution`;

    default:
      return '';
  }
}
