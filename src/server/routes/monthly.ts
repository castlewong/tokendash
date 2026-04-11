import { type Request, type Response } from 'express';
import { runCcusage } from '../ccusage.js';
import { cache } from '../cache.js';
import { validateDaily } from '../../shared/schemas.js';

export async function getMonthly(_req: Request, res: Response): Promise<void> {
  try {
    const cached = cache.get('monthly');
    if (cached) {
      res.json(cached);
      return;
    }

    const stdout = await runCcusage(['monthly', '--breakdown']);
    const data = JSON.parse(stdout);
    const validated = validateDaily(data);

    cache.set('monthly', validated);
    res.json(validated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching monthly data:', error);
    res.status(502).json({
      error: 'Failed to fetch monthly data from ccusage',
      hint: message,
    });
  }
}
