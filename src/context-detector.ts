/**
 * Context detector — identifies project type from repository file listing.
 *
 * Detects: Next.js, Node.js CLI, Python, Go, Zig.
 * Parses package.json for deeper framework/tooling info.
 */

import { ProjectContext, PackageJsonInfo } from './types';

interface FileList {
  files: string[];
  packageJson: Record<string, unknown> | null;
}

export function detectProjectContext(fileList: FileList): ProjectContext {
  const { files, packageJson } = fileList;
  const pkgInfo = parsePackageJson(packageJson);

  const hasNextConfig = files.some(f =>
    f === 'next.config.js' || f === 'next.config.mjs' || f === 'next.config.ts'
  );
  if (hasNextConfig) {
    return {
      type: 'nextjs',
      language: 'typescript',
      framework: 'nextjs',
      testRunner: detectTestRunner(pkgInfo, 'vitest'),
      isNpmPackage: false,
      packageJson: pkgInfo,
    };
  }

  if (files.some(f => f === 'go.mod')) {
    return {
      type: 'go',
      language: 'go',
      framework: null,
      testRunner: 'go test',
      isNpmPackage: false,
      packageJson: null,
    };
  }

  if (files.some(f => f.endsWith('.zig') || f === 'build.zig')) {
    return {
      type: 'zig',
      language: 'zig',
      framework: null,
      testRunner: 'zig build test',
      isNpmPackage: false,
      packageJson: null,
    };
  }

  if (files.some(f => f.endsWith('.py') || f === 'requirements.txt' || f === 'pyproject.toml')) {
    return {
      type: 'python',
      language: 'python',
      framework: detectPythonFramework(files),
      testRunner: detectPythonTestRunner(files),
      isNpmPackage: false,
      packageJson: null,
    };
  }

  if (pkgInfo && pkgInfo.bin && Object.keys(pkgInfo.bin).length > 0) {
    return {
      type: 'cli',
      language: detectLanguage(files),
      framework: detectNodeFramework(pkgInfo),
      testRunner: detectTestRunner(pkgInfo, 'vitest'),
      isNpmPackage: true,
      packageJson: pkgInfo,
    };
  }

  if (pkgInfo) {
    return {
      type: 'cli',
      language: detectLanguage(files),
      framework: detectNodeFramework(pkgInfo),
      testRunner: detectTestRunner(pkgInfo, 'vitest'),
      isNpmPackage: !!(pkgInfo.main || pkgInfo.exports),
      packageJson: pkgInfo,
    };
  }

  return {
    type: 'unknown',
    language: detectLanguage(files),
    framework: null,
    testRunner: null,
    isNpmPackage: false,
    packageJson: null,
  };
}

function parsePackageJson(raw: Record<string, unknown> | null): PackageJsonInfo | null {
  if (!raw) return null;

  return {
    name: typeof raw.name === 'string' ? raw.name : 'unknown',
    main: typeof raw.main === 'string' ? raw.main : null,
    bin: typeof raw.bin === 'object' && raw.bin !== null
      ? raw.bin as Record<string, string>
      : null,
    exports: typeof raw.exports === 'object' && raw.exports !== null
      ? raw.exports as Record<string, unknown>
      : null,
    scripts: typeof raw.scripts === 'object' && raw.scripts !== null
      ? raw.scripts as Record<string, string>
      : {},
    dependencies: typeof raw.dependencies === 'object' && raw.dependencies !== null
      ? raw.dependencies as Record<string, string>
      : {},
    devDependencies: typeof raw.devDependencies === 'object' && raw.devDependencies !== null
      ? raw.devDependencies as Record<string, string>
      : {},
  };
}

function detectLanguage(files: string[]): string {
  const hasTs = files.some(f => f.endsWith('.ts') || f.endsWith('.tsx'));
  const hasJs = files.some(f => f.endsWith('.js') || f.endsWith('.jsx'));
  if (hasTs) return 'typescript';
  if (hasJs) return 'javascript';
  return 'unknown';
}

function detectNodeFramework(pkg: PackageJsonInfo | null): string | null {
  if (!pkg) return null;
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (allDeps['next']) return 'nextjs';
  if (allDeps['express']) return 'express';
  if (allDeps['fastify']) return 'fastify';
  if (allDeps['commander'] || allDeps['yargs'] || allDeps['meow']) return 'cli';
  return null;
}

function detectTestRunner(pkg: PackageJsonInfo | null, fallback: string): string | null {
  if (!pkg) return fallback;
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (allDeps['vitest']) return 'vitest';
  if (allDeps['jest']) return 'jest';
  if (allDeps['mocha']) return 'mocha';
  if (pkg.scripts['test']?.includes('vitest')) return 'vitest';
  if (pkg.scripts['test']?.includes('jest')) return 'jest';
  return fallback;
}

function detectPythonFramework(files: string[]): string | null {
  if (files.some(f => f.includes('django') || f === 'manage.py')) return 'django';
  if (files.some(f => f.includes('flask'))) return 'flask';
  if (files.some(f => f.includes('fastapi'))) return 'fastapi';
  return null;
}

function detectPythonTestRunner(files: string[]): string {
  if (files.some(f => f === 'pytest.ini' || f === 'pyproject.toml')) return 'pytest';
  if (files.some(f => f === 'setup.cfg')) return 'unittest';
  return 'pytest';
}
