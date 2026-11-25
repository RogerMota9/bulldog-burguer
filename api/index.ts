import express from 'express';
import { pgStore } from '../server/pgStore.ts';
import { createApiRouter } from '../server/routes.ts';
import { VERCEL_UPLOADS_DIR, vercelStore } from '../server/vercelStore.ts';

const hasPostgres = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const activeStore = hasPostgres ? pgStore : vercelStore;

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '8mb' }));

app.use('/uploads', express.static(VERCEL_UPLOADS_DIR));
app.use('/api', createApiRouter(activeStore));

export default app;
