import express from 'express';
import { registerApiRoutes } from './routes/api.js';
import { ensureUsageToolsReady } from './ccusage.js';
import open from 'open';

interface CliArgs {
  port?: number;
  noOpen?: boolean;
}

function parseCliArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' && i + 1 < args.length) {
      result.port = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--no-open') {
      result.noOpen = true;
    }
  }

  return result;
}

async function ensureUsageSupportAvailable(): Promise<boolean> {
  try {
    await ensureUsageToolsReady();
    return true;
  } catch (error) {
    console.error('Error: failed to prepare ccusage support for Claude Code or Codex');
    console.error('\nDetails:', error instanceof Error ? error.message : error);
    return false;
  }
}

async function main() {
  const args = parseCliArgs();
  const port = args.port ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 3456);
  const shouldOpenBrowser = !args.noOpen;

  const isUsageSupportAvailable = await ensureUsageSupportAvailable();
  if (!isUsageSupportAvailable) {
    process.exit(1);
  }

  const app = express();
  const router = express.Router();

  // Register API routes
  registerApiRoutes(router);
  app.use('/api', router);

  // Check if running from dist (production build)
  const isProduction = import.meta.url.includes('dist/');

  if (isProduction) {
    // Serve static files from client build
    const clientPath = new URL('../client', import.meta.url).pathname;
    const clientIndexPath = new URL('../client/index.html', import.meta.url).pathname;

    app.use(express.static(clientPath));

    // SPA fallback
    app.use('{*path}', (_req, res) => {
      res.sendFile(clientIndexPath);
    });
  }

  const server = app.listen(port, () => {
    console.log(`ccusage-dashboard running on http://localhost:${port}`);
    if (isProduction) {
      console.log('Serving production build');
    } else {
      console.log('Development mode - use "npm run dev" for full dev experience');
    }
  });

  // Open browser if requested
  if (shouldOpenBrowser) {
    // Small delay to ensure server is ready
    setTimeout(() => {
      open(`http://localhost:${port}`).catch((err) => {
        console.warn('Could not open browser:', err.message);
      });
    }, 100);
  }

  // Graceful shutdown
  process.on('SIGTERM', () => {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
