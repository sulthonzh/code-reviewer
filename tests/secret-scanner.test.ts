import { describe, it, expect } from 'vitest';
import { scanDiffForSecrets, formatSecretFindings } from '../src/secret-scanner';

// FAKE secrets for testing — match scanner regex patterns but are NOT real credentials
const DIFF_WITH_SECRETS = `diff --git a/src/config.ts b/src/config.ts
new file mode 100644
--- /dev/null
+++ b/src/config.ts
@@ -0,0 +1,8 @@
+const githubPat = "ghp_0123456789abcdef0123456789abcdef01234567";
+const fineGrainedPat = "github_pat_0123456789abcdef01234567";
+const npmToken = "npm_0123456789abcdef0123456789abcdef01234567";
+const awsKey = "AKIA0123456789ABCDEF";
+const apiKey = "apiKey: \"ak_0123456789abcdef0123456789\"";
+const password = "password = \"supersecret12345\"";
+const privateKey = "-----BEGIN RSA PRIVATE KEY-----";
+console.log("Authorization: Bearer abcdefghijklmnop0123456789");
`;

const CLEAN_DIFF = `diff --git a/src/clean.ts b/src/clean.ts
--- /dev/null
+++ b/src/clean.ts
@@ -0,0 +1,3 @@
+const name = "world";
+const greeting = \`Hello \${name}\`;
+export { greeting };
`;

describe('scanDiffForSecrets', () => {
  it('detects GitHub PAT (classic)', () => {
    const findings = scanDiffForSecrets(DIFF_WITH_SECRETS);
    const ghPat = findings.find(f => f.type === 'GitHub PAT (classic)');
    expect(ghPat).toBeDefined();
    expect(ghPat!.severity).toBe('critical');
    expect(ghPat!.file).toBe('src/config.ts');
  });

  it('detects GitHub PAT (fine-grained)', () => {
    const findings = scanDiffForSecrets(DIFF_WITH_SECRETS);
    const fineGrained = findings.find(f => f.type === 'GitHub PAT (fine-grained)');
    expect(fineGrained).toBeDefined();
    expect(fineGrained!.severity).toBe('critical');
  });

  it('detects NPM token', () => {
    const findings = scanDiffForSecrets(DIFF_WITH_SECRETS);
    const npm = findings.find(f => f.type === 'NPM access token');
    expect(npm).toBeDefined();
    expect(npm!.severity).toBe('critical');
  });

  it('detects AWS Access Key ID', () => {
    const findings = scanDiffForSecrets(DIFF_WITH_SECRETS);
    const aws = findings.find(f => f.type === 'AWS Access Key ID');
    expect(aws).toBeDefined();
    expect(aws!.severity).toBe('critical');
  });

  it('detects private keys', () => {
    const findings = scanDiffForSecrets(DIFF_WITH_SECRETS);
    const pk = findings.find(f => f.type === 'Private key');
    expect(pk).toBeDefined();
    expect(pk!.severity).toBe('critical');
  });

  it('detects password assignments', () => {
    const findings = scanDiffForSecrets(DIFF_WITH_SECRETS);
    const pwd = findings.find(f => f.type === 'Password in variable');
    expect(pwd).toBeDefined();
    expect(pwd!.severity).toBe('high');
  });

  it('detects bearer tokens', () => {
    const findings = scanDiffForSecrets(DIFF_WITH_SECRETS);
    const bearer = findings.find(f => f.type === 'Generic bearer token');
    expect(bearer).toBeDefined();
    expect(bearer!.severity).toBe('medium');
  });

  it('returns empty for clean diffs', () => {
    const findings = scanDiffForSecrets(CLEAN_DIFF);
    expect(findings).toHaveLength(0);
  });

  it('redacts secret values in findings', () => {
    const findings = scanDiffForSecrets(DIFF_WITH_SECRETS);
    const ghPat = findings.find(f => f.type === 'GitHub PAT (classic)');
    expect(ghPat!.redacted).toContain('****');
    expect(ghPat!.redacted).not.toContain('ghp_0123456789abcdef0123456789abcdef01234567');
  });

  it('does not scan binary files', () => {
    const binaryDiff = `diff --git a/image.png b/image.png
Binary files /dev/null and b/image.png differ
`;
    const findings = scanDiffForSecrets(binaryDiff);
    expect(findings).toHaveLength(0);
  });

  it('includes file and line info', () => {
    const findings = scanDiffForSecrets(DIFF_WITH_SECRETS);
    for (const f of findings) {
      expect(f.file).toBe('src/config.ts');
      expect(f.line).toBeGreaterThan(0);
      expect(f.preview.length).toBeGreaterThan(0);
    }
  });
});

describe('formatSecretFindings', () => {
  it('formats findings as readable text', () => {
    const findings = scanDiffForSecrets(DIFF_WITH_SECRETS);
    const formatted = formatSecretFindings(findings);
    expect(formatted).toContain('potential secret');
    expect(formatted).toContain('CRITICAL');
    expect(formatted).toContain('GitHub PAT');
  });

  it('handles empty findings', () => {
    const formatted = formatSecretFindings([]);
    expect(formatted).toContain('No secrets found');
  });
});
