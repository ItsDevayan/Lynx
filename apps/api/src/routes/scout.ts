/**
 * /api/scout — Competitor intelligence
 *
 * GET  /api/scout         → return cached report (or empty if never run)
 * POST /api/scout/run     → run now: GitHub trending + HN mentions + LLM analysis
 *
 * Data sources (no auth required):
 *   - GitHub trending: github.com/trending (HTML scrape or unofficial API)
 *   - HN Algolia:      hn.algolia.com/api/v1/search
 *   - ProductHunt RSS: producthunt.com/feed (RSS)
 */

import type { FastifyInstance } from 'fastify';
import { execute } from '@lynx/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GithubTrendingRepo {
  name: string;
  description: string;
  url: string;
  language?: string;
  stars: number;
  starsToday: number;
}

export interface HNStory {
  title: string;
  url?: string;
  points: number;
  numComments: number;
  createdAt: string;
}

export interface ScoutReport {
  generatedAt: string;
  topics: string[];
  github: GithubTrendingRepo[];
  hn: HNStory[];
  analysis: string;
  featureGaps: string[];
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

let _cachedReport: ScoutReport | null = null;
let _runningNow = false;

// ─── GitHub trending scrape ───────────────────────────────────────────────────

async function fetchGithubTrending(language?: string): Promise<GithubTrendingRepo[]> {
  const url = `https://github.com/trending${language ? `/${encodeURIComponent(language)}` : ''}?since=weekly`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Lynx-Scout/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const repos: GithubTrendingRepo[] = [];
    // Parse <article class="Box-row"> blocks
    const articleRe = /<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
    let match;
    while ((match = articleRe.exec(html)) !== null && repos.length < 10) {
      const block = match[1];
      const nameMatch = block.match(/href="\/([^"]+)"/);
      const descMatch = block.match(/<p[^>]*>\s*([\s\S]*?)\s*<\/p>/);
      const starsMatch = block.match(/(\d[\d,]*)\s*stars this week/i) ??
                         block.match(/title="(\d[\d,]*) stars this week"/i);
      const totalStarsMatch = block.match(/aria-label="(\d[\d,]*) stars"/);
      const langMatch = block.match(/itemprop="programmingLanguage">([^<]+)<\/span>/);

      if (!nameMatch) continue;
      const name = nameMatch[1].trim();
      const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      const starsToday = starsMatch ? parseInt(starsMatch[1].replace(/,/g, ''), 10) : 0;
      const stars = totalStarsMatch ? parseInt(totalStarsMatch[1].replace(/,/g, ''), 10) : 0;
      const language = langMatch ? langMatch[1].trim() : undefined;

      repos.push({
        name,
        description,
        url: `https://github.com/${name}`,
        language,
        stars,
        starsToday,
      });
    }
    return repos;
  } catch {
    return [];
  }
}

// ─── HN Algolia search ────────────────────────────────────────────────────────

async function fetchHNMentions(queries: string[]): Promise<HNStory[]> {
  const stories: HNStory[] = [];
  for (const q of queries.slice(0, 3)) {
    try {
      const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=5`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const data = await res.json() as {
        hits: Array<{
          title: string;
          url?: string;
          points: number;
          num_comments: number;
          created_at: string;
        }>;
      };
      for (const h of data.hits ?? []) {
        if (stories.some(s => s.title === h.title)) continue; // dedup
        stories.push({
          title: h.title,
          url: h.url,
          points: h.points ?? 0,
          numComments: h.num_comments ?? 0,
          createdAt: h.created_at,
        });
      }
    } catch { /* network error — skip */ }
  }
  return stories.sort((a, b) => b.points - a.points).slice(0, 15);
}

// ─── LLM analysis ─────────────────────────────────────────────────────────────

async function analyzeWithLLM(
  topics: string[],
  github: GithubTrendingRepo[],
  hn: HNStory[],
): Promise<{ analysis: string; featureGaps: string[] }> {
  const githubSummary = github.slice(0, 6).map(r =>
    `• ${r.name} (${r.language ?? '?'}, +${r.starsToday} stars/wk): ${r.description?.slice(0, 100)}`
  ).join('\n');

  const hnSummary = hn.slice(0, 8).map(h =>
    `• [${h.points}pts] ${h.title}`
  ).join('\n');

  const prompt = `You are a product intelligence analyst for a developer tool called Lynx — an AI-first DevOps platform (error monitoring, AI Brain assistant, HITL code approvals, security scanning, test runner).

Topics we're tracking: ${topics.join(', ')}

GitHub trending this week:
${githubSummary || '(no data)'}

HackerNews stories:
${hnSummary || '(no data)'}

Write a 3-4 sentence analysis of what's trending in the developer tools / AI engineering space right now.
Then list 3-5 specific feature gaps or opportunities for Lynx based on what competitors are shipping.

Format:
ANALYSIS:
<your analysis>

FEATURE_GAPS:
- <gap 1>
- <gap 2>
- <gap 3>`;

  try {
    const resp = await execute([
      { role: 'system', content: 'You are a product intelligence analyst. Be concise and technical.' },
      { role: 'user', content: prompt },
    ], { maxTokens: 400, temperature: 0.3 });

    const text = resp.content ?? '';
    const analysisMatch = text.match(/ANALYSIS:\s*([\s\S]*?)(?=FEATURE_GAPS:|$)/i);
    const gapsMatch = text.match(/FEATURE_GAPS:\s*([\s\S]*?)$/i);

    const analysis = analysisMatch ? analysisMatch[1].trim() : text.slice(0, 300);
    const featureGaps = gapsMatch
      ? gapsMatch[1].trim().split('\n').map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean)
      : [];

    return { analysis, featureGaps };
  } catch {
    return {
      analysis: 'LLM analysis unavailable — orchestrator not configured.',
      featureGaps: [],
    };
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function scoutRoutes(app: FastifyInstance): Promise<void> {
  // GET cached report
  app.get('/api/scout', async (_, reply) => {
    return reply.send({
      report: _cachedReport,
      running: _runningNow,
      lastRun: _cachedReport?.generatedAt ?? null,
    });
  });

  // POST /api/scout/run — run now
  app.post<{
    Body: { topics?: string[] };
  }>(
    '/api/scout/run',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            topics: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (req, reply) => {
      if (_runningNow) {
        return reply.status(409).send({ error: 'Scout run already in progress' });
      }

      const topics = req.body?.topics ?? [
        'AI devops', 'developer observability', 'code review AI', 'error monitoring',
      ];

      _runningNow = true;
      reply.status(202).send({ ok: true, message: 'Scout run started' });

      // Run in background (don't await — reply already sent)
      (async () => {
        try {
          const [github, hn] = await Promise.all([
            fetchGithubTrending(),
            fetchHNMentions(topics),
          ]);

          const { analysis, featureGaps } = await analyzeWithLLM(topics, github, hn);

          _cachedReport = {
            generatedAt: new Date().toISOString(),
            topics,
            github,
            hn,
            analysis,
            featureGaps,
          };
        } finally {
          _runningNow = false;
        }
      })();
    },
  );
}
