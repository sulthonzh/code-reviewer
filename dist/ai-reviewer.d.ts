/**
 * AI reviewer — sends diffs to Z.AI for review and posts findings.
 *
 * Uses OpenAI SDK pointed at Z.AI's OpenAI-compatible endpoint.
 * Implements model routing: glm-4.5 (cheap/fast) → glm-5.1 (expensive/slow)
 * for escalation when complexity is detected.
 */
import { ReviewResult } from './types';
import { ProjectContext } from './types';
import { GitHubContext } from './github';
/** Main AI review function. */
export declare function runAiReview(params: {
    diffText: string;
    context: ProjectContext;
    apiKey: string;
    baseUrl?: string;
    model?: string;
    githubToken?: string;
    githubCtx?: GitHubContext;
}): Promise<ReviewResult>;
