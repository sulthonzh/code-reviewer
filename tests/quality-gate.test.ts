import { describe, it, expect } from 'vitest';
import { runQualityGate, formatQualityReport, qualityGatePassed } from '../src/quality-gate';
import { DiffFile } from '../src/types';

function makeDiffFile(path: string, addedLines: string[]): DiffFile {
  return {
    path,
    oldPath: null,
    isNew: true,
    isDeleted: false,
    isBinary: false,
    isRenamed: false,
    additions: addedLines.map((content, i) => ({
      type: 'add' as const,
      content,
      lineNumber: i + 1,
      newLineNumber: i + 1,
    })),
    deletions: [],
    hunks: [],
  };
}

describe('runQualityGate', () => {
  it('flags as any usage', () => {
    const files = [makeDiffFile('src/test.ts', ['const x = data as any;'])];
    const findings = runQualityGate(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('no-as-any');
    expect(findings[0].severity).toBe('error');
  });

  it('flags @ts-ignore', () => {
    const files = [makeDiffFile('src/test.ts', ['// @ts-ignore', 'const x = bad();'])];
    const findings = runQualityGate(files);
    const tsIgnore = findings.find(f => f.rule === 'no-ts-ignore');
    expect(tsIgnore).toBeDefined();
    expect(tsIgnore!.severity).toBe('error');
  });

  it('flags @ts-expect-error', () => {
    const files = [makeDiffFile('src/test.ts', ['// @ts-expect-error'])];
    const findings = runQualityGate(files);
    const tsExpect = findings.find(f => f.rule === 'no-ts-expect-error');
    expect(tsExpect).toBeDefined();
    expect(tsExpect!.severity).toBe('error');
  });

  it('flags empty catch blocks', () => {
    const files = [makeDiffFile('src/test.ts', ['try {', '  doThing();', '} catch (e) { }'])];
    const findings = runQualityGate(files);
    const emptyCatch = findings.find(f => f.rule === 'no-empty-catch');
    expect(emptyCatch).toBeDefined();
    expect(emptyCatch!.severity).toBe('error');
  });

  it('flags console.log as warning', () => {
    const files = [makeDiffFile('src/test.ts', ['console.log("debug")'])];
    const findings = runQualityGate(files);
    const consoleLog = findings.find(f => f.rule === 'no-console-log');
    expect(consoleLog).toBeDefined();
    expect(consoleLog!.severity).toBe('warning');
  });

  it('flags eval() usage', () => {
    const files = [makeDiffFile('src/test.ts', ['eval(userInput)'])];
    const findings = runQualityGate(files);
    const evalFinding = findings.find(f => f.rule === 'no-eval');
    expect(evalFinding).toBeDefined();
    expect(evalFinding!.severity).toBe('error');
  });

  it('flags innerHTML assignment', () => {
    const files = [makeDiffFile('src/test.ts', ['element.innerHTML = userInput;'])];
    const findings = runQualityGate(files);
    const innerHtml = findings.find(f => f.rule === 'no-inner-html');
    expect(innerHtml).toBeDefined();
    expect(innerHtml!.severity).toBe('error');
  });

  it('flags var usage', () => {
    const files = [makeDiffFile('src/test.ts', ['var x = 1;'])];
    const findings = runQualityGate(files);
    const varFinding = findings.find(f => f.rule === 'no-var');
    expect(varFinding).toBeDefined();
    expect(varFinding!.severity).toBe('warning');
  });

  it('flags TODO/FIXME as warnings', () => {
    const files = [makeDiffFile('src/test.ts', ['// TODO: fix this later'])];
    const findings = runQualityGate(files);
    const todo = findings.find(f => f.rule === 'no-todo');
    expect(todo).toBeDefined();
    expect(todo!.severity).toBe('warning');
  });

  it('passes clean code', () => {
    const files = [makeDiffFile('src/test.ts', [
      'const greeting: string = "hello";',
      'export function add(a: number, b: number): number {',
      '  return a + b;',
      '}',
    ])];
    const findings = runQualityGate(files);
    expect(findings).toHaveLength(0);
  });

  it('ignores non-code files', () => {
    const files = [makeDiffFile('README.md', ['console.log("should not flag")'])];
    const findings = runQualityGate(files);
    expect(findings).toHaveLength(0);
  });

  it('warns about missing tests for significant changes', () => {
    const files = [makeDiffFile('src/calculator.ts', Array(10).fill('const x = 1;'))];
    const findings = runQualityGate(files);
    const missingTests = findings.find(f => f.rule === 'missing-tests');
    expect(missingTests).toBeDefined();
    expect(missingTests!.severity).toBe('warning');
  });

  it('does not warn about missing tests when test file is present', () => {
    const files = [
      makeDiffFile('src/calculator.ts', Array(10).fill('const x = 1;')),
      makeDiffFile('src/calculator.test.ts', ['test("adds", () => {});']),
    ];
    const findings = runQualityGate(files);
    const missingTests = findings.find(f => f.rule === 'missing-tests');
    expect(missingTests).toBeUndefined();
  });
});

describe('qualityGatePassed', () => {
  it('returns true when no errors', () => {
    const findings = [
      { file: 'test.ts', line: 1, rule: 'test', severity: 'warning' as const, message: 'warn' },
    ];
    expect(qualityGatePassed(findings)).toBe(true);
  });

  it('returns false when errors present', () => {
    const findings = [
      { file: 'test.ts', line: 1, rule: 'test', severity: 'error' as const, message: 'err' },
    ];
    expect(qualityGatePassed(findings)).toBe(false);
  });

  it('returns true for empty findings', () => {
    expect(qualityGatePassed([])).toBe(true);
  });
});

describe('formatQualityReport', () => {
  it('formats passing report', () => {
    const report = formatQualityReport([]);
    expect(report).toContain('All checks passed');
    expect(report).toContain('✅');
  });

  it('formats failing report with errors and warnings', () => {
    const findings = [
      { file: 'a.ts', line: 1, rule: 'no-as-any', severity: 'error' as const, message: 'No as any' },
      { file: 'b.ts', line: 2, rule: 'no-console-log', severity: 'warning' as const, message: 'No console.log' },
    ];
    const report = formatQualityReport(findings);
    expect(report).toContain('❌');
    expect(report).toContain('Errors');
    expect(report).toContain('Warnings');
    expect(report).toContain('no-as-any');
  });
});
