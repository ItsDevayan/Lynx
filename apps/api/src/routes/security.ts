/**
 * /api/security — Security scanning
 *
 * POST /api/security/scan  → runs npm audit / pip-audit / cargo audit
 *                            + optional Semgrep SAST if available
 *                            + executor LLM summary of findings
 */

import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { execute } from '@lynx/core';

const execFileP = promisify(execFile);

// ─── Types ────────────────────────────────────────────────────────────────────

interface CVEFinding {
  packageName: string;
  installedVersion: string;
  fixedVersion?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  cveId: string;
  title: string;
  url?: string;
}

interface SASTFinding {
  ruleId: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  file: string;
  line: number;
  col?: number;
}

// ─── npm audit parser ────────────────────────────────────────────────────────

async function runNpmAudit(projectPath: string): Promise<CVEFinding[]> {
  const pkgFile = join(projectPath, 'package.json');
  if (!existsSync(pkgFile)) return [];

  try {
    const { stdout } = await execFileP('npm', ['audit', '--json'], {
      cwd: projectPath,
      timeout: 30_000,
    });

    const data = JSON.parse(stdout) as {
      vulnerabilities?: Record<string, {
        name: string;
        severity: string;
        via: Array<{ cve?: string; title?: string; url?: string; range?: string }>;
        fixAvailable?: boolean | { version?: string };
        nodes?: string[];
      }>;
    };

    const findings: CVEFinding[] = [];
    for (const [, vuln] of Object.entries(data.vulnerabilities ?? {})) {
      const via = Array.isArray(vuln.via) ? vuln.via : [];
      const advisory = via.find(v => typeof v === 'object' && v.cve) ?? via[0];
      if (!advisory || typeof advisory !== 'object') continue;

      const sev = vuln.severity.toUpperCase() as CVEFinding['severity'];
      const fixVer = typeof vuln.fixAvailable === 'object'
        ? vuln.fixAvailable?.version
        : undefined;

      findings.push({
        packageName: vuln.name,
        installedVersion: vuln.nodes?.[0]?.split('@').pop() ?? '?',
        fixedVersion: fixVer,
        severity: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(sev) ? sev : 'UNKNOWN',
        cveId: advisory.cve ?? 'unknown',
        title: advisory.title ?? vuln.name,
        url: advisory.url,
      });

      if (findings.length >= 50) break;
    }
    return findings;
  } catch (err: any) {
    // npm audit exits 1 when vulnerabilities found — that's fine
    if (err.stdout) {
      try {
        const data = JSON.parse(err.stdout);
        // recurse into parsed output
        if (data.vulnerabilities) {
          return runNpmAuditFromData(data);
        }
      } catch { /* malformed */ }
    }
    return [];
  }
}

function runNpmAuditFromData(data: any): CVEFinding[] {
  const findings: CVEFinding[] = [];
  for (const [, vuln] of Object.entries<any>(data.vulnerabilities ?? {})) {
    const via = Array.isArray(vuln.via) ? vuln.via : [];
    const advisory = via.find((v: any) => typeof v === 'object' && v.cve) ?? via[0];
    if (!advisory || typeof advisory !== 'object') continue;
    const sev = String(vuln.severity).toUpperCase() as CVEFinding['severity'];
    findings.push({
      packageName: vuln.name,
      installedVersion: vuln.nodes?.[0]?.split('@').pop() ?? '?',
      fixedVersion: typeof vuln.fixAvailable === 'object' ? vuln.fixAvailable?.version : undefined,
      severity: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(sev) ? sev : 'UNKNOWN',
      cveId: advisory.cve ?? 'unknown',
      title: advisory.title ?? vuln.name,
      url: advisory.url,
    });
    if (findings.length >= 50) break;
  }
  return findings;
}

// ─── pip-audit ────────────────────────────────────────────────────────────────

async function runPipAudit(projectPath: string): Promise<CVEFinding[]> {
  const hasRequirements = existsSync(join(projectPath, 'requirements.txt'))
    || existsSync(join(projectPath, 'pyproject.toml'))
    || existsSync(join(projectPath, 'setup.py'));
  if (!hasRequirements) return [];

  try {
    const { stdout } = await execFileP('pip-audit', ['--format=json', '--progress-spinner=off'], {
      cwd: projectPath,
      timeout: 60_000,
    });

    const data = JSON.parse(stdout) as Array<{
      name: string;
      version: string;
      vulns: Array<{
        id: string;
        fix_versions: string[];
        description: string;
        aliases?: string[];
      }>;
    }>;

    const findings: CVEFinding[] = [];
    for (const pkg of data ?? []) {
      for (const v of pkg.vulns ?? []) {
        const cveId = v.aliases?.find(a => a.startsWith('CVE-')) ?? v.id;
        findings.push({
          packageName: pkg.name,
          installedVersion: pkg.version,
          fixedVersion: v.fix_versions?.[0],
          severity: 'UNKNOWN', // pip-audit doesn't always include CVSS severity
          cveId,
          title: v.description?.slice(0, 120) ?? cveId,
        });
        if (findings.length >= 50) break;
      }
      if (findings.length >= 50) break;
    }
    return findings;
  } catch (err: any) {
    if (err.stdout) {
      try { return JSON.parse(err.stdout).flatMap((p: any) =>
        (p.vulns ?? []).slice(0, 5).map((v: any) => ({
          packageName: p.name, installedVersion: p.version,
          fixedVersion: v.fix_versions?.[0], severity: 'UNKNOWN' as const,
          cveId: v.aliases?.find((a: string) => a.startsWith('CVE-')) ?? v.id,
          title: v.description?.slice(0, 120) ?? v.id,
        }))
      ); } catch { /* malformed */ }
    }
    return []; // pip-audit not installed
  }
}

