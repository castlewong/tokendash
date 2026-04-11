import { type Request, type Response } from 'express';
import { runCcusage, runCodex } from '../ccusage.js';
import { cache } from '../cache.js';
import { validateProjects } from '../../shared/schemas.js';
import { normalizeCodexProjectsResponse } from '../codexNormalizer.js';

export async function getProjects(req: Request, res: Response): Promise<void> {
  const agent = req.query.agent as string || 'claude';
  const cacheKey = `projects:${agent}`;
  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    if (agent === 'codex') {
      const stdout = await runCodex(['daily']);
      const data = JSON.parse(stdout);
      const normalized = normalizeCodexProjectsResponse(data);
      cache.set(cacheKey, normalized);
      res.json(normalized);
    } else {
      const stdout = await runCcusage(['daily', '--instances', '--breakdown']);
      const data = JSON.parse(stdout);
      const validated = validateProjects(data);
      cache.set(cacheKey, validated);
      res.json(validated);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching projects data:', error);
    res.status(502).json({
      error: `Failed to fetch projects data from ${agent}`,
      hint: message,
    });
  }
}
