/**
 * Context detector — identifies project type from repository file listing.
 *
 * Detects: Next.js, Node.js CLI, Python, Go, Zig.
 * Parses package.json for deeper framework/tooling info.
 */
import { ProjectContext } from './types';
interface FileList {
    files: string[];
    packageJson: Record<string, unknown> | null;
}
export declare function detectProjectContext(fileList: FileList): ProjectContext;
export {};
