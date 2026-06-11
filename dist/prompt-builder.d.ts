/**
 * Prompt builder — constructs AI review prompts with project context.
 *
 * Injects project-specific rules into system prompts and structures
 * the expected JSON output format for findings.
 */
import { ProjectContext, DiffFile } from './types';
export declare function buildSystemPrompt(context: ProjectContext): string;
export declare function buildUserPrompt(files: DiffFile[]): string;
