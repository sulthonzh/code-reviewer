/**
 * Quality gate — enforces code quality rules on added lines.
 *
 * Rules are intentionally strict to catch common AI-generated code patterns.
 * Only scans added/modified lines in the diff.
 */

import { QualityFinding, DiffFile } from './types';

interface QualityRule {
  name: string;
  pattern: RegExp;
  severity: 'error' | 'warning';
  message: string;
}

const RULES: QualityRule[] = [
  {
    name: 'no-as-any',
    pattern: /\bas\s+any\b/,
    severity: 'error',
    message: 'Avoid `as any` — use proper type definitions',
  },
  {
    name: 'no-ts-ignore',
    pattern: /@ts-ignore/,
    severity: 'error',
    message: 'Avoid @ts-ignore — fix the type error instead',
  },
  {
    name: 'no-ts-expect-error',
    pattern: /@ts-expect-error/,
    severity: 'error',
    message: 'Avoid @ts-expect-error — fix the type error instead',
  },
  {
    name: 'no-empty-catch',
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    severity: 'error',
    message: 'Empty catch block — handle or log the error',
  },
  {
    name: 'no-console-log',
    pattern: /\bconsole\.log\s*\(/,
    severity: 'warning',
    message: 'Avoid console.log in production code — use a proper logger',
  },
  {
    name: 'no-hardcoded-urls',
    pattern: /https?:\/\/[^\s"']+\. (?:com|io|dev|org|net)/,
    severity: 'warning',
    message: 'Possible hardcoded URL — consider using environment variable',
  },
  {
    name: 'no-todo',
    pattern: /\b(?:TODO|FIXME|HACK|XXX)\b/,
    severity: 'warning',
    message: 'TODO/FIXME found — track as issue or resolve',
  },
  {
    name: 'no-eval',
    pattern: /\beval\s*\(/,
    severity: 'error',
    message: 'Never use eval() — it is a security risk',
  },
  {
    name: 'no-inner-html',
    pattern: /\.innerHTML\s*=/,
    severity: 'error',
    message: 'Avoid innerHTML assignment — risk of XSS',
  },
  {
    name: 'no-var',
    pattern: /\bvar\s+\w+/,
    severity: 'warning',
    message: 'Use `const` or `let` instead of `var`',
  },
];

export function runQualityGate(files: DiffFile[]): QualityFinding[] {
  const findings: QualityFinding[] = [];

  for (const file of files) {
    // Skip non-code files
    if (isIgnoredFile(file.path)) continue;

    for (const addition of file.additions) {
      const lineNum = addition.newLineNumber ?? addition.lineNumber;
      const content = addition.content;

      for (const rule of RULES) {
        if (rule.pattern.test(content)) {
          findings.push({
            file: file.path,
            line: lineNum,
            rule: rule.name,
            severity: rule.severity,
            message: rule.message,
          });
        }
      }
    }

    // Check for missing tests (file has code but no test file in the diff)
    if (isSourceFile(file.path) && file.additions.length > 5) {
      const testFilePresent = files.some(f =>
        f.path !== file.path && isTestFile(f.path, file.path)
      );
      if (!testFilePresent && !file.path.includes('.test.') && !file.path.includes('.spec.')) {
        findings.push({
          file: file.path,
          line: 1,
          rule: 'missing-tests',
          severity: 'warning',
          message: `Source file ${file.path} has significant changes but no corresponding test file was found in the diff`,
        });
      }
    }
  }

  return findings;
}

function isIgnoredFile(path: string): boolean {
  const ignoredExtensions = ['.md', '.json', '.yaml', '.yml', '.lock', '.map', '.css', '.svg', '.png', '.jpg', '.gif', '.ico'];
  return ignoredExtensions.some(ext => path.endsWith(ext));
}

function isSourceFile(path: string): boolean {
  const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.zig'];
  return sourceExtensions.some(ext => path.endsWith(ext));
}

function isTestFile(candidatePath: string, sourcePath: string): boolean {
  const testPatterns = ['.test.', '.spec.', '_test.'];
  const isTest = testPatterns.some(p => candidatePath.includes(p));
  if (!isTest) return false;

  // Check if test file corresponds to source file
  const sourceBase = sourcePath.replace(/\.[^.]+$/, '');
  const candidateBase = candidatePath.replace(/\.(test|spec)\.[^.]+$/, '');
  return candidateBase === sourceBase;
}

export function formatQualityReport(findings: QualityFinding[]): string {
  if (findings.length === 0) {
    return '## Quality Gate ✅\n\nAll checks passed.';
  }

  const errors = findings.filter(f => f.severity === 'error');
  const warnings = findings.filter(f => f.severity === 'warning');
  const passed = errors.length === 0;

  const lines: string[] = [
    `## Quality Gate ${passed ? '✅' : '❌'}`,
    '',
  ];

  if (errors.length > 0) {
    lines.push(`### Errors (${errors.length})`);
    for (const e of errors) {
      lines.push(`- \`${e.file}:${e.line}\` [${e.rule}] ${e.message}`);
    }
  }

  if (warnings.length > 0) {
    lines.push('');
    lines.push(`### Warnings (${warnings.length})`);
    for (const w of warnings) {
      lines.push(`- \`${w.file}:${w.line}\` [${w.rule}] ${w.message}`);
    }
  }

  return lines.join('\n');
}

export function qualityGatePassed(findings: QualityFinding[]): boolean {
  return findings.filter(f => f.severity === 'error').length === 0;
}
