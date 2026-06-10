import { describe, it, expect } from 'vitest';
import { parseDiff, getAddedLines, countAddedLines, diffToText } from '../src/diff-parser';

const SAMPLE_DIFF = `diff --git a/src/hello.ts b/src/hello.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/hello.ts
@@ -0,0 +1,5 @@
+import { greet } from './greet';
+
+export function main(): void {
+  console.log(greet('world'));
+}
diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,4 +1,5 @@
 export function greet(name: string): string {
-  return \`Hello \${name}\`;
+  return \`Hello, \${name}!\`;
 }
+
diff --git a/README.md b/README.md
deleted file mode 100644
index 3333333..0000000
--- a/README.md
+++ /dev/null
@@ -1,3 +0,0 @@
-# Hello
-World
-!
`;

describe('parseDiff', () => {
  it('parses multiple files from a diff', () => {
    const files = parseDiff(SAMPLE_DIFF);
    expect(files).toHaveLength(3);
    expect(files[0].path).toBe('src/hello.ts');
    expect(files[1].path).toBe('src/greet.ts');
    expect(files[2].path).toBe('README.md');
  });

  it('detects new files', () => {
    const files = parseDiff(SAMPLE_DIFF);
    expect(files[0].isNew).toBe(true);
    expect(files[0].oldPath).toBeNull();
  });

  it('detects deleted files', () => {
    const files = parseDiff(SAMPLE_DIFF);
    expect(files[2].isDeleted).toBe(true);
  });

  it('parses hunks with correct line counts', () => {
    const files = parseDiff(SAMPLE_DIFF);
    const helloFile = files[0];
    expect(helloFile.hunks).toHaveLength(1);
    expect(helloFile.hunks[0].newStart).toBe(1);
    expect(helloFile.hunks[0].newCount).toBe(5);
  });

  it('separates additions and deletions', () => {
    const files = parseDiff(SAMPLE_DIFF);
    const greetFile = files[1];
    expect(greetFile.additions.length).toBeGreaterThan(0);
    expect(greetFile.deletions).toHaveLength(1);
    expect(greetFile.deletions[0].content).toContain('Hello ${name}');
  });

  it('tracks line numbers for additions', () => {
    const files = parseDiff(SAMPLE_DIFF);
    const helloFile = files[0];
    const addLines = helloFile.additions;
    expect(addLines[0].newLineNumber).toBe(1);
    expect(addLines[1].newLineNumber).toBe(2);
    expect(addLines[2].newLineNumber).toBe(3);
  });

  it('handles empty diff', () => {
    const files = parseDiff('');
    expect(files).toHaveLength(0);
  });

  it('handles binary files', () => {
    const binaryDiff = `diff --git a/image.png b/image.png
Binary files /dev/null and b/image.png differ
`;
    const files = parseDiff(binaryDiff);
    expect(files[0].isBinary).toBe(true);
    expect(files[0].additions).toHaveLength(0);
  });
});

describe('getAddedLines', () => {
  it('returns all added lines with file paths', () => {
    const files = parseDiff(SAMPLE_DIFF);
    const added = getAddedLines(files);
    expect(added.length).toBeGreaterThan(0);
    expect(added[0].file).toBe('src/hello.ts');
    expect(added[0].content).toContain("import { greet } from './greet'");
  });
});

describe('countAddedLines', () => {
  it('counts total added lines across all files', () => {
    const files = parseDiff(SAMPLE_DIFF);
    const count = countAddedLines(files);
    // hello.ts: 5 additions, greet.ts: 2 additions (one remove + two adds)
    expect(count).toBe(7);
  });
});

describe('diffToText', () => {
  it('reconstructs diff text from parsed files', () => {
    const files = parseDiff(SAMPLE_DIFF);
    const text = diffToText(files);
    expect(text).toContain('+++ src/hello.ts');
    expect(text).toContain('+import { greet }');
    expect(text).toContain('-  return `Hello ${name}`;');
    expect(text).toContain('+  return `Hello, ${name}!`;');
  });
});
