/**
 * Unified diff parser.
 *
 * Parses unified diff format (as returned by `git diff` and GitHub's API)
 * into structured DiffFile objects with hunks and line-level detail.
 */

import { DiffFile, DiffHunk, DiffLine } from './types';

const DIFF_HEADER = /^diff --git a\/(.+?) b\/(.+)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const OLD_FILE = /^--- (?:a\/)?(.+)$/;
const NEW_FILE = /^\+\+\+ (?:b\/)?(.+)$/;

export function parseDiff(diffText: string): DiffFile[] {
  if (!diffText.trim()) {
    return [];
  }

  const files: DiffFile[] = [];
  const lines = diffText.split('\n');
  let current: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let newLineNum = 0;
  let oldLineNum = 0;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');

    const diffMatch = line.match(DIFF_HEADER);
    if (diffMatch) {
      if (current) {
        files.push(current);
      }
      current = createEmptyDiffFile(diffMatch[2]);
      currentHunk = null;
      continue;
    }

    if (!current) continue;

    const oldMatch = line.match(OLD_FILE);
    if (oldMatch) {
      if (oldMatch[1] !== '/dev/null') {
        current.oldPath = oldMatch[1];
      }
      continue;
    }

    const newMatch = line.match(NEW_FILE);
    if (newMatch) {
      if (newMatch[1] === '/dev/null') {
        current.isDeleted = true;
      }
      continue;
    }

    if (line.startsWith('Binary files') || line.startsWith('GIT binary patch')) {
      current.isBinary = true;
      continue;
    }

    if (line.startsWith('rename from ')) {
      current.isRenamed = true;
      current.oldPath = line.slice('rename from '.length);
    } else if (line.startsWith('rename to ')) {
      current.path = line.slice('rename to '.length);
    }

    if (line.startsWith('new file mode ')) {
      current.isNew = true;
    }

    const hunkMatch = line.match(HUNK_HEADER);
    if (hunkMatch) {
      oldLineNum = parseInt(hunkMatch[1], 10);
      newLineNum = parseInt(hunkMatch[3], 10);
      currentHunk = {
        oldStart: oldLineNum,
        oldCount: parseInt(hunkMatch[2] || '1', 10),
        newStart: newLineNum,
        newCount: parseInt(hunkMatch[4] || '1', 10),
        lines: [],
      };
      current.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+')) {
      const dl: DiffLine = {
        type: 'add',
        content: line.slice(1),
        lineNumber: newLineNum,
        newLineNumber: newLineNum,
      };
      currentHunk.lines.push(dl);
      current.additions.push(dl);
      newLineNum++;
    } else if (line.startsWith('-')) {
      const dl: DiffLine = {
        type: 'remove',
        content: line.slice(1),
        lineNumber: oldLineNum,
      };
      currentHunk.lines.push(dl);
      current.deletions.push(dl);
      oldLineNum++;
    } else if (line.startsWith(' ') || line === '') {
      // Context line (or empty line within diff)
      if (line === '' && currentHunk.lines.length === 0) continue;
      const dl: DiffLine = {
        type: 'context',
        content: line.startsWith(' ') ? line.slice(1) : '',
        lineNumber: newLineNum,
        newLineNumber: newLineNum,
      };
      currentHunk.lines.push(dl);
      newLineNum++;
      oldLineNum++;
    }
    // Skip other metadata lines (index, mode, etc.)
  }

  if (current) {
    files.push(current);
  }

  return files;
}

function createEmptyDiffFile(path: string): DiffFile {
  return {
    path,
    oldPath: null,
    isNew: false,
    isDeleted: false,
    isBinary: false,
    isRenamed: false,
    additions: [],
    deletions: [],
    hunks: [],
  };
}

/** Get all added lines from parsed diff files with their positions. */
export function getAddedLines(files: DiffFile[]): Array<{ file: string; line: number; content: string }> {
  const result: Array<{ file: string; line: number; content: string }> = [];
  for (const f of files) {
    for (const a of f.additions) {
      result.push({ file: f.path, line: a.newLineNumber ?? a.lineNumber, content: a.content });
    }
  }
  return result;
}

/** Total number of lines added across all files. */
export function countAddedLines(files: DiffFile[]): number {
  let count = 0;
  for (const f of files) {
    count += f.additions.length;
  }
  return count;
}

/** Concatenate all added lines as a single string for AI analysis. */
export function diffToText(files: DiffFile[]): string {
  const parts: string[] = [];
  for (const f of files) {
    parts.push(`--- ${f.oldPath ?? '/dev/null'}`);
    parts.push(`+++ ${f.path}`);
    for (const h of f.hunks) {
      parts.push(`@@ -${h.oldStart},${h.oldCount} +${h.newStart},${h.newCount} @@`);
      for (const l of h.lines) {
        const prefix = l.type === 'add' ? '+' : l.type === 'remove' ? '-' : ' ';
        parts.push(`${prefix}${l.content}`);
      }
    }
  }
  return parts.join('\n');
}
