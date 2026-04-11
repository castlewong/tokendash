import { type Request, type Response } from 'express';
import { runCcusage } from '../ccusage.js';
import { cache } from '../cache.js';
import { validateBlocks } from '../../shared/schemas.js';
import { emptyBlocksResponse } from '../codexNormalizer.js';

export async function getBlocks(req: Request, res: Response): Promise<void> {
  const agent = req.query.agent as string || 'claude';
  const cacheKey = `blocks:${agent}`;
  try {
    if (agent === 'codex') {
      res.json(emptyBlocksResponse());
      return;
    }

    const cached = cache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const stdout = await runCcusage(['blocks']);
    const data = JSON.parse(stdout);
    const validated = validateBlocks(data);

    cache.set(cacheKey, validated);
    res.json(validated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching blocks data:', error);
    res.status(502).json({
      error: 'Failed to fetch blocks data from ccusage',
      hint: message,
    });
  }
}
