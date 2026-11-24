import express from 'express';
import { createApiRouter } from '../server/routes.ts';
import { VERCEL_UPLOADS_DIR, vercelStore } from '../server/vercelStore.ts';

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '8mb' }));

app.use('/uploads', express.static(VERCEL_UPLOADS_DIR));
app.use('/api', createApiRouter(vercelStore));

export default app;