// ─── cargo audit ─────────────────────────────────────────────────────────────

async function runCargoAudit(projectPath: string): Promise<CVEFinding[]> {
  if (!existsSync(join(projectPath, 'Cargo.toml'))) return [];

  try {
    const { stdout } = await execFileP('cargo', ['audit', '--json'], {
      cwd: projectPath,
      timeout: 60_000,
    });

    const data = JSON.parse(stdout) as {
      vulnerabilities?: {
        list: Array<{
          advisory: { id: string; title: string; url: string; date: string };
          versions: { patched: string[] };
          package: { name: string; version: string };
          severity?: string;
        }>;
      };
    };

    return (data.vulnerabilities?.list ?? []).slice(0, 50).map(v => ({
      packageName:      v.package.name,
      installedVersion: v.package.version,
      fixedVersion:     v.versions.patched?.[0],
      severity:         (v.severity?.toUpperCase() as CVEFinding['severity']) ?? 'UNKNOWN',
      cveId:            v.advisory.id,
      title:            v.advisory.title,
      url:              v.advisory.url,
    }));
  } catch {
    return []; // cargo audit not installed
  }
}

// ─── Semgrep SAST ────────────────────────────────────────────────────────────

async function runSemgrep(projectPath: string): Promise<SASTFinding[]> {
  try {
    const { stdout } = await execFileP(
      'semgrep',
      ['--config=auto', '--json', '--quiet', projectPath],
      { timeout: 60_000 }
    );

    const data = JSON.parse(stdout) as {
      results?: Array<{
        check_id: string;
        extra: { severity: string; message: string };
        path: string;
        start: { line: number; col: number };
      }>;
    };

    return (data.results ?? []).slice(0, 50).map(r => ({
      ruleId: r.check_id,
      severity: r.extra.severity === 'ERROR' ? 'ERROR' :
                r.extra.severity === 'WARNING' ? 'WARNING' : 'INFO',
      message: r.extra.message,
      file: r.path.replace(projectPath, '').replace(/^[/\\]/, ''),
      line: r.start.line,
      col: r.start.col,
    }));
  } catch {
    return []; // semgrep not installed or no findings
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function securityRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { projectPath: string; sast?: boolean } }>(
    '/api/security/scan',
    {
      schema: {
        body: {
          type: 'object',
          required: ['projectPath'],
          properties: {
            projectPath: { type: 'string' },
            sast:        { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const { projectPath, sast = true } = req.body;

      if (!existsSync(projectPath)) {
        return reply.status(400).send({ error: 'Project path does not exist' });
      }

      // Run all CVE scanners in parallel
      const [npmCves, pipCves, cargoCves, sastFindings] = await Promise.all([
        runNpmAudit(projectPath),
        runPipAudit(projectPath),
        runCargoAudit(projectPath),
        sast ? runSemgrep(projectPath) : Promise.resolve<SASTFinding[]>([]),
      ]);

      const cves = [...npmCves, ...pipCves, ...cargoCves];

      // LLM summary of top findings
      let summary: string | undefined;
      const criticalOrHigh = cves.filter(c => c.severity === 'CRITICAL' || c.severity === 'HIGH');
      const sastErrors = sastFindings.filter(s => s.severity === 'ERROR');

      if (criticalOrHigh.length > 0 || sastErrors.length > 0) {
        try {
          const bullets = [
            ...criticalOrHigh.slice(0, 5).map(c => `CVE [${c.severity}] ${c.packageName}: ${c.title}`),
            ...sastErrors.slice(0, 5).map(s => `SAST [${s.severity}] ${s.file}:${s.line}: ${s.message.slice(0, 100)}`),
          ].join('\n');

          const resp = await execute([
            { role: 'system', content: 'You are a security analyst. Summarize these findings in 2-3 sentences and recommend the most urgent action.' },
            { role: 'user', content: `Security findings:\n${bullets}` },
          ], { maxTokens: 200, temperature: 0.1 });

          summary = resp.content;
        } catch { /* summary optional */ }
      }

      return reply.send({
        cves,
        sast: sastFindings,
        scannedAt: new Date().toISOString(),
        summary,
      });
    },
  );
}
