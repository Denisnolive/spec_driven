import { sqliteStore, SqliteOpsStore, InMemoryOpsStore } from '../store/index.js';
import type {
  AlertData,
  IncidentData,
  RunbookData,
  ServiceData,
  OpenIncidentInput,
  OpsStore,
} from '../store/index.js';

export * from '../store/index.js';

/** Instância padrão de persistência baseada em SQLite */
export const store = sqliteStore;
