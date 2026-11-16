import { Router } from 'express';
import { getPersistenceDiagnostics, getSystemConfig, initDataStore } from '../repositories/dataStore.ts';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res, next) => {
  try {
    const status = await initDataStore();
    const diag = getPersistenceDiagnostics();
    const cfg = await getSystemConfig().catch(() => null);
    const databaseConnected = status.persistenceMode !== 'MISCONFIGURED_NO_PERSISTENT_DB';

    res.json({
      ok: databaseConnected,
      service: 'hadiqtna-api',
      databaseConnected,
      firestoreAdminConnected: status.firestoreAdminConnected,
      persistenceMode: status.persistenceMode,
      productionPersistenceReady: status.productionPersistenceReady,
      localServerMode: diag.localServerMode,
      operatingMode: cfg?.operatingMode ?? 'DEMO',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
