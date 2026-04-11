import { type Request, type Response } from 'express';
import { runCcusage } from '../ccusage.js';
import { cache } from '../cache.js';
import { validateDaily } from '../../shared/schemas.js';

export async function getSession(_req: Request, res: Response): Promise<void> {
  try {
    const cached = cache.get('session');
    if (cached) {
      res.json(cached);
      return;
    }

    const stdout = await runCcusage(['session']);
    const data = JSON.parse(stdout);
    const validated = validateDaily(data);

    cache.set('session', validated);
    res.json(validated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching session data:', error);
    res.status(502).json({
      error: 'Failed to fetch session data from ccusage',
      hint: message,
    });
  }
}
