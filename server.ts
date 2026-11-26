import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { initDatabase, sqliteStore, UPLOADS_DIR } from './server/db.ts';
import { pgStore } from './server/pgStore.ts';
import { createApiRouter } from './server/routes.ts';

function getCliArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  const withEquals = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  return withEquals ? withEquals.slice(flag.length + 1) : undefined;
}

const hasPostgres = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
if (!hasPostgres) {
  initDatabase();
}
const activeStore = hasPostgres ? pgStore : sqliteStore;

const app = express();
const PORT = Number(getCliArg('--port') || process.env.PORT || 3000);
const HOST = getCliArg('--host') || '0.0.0.0';

app.set('trust proxy', true);
app.use(express.json({ limit: '8mb' }));

app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/assets', express.static(path.resolve(process.cwd(), 'public/assets')));
app.use('/api', createApiRouter(activeStore));

async function startServer(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*splat', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  } else {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const viteReady: Promise<ViteDevServer> = createViteServer({
      server: {
        middlewareMode: true,
        ...(hmrDisabled ? { hmr: false, ws: false } : {}),
      },
      appType: 'spa',
    });

    viteReady.catch((err) => {
      console.error('Failed to initialize Vite dev server:', err);
      process.exit(1);
    });

    app.use(async (req, res, next) => {
      try {
        const vite = await viteReady;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Bulldog server running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
