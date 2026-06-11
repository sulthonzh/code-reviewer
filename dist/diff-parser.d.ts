/**
 * Unified diff parser.
 *
 * Parses unified diff format (as returned by `git diff` and GitHub's API)
 * into structured DiffFile objects with hunks and line-level detail.
 */
import { DiffFile } from './types';
export declare function parseDiff(diffText: string): DiffFile[];
/** Get all added lines from parsed diff files with their positions. */
export declare function getAddedLines(files: DiffFile[]): Array<{
    file: string;
    line: number;
    content: string;
}>;
/** Total number of lines added across all files. */
export declare function countAddedLines(files: DiffFile[]): number;
/** Concatenate all added lines as a single string for AI analysis. */
export declare function diffToText(files: DiffFile[]): string;
