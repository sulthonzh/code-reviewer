/**
 * Types shared across all modules.
 */

export interface DiffFile {
  path: string;
  oldPath: string | null;
  isNew: boolean;
  isDeleted: boolean;
  isBinary: boolean;
  isRenamed: boolean;
  additions: DiffLine[];
  deletions: DiffLine[];
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  lineNumber: number;
  newLineNumber?: number;
}

export interface SecretFinding {
  file: string;
  line: number;
  type: string;
  severity: 'critical' | 'high' | 'medium';
  preview: string;
  redacted: string;
}

export interface ProjectContext {
  type: 'nextjs' | 'cli' | 'python' | 'go' | 'zig' | 'unknown';
  language: string;
  framework: string | null;
  testRunner: string | null;
  isNpmPackage: boolean;
  packageJson: PackageJsonInfo | null;
}

export interface PackageJsonInfo {
  name: string;
  main: string | null;
  bin: Record<string, string> | null;
  exports: Record<string, unknown> | null;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface QualityFinding {
  file: string;
  line: number;
  rule: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface AiFinding {
  file: string;
  line: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  dimension: 'security' | 'correctness' | 'patterns' | 'performance';
  message: string;
  suggestion: string;
}

export interface ReviewResult {
  approved: boolean;
  model: string;
  complexity: 'low' | 'medium' | 'high';
  findings: AiFinding[];
  summary: string;
}
