import { describe, it, expect } from 'vitest';
import { detectProjectContext } from '../src/context-detector';

describe('detectProjectContext', () => {
  it('detects Next.js project from next.config.js', () => {
    const result = detectProjectContext({
      files: ['next.config.js', 'package.json', 'src/pages/index.tsx'],
      packageJson: null,
    });
    expect(result.type).toBe('nextjs');
    expect(result.framework).toBe('nextjs');
    expect(result.language).toBe('typescript');
  });

  it('detects Next.js project from next.config.mjs', () => {
    const result = detectProjectContext({
      files: ['next.config.mjs', 'app/page.tsx'],
      packageJson: null,
    });
    expect(result.type).toBe('nextjs');
  });

  it('detects Next.js project from next.config.ts', () => {
    const result = detectProjectContext({
      files: ['next.config.ts'],
      packageJson: null,
    });
    expect(result.type).toBe('nextjs');
  });

  it('detects CLI tool from bin in package.json', () => {
    const result = detectProjectContext({
      files: ['package.json', 'src/index.ts'],
      packageJson: {
        name: 'my-cli',
        bin: { 'my-cli': './dist/index.js' },
      } as Record<string, unknown>,
    });
    expect(result.type).toBe('cli');
    expect(result.isNpmPackage).toBe(true);
  });

  it('detects Python project from .py files', () => {
    const result = detectProjectContext({
      files: ['main.py', 'utils.py', 'requirements.txt'],
      packageJson: null,
    });
    expect(result.type).toBe('python');
    expect(result.language).toBe('python');
    expect(result.testRunner).toBe('pytest');
  });

  it('detects Python with Django', () => {
    const result = detectProjectContext({
      files: ['manage.py', 'myapp/models.py'],
      packageJson: null,
    });
    expect(result.type).toBe('python');
    expect(result.framework).toBe('django');
  });

  it('detects Python with FastAPI', () => {
    const result = detectProjectContext({
      files: ['main.py', 'app/fastapi_routes.py'],
      packageJson: null,
    });
    expect(result.type).toBe('python');
    expect(result.framework).toBe('fastapi');
  });

  it('detects Go project from go.mod', () => {
    const result = detectProjectContext({
      files: ['go.mod', 'main.go', 'handler/handler.go'],
      packageJson: null,
    });
    expect(result.type).toBe('go');
    expect(result.language).toBe('go');
    expect(result.testRunner).toBe('go test');
  });

  it('detects Zig project from .zig files', () => {
    const result = detectProjectContext({
      files: ['build.zig', 'src/main.zig'],
      packageJson: null,
    });
    expect(result.type).toBe('zig');
    expect(result.language).toBe('zig');
  });

  it('detects TypeScript language from .ts files', () => {
    const result = detectProjectContext({
      files: ['package.json', 'src/index.ts'],
      packageJson: { name: 'test' } as Record<string, unknown>,
    });
    expect(result.language).toBe('typescript');
  });

  it('detects vitest from devDependencies', () => {
    const result = detectProjectContext({
      files: ['package.json', 'src/index.ts'],
      packageJson: {
        name: 'test',
        devDependencies: { vitest: '^2.0.0' },
      } as Record<string, unknown>,
    });
    expect(result.testRunner).toBe('vitest');
  });

  it('detects jest from devDependencies', () => {
    const result = detectProjectContext({
      files: ['package.json', 'src/index.ts'],
      packageJson: {
        name: 'test',
        devDependencies: { jest: '^29.0.0' },
      } as Record<string, unknown>,
    });
    expect(result.testRunner).toBe('jest');
  });

  it('returns unknown for empty file list', () => {
    const result = detectProjectContext({
      files: [],
      packageJson: null,
    });
    expect(result.type).toBe('unknown');
    expect(result.language).toBe('unknown');
  });

  it('parses package.json correctly', () => {
    const result = detectProjectContext({
      files: ['package.json'],
      packageJson: {
        name: '@scope/pkg',
        main: 'dist/index.js',
        exports: { '.': './dist/index.js' },
        scripts: { build: 'tsc' },
        dependencies: { express: '^4.0.0' },
        devDependencies: {},
      } as Record<string, unknown>,
    });
    expect(result.packageJson).not.toBeNull();
    expect(result.packageJson!.name).toBe('@scope/pkg');
    expect(result.packageJson!.main).toBe('dist/index.js');
    expect(result.framework).toBe('express');
  });
});
