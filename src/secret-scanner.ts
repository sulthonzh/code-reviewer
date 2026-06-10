/**
 * Secret scanner — detects leaked credentials in diff content.
 *
 * Regex patterns for common secret formats. Scans only added lines
 * so we don't flag pre-existing secrets.
 */

import { SecretFinding } from './types';
import { parseDiff } from './diff-parser';

interface SecretPattern {
  name: string;
  regex: RegExp;
  severity: 'critical' | 'high' | 'medium';
}

const PATTERNS: SecretPattern[] = [
  {
    name: 'GitHub PAT (classic)',
    regex: /\bghp_[A-Za-z0-9_]{36,255}\b/g,
    severity: 'critical',
  },
  {
    name: 'GitHub PAT (fine-grained)',
    regex: /\bgithub_pat_[A-Za-z0-9_]{22,255}\b/g,
    severity: 'critical',
  },
  {
    name: 'GitHub OAuth token',
    regex: /\bgho_[A-Za-z0-9_]{36,255}\b/g,
    severity: 'critical',
  },
  {
    name: 'GitHub user-to-server token',
    regex: /\bghu_[A-Za-z0-9_]{36,255}\b/g,
    severity: 'critical',
  },
  {
    name: 'GitHub server-to-server token',
    regex: /\bghs_[A-Za-z0-9_]{36,255}\b/g,
    severity: 'critical',
  },
  {
    name: 'GitHub refresh token',
    regex: /\bghr_[A-Za-z0-9_]{36,255}\b/g,
    severity: 'critical',
  },
  {
    name: 'NPM access token',
    regex: /\bnpm_[A-Za-z0-9]{36,255}\b/g,
    severity: 'critical',
  },
  {
    name: 'AWS Access Key ID',
    regex: /\b(AKIA[0-9A-Z]{16})\b/g,
    severity: 'critical',
  },
  {
    name: 'AWS Secret Access Key',
    regex: /(?<=aws_secret_access_key\s*=\s*|AWS_SECRET_ACCESS_KEY\s*=\s*|AWS_SECRET_KEY\s*=\s*)[A-Za-z0-9/+=]{40}\b/g,
    severity: 'critical',
  },
  {
    name: 'Private key',
    regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
    severity: 'critical',
  },
  {
    name: 'Z.AI API Key',
    regex: /\bzai_[A-Za-z0-9_\-]{20,255}\b/g,
    severity: 'critical',
  },
  {
    name: 'Generic API key assignment',
    regex: /(?:api[_\-]?key|apikey)\s*[:=]\s*["'][A-Za-z0-9_\-]{20,}["']/gi,
    severity: 'high',
  },
  {
    name: 'Generic secret assignment',
    regex: /(?:secret|secret[_\-]?key)\s*[:=]\s*["'][A-Za-z0-9_\-]{20,}["']/gi,
    severity: 'high',
  },
  {
    name: 'Generic token assignment',
    regex: /(?:access[_\-]?token|auth[_\-]?token)\s*[:=]\s*["'][A-Za-z0-9_\-]{20,}["']/gi,
    severity: 'high',
  },
  {
    name: 'Password in variable',
    regex: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{8,}["']/gi,
    severity: 'high',
  },
  {
    name: 'Generic bearer token',
    regex: /Bearer\s+[A-Za-z0-9_\-\.]{20,}/gi,
    severity: 'medium',
  },
];

function redactSecret(value: string): string {
  if (value.length <= 8) {
    return '****';
  }
  return value.slice(0, 4) + '****' + value.slice(-4);
}

export function scanDiffForSecrets(diffText: string): SecretFinding[] {
  const files = parseDiff(diffText);
  const findings: SecretFinding[] = [];

  for (const file of files) {
    if (file.isBinary) continue;

    for (const addition of file.additions) {
      const lineNum = addition.newLineNumber ?? addition.lineNumber;
      const content = addition.content;

      for (const pattern of PATTERNS) {
        // Reset lastIndex for global regexes
        pattern.regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.regex.exec(content)) !== null) {
          findings.push({
            file: file.path,
            line: lineNum,
            type: pattern.name,
            severity: pattern.severity,
            preview: content.trim().slice(0, 120),
            redacted: redactSecret(match[0]),
          });
        }
      }
    }
  }

  return findings;
}

export function formatSecretFindings(findings: SecretFinding[]): string {
  if (findings.length === 0) {
    return 'No secrets found.';
  }

  const lines: string[] = [`Found ${findings.length} potential secret(s):\n`];
  for (const f of findings) {
    lines.push(`- [${f.severity.toUpperCase()}] ${f.type} in ${f.file}:${f.line}`);
    lines.push(`  Redacted: ${f.redacted}`);
    lines.push(`  Preview: ${f.preview}`);
  }
  return lines.join('\n');
}
