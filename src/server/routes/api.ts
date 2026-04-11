import { type Router } from 'express';
import { getDaily } from './daily.js';
import { getMonthly } from './monthly.js';
import { getSession } from './session.js';
import { getProjects } from './projects.js';
import { getBlocks } from './blocks.js';

export function registerApiRoutes(router: Router): void {
  router.get('/daily', getDaily);
  router.get('/monthly', getMonthly);
  router.get('/session', getSession);
  router.get('/projects', getProjects);
  router.get('/blocks', getBlocks);
}
