import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './server/config/env.ts';
import { errorHandler } from './server/middleware/errorHandler.ts';
import { generalApiLimiter } from './server/middleware/rateLimit.ts';
import { initDataStore } from './server/repositories/dataStore.ts';
import { adminRouter } from './server/routes/adminRoutes.ts';
import { healthRouter } from './server/routes/healthRoutes.ts';
import { iotRouter } from './server/routes/iotRoutes.ts';
import { maintenanceRouter } from './server/routes/maintenanceRoutes.ts';
import { notificationsRouter } from './server/routes/notificationsRoutes.ts';
import { parksRouter } from './server/routes/parksRoutes.ts';
import { reportsRouter } from './server/routes/reportsRoutes.ts';
import { evaluateOfflineDevices } from './server/services/alertEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    })
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.corsOrigins.length === 0) {
          callback(null, true);
          return;
        }
        if (env.corsOrigins.includes(origin) || origin === env.appUrl) {
          callback(null, true);
          return;
        }
        callback(new Error('CORS_NOT_ALLOWED'));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true, limit: '256kb' }));

  // Safe API request logger (never logs Authorization tokens)
  app.use('/api', (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      if (process.env.NODE_ENV !== 'test') {
        const ms = Date.now() - start;
        console.log(`[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
      }
    });
    next();
  });

  app.use('/api', generalApiLimiter);

  app.use('/api', healthRouter);
  app.use('/api/iot', iotRouter);
  app.use('/api/parks', parksRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/maintenance', maintenanceRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api', adminRouter);

  app.use('/api/*', (_req, res) => {
    res.status(404).json({
      success: false,
      error: 'ENDPOINT_NOT_FOUND',
      message: 'نقطة النهاية المطلوبة غير موجودة.',
    });
  });

  app.use(errorHandler);
  return app;
}

async function startServer() {
  await initDataStore();
  const app = createApp();

  if (env.nodeEnv !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  // Periodic offline device check every 30 seconds
  const offlineTimer = setInterval(() => {
    evaluateOfflineDevices().catch((err) => {
      console.error('[Offline Sweep Error]', err instanceof Error ? err.message : String(err));
    });
  }, 30_000);
  offlineTimer.unref?.();

  // Periodic local-server -> central sync flush every 60 seconds when configured
  if (env.localServerMode && env.centralSyncUrl) {
    const { flushSyncOutbox } = await import('./server/services/syncService.ts');
    const syncTimer = setInterval(() => {
      flushSyncOutbox().catch((err) => {
        console.error('[Local Sync Error]', err instanceof Error ? err.message : String(err));
      });
    }, 60_000);
    syncTimer.unref?.();
  }

  app.listen(env.port, '0.0.0.0', () => {
    console.log(`Hadiqtna full-stack server listening on http://0.0.0.0:${env.port}`);
  });
}

const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
if (!isTestEnv) {
  startServer().catch((err) => {
    console.error('Failed to start Hadiqtna server:', err);
    process.exit(1);
  });
}
