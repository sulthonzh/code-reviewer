/**
 * Secret scanner — detects leaked credentials in diff content.
 *
 * Regex patterns for common secret formats. Scans only added lines
 * so we don't flag pre-existing secrets.
 */
import { SecretFinding } from './types';
export declare function scanDiffForSecrets(diffText: string): SecretFinding[];
export declare function formatSecretFindings(findings: SecretFinding[]): string;
