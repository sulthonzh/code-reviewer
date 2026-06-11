/**
 * Quality gate — enforces code quality rules on added lines.
 *
 * Rules are intentionally strict to catch common AI-generated code patterns.
 * Only scans added/modified lines in the diff.
 */
import { QualityFinding, DiffFile } from './types';
export declare function runQualityGate(files: DiffFile[]): QualityFinding[];
export declare function formatQualityReport(findings: QualityFinding[]): string;
export declare function qualityGatePassed(findings: QualityFinding[]): boolean;
