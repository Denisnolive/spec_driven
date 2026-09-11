import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type {
  Alert,
  AlertData,
  AlertFilter,
  Incident,
  IncidentData,
  IncidentFilter,
  OpenIncidentInput,
  OpsStore,
  Runbook,
  RunbookData,
  Service,
  ServiceData,
} from './ops-store.js';

export class SqliteOpsStore implements OpsStore {
  _db: DatabaseSync;
  private readonly dbPath: string;

  constructor(pathOrDbPath: string = process.env.OPSPILOT_DB ?? './data/opspilot.db') {
    this.dbPath = pathOrDbPath;

    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(path.resolve(this.dbPath));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this._db = new DatabaseSync(this.dbPath);
    this.createTables();
  }

  get db(): DatabaseSync {
    return this._db;
  }

  private createTables(): void {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        tier TEXT NOT NULL DEFAULT 'tier-2' CHECK(tier IN ('tier-1', 'tier-2', 'tier-3')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        service TEXT NOT NULL,
        severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),
        status TEXT NOT NULL DEFAULT 'firing' CHECK(status IN ('firing', 'resolved')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        service TEXT NOT NULL,
        severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
        resolved_at TEXT,
        summary TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS runbooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  async init(force: boolean = false): Promise<void> {
    if (force) {
      this._db.exec(`
        DROP TABLE IF EXISTS runbooks;
        DROP TABLE IF EXISTS incidents;
        DROP TABLE IF EXISTS alerts;
        DROP TABLE IF EXISTS services;
      `);
      this.createTables();
    }
  }

  async listAlerts(filter: AlertFilter = 'firing'): Promise<Alert[]> {
    const where = filter === 'all' ? '' : 'WHERE status = ?';
    const stmt = this._db.prepare(
      `SELECT id, title, service, severity, status, created_at FROM alerts ${where} ORDER BY id ASC`
    );
    return (filter === 'all' ? stmt.all() : stmt.all(filter)) as unknown as Alert[];
  }

  async openIncident(input: OpenIncidentInput): Promise<Incident> {
    const stmt = this._db.prepare(`
      INSERT INTO incidents (title, service, severity, status, summary)
      VALUES (?, ?, ?, 'open', ?)
    `);

    const result = stmt.run(
      input.title,
      input.service,
      input.severity,
      input.summary ?? null
    );

    const insertedId = Number(result.lastInsertRowid);
    const getStmt = this._db.prepare(
      'SELECT id, title, service, severity, status, resolved_at, summary, created_at FROM incidents WHERE id = ?'
    );
    const incident = getStmt.get(insertedId);
    return incident as unknown as Incident;
  }

  async resolveIncident(id: number, summary?: string): Promise<Incident | { error: string }> {
    const checkStmt = this._db.prepare('SELECT id FROM incidents WHERE id = ?');
    const existing = checkStmt.get(id);
    if (!existing) {
      return { error: `Incidente ${id} não encontrado` };
    }

    const now = new Date().toISOString();

    if (summary !== undefined) {
      const updateStmt = this._db.prepare(`
        UPDATE incidents
        SET status = 'resolved', resolved_at = ?, summary = ?
        WHERE id = ?
      `);
      updateStmt.run(now, summary, id);
    } else {
      const updateStmt = this._db.prepare(`
        UPDATE incidents
        SET status = 'resolved', resolved_at = ?
        WHERE id = ?
      `);
      updateStmt.run(now, id);
    }

    const getStmt = this._db.prepare(
      'SELECT id, title, service, severity, status, resolved_at, summary, created_at FROM incidents WHERE id = ?'
    );
    const updated = getStmt.get(id);
    return updated as unknown as Incident;
  }

  async listIncidents(filter: IncidentFilter = 'open'): Promise<Incident[]> {
    const where = filter === 'all' ? '' : 'WHERE status = ?';
    const stmt = this._db.prepare(
      `SELECT id, title, service, severity, status, resolved_at, summary, created_at FROM incidents ${where} ORDER BY id ASC`
    );
    return (filter === 'all' ? stmt.all() : stmt.all(filter)) as unknown as Incident[];
  }

  async getRunbook(service: string): Promise<Runbook | null> {
    const stmt = this._db.prepare(
      'SELECT id, service, title, content, created_at FROM runbooks WHERE LOWER(service) = LOWER(?)'
    );
    const result = stmt.get(service.trim());
    return (result as unknown as Runbook) ?? null;
  }

  async seed(): Promise<void> {
    await this.init(true);

    const insertService = this._db.prepare(
      'INSERT INTO services (name, tier) VALUES (?, ?)'
    );
    const services = [
      ['api-gateway', 'tier-1'],
      ['auth-service', 'tier-1'],
      ['billing-service', 'tier-1'],
      ['notification-service', 'tier-2'],
      ['analytics-service', 'tier-3'],
    ];
    for (const [name, tier] of services) {
      insertService.run(name, tier);
    }

    const insertAlert = this._db.prepare(
      'INSERT INTO alerts (title, service, severity, status) VALUES (?, ?, ?, ?)'
    );
    const alerts = [
      ['Alta utilização de CPU no api-gateway', 'api-gateway', 'high', 'firing'],
      ['Vazamento de memória detectado no auth-service', 'auth-service', 'critical', 'firing'],
      ['Erros no processamento de pagamentos no billing-service', 'billing-service', 'critical', 'firing'],
      ['Atraso na fila de e-mails do notification-service', 'notification-service', 'medium', 'resolved'],
      ['Query lenta detectada no analytics-service', 'analytics-service', 'low', 'resolved'],
      ['Limite de rate excedido no api-gateway', 'api-gateway', 'high', 'resolved'],
    ];
    for (const [title, svc, severity, status] of alerts) {
      insertAlert.run(title, svc, severity, status);
    }

    const insertRunbook = this._db.prepare(
      'INSERT INTO runbooks (service, title, content) VALUES (?, ?, ?)'
    );
    const runbooks = [
      [
        'checkout',
        'Runbook: Checkout Service',
        '1. Verificar conectividade com gateway de pagamentos e serviço de autenticação.\n' +
          '2. Inspecionar fila de checkout pendente e reprocessar mensagens mortas (DLQ).\n' +
          '3. Escalar instâncias do container de checkout caso a latência exceda 2000ms.\n' +
          '4. Se persistirem falhas de transação, ativar fallback de checkout simplificado.',
      ],
      [
        'payments',
        'Runbook: Payments & Billing Service',
        '1. Checar status da API da adquirente externa e certificados TLS de webhook.\n' +
          '2. Validar integridade da tabela de transações e bloqueios de concorrência.\n' +
          '3. Habilitar modo retry exponencial com jitter para requisições com timeout.\n' +
          '4. Notificar time financeiro se houver rejeição em lote superior a 5%.',
      ],
      [
        'auth',
        'Runbook: Auth Service',
        '1. Verificar uso de memória do processo Node.js e métricas do heap V8.\n' +
          '2. Validar conectividade e latência do cluster Redis de sessões e tokens JWT.\n' +
          '3. Se vazamento de memória for detectado, acionar rolling restart dos pods.\n' +
          '4. Checar expiração de chaves públicas/privadas de assinatura de tokens.',
      ],
      [
        'api-gateway',
        'Runbook: API Gateway',
        '1. Analisar distribuição de tráfego e taxa de requisições por IP.\n' +
          '2. Ajustar regras de rate limiting e caching de endpoints estáticos.\n' +
          '3. Reiniciar instâncias com saturação de CPU.',
      ],
      [
        'billing-service',
        'Runbook: Billing Service',
        '1. Verificar logs de integração com gateways bancários e adquirentes.\n' +
          '2. Reprocessar eventos com erro na fila de faturamento.',
      ],
      [
        'auth-service',
        'Runbook: Auth Service',
        '1. Verificar uso de memória e latência do cache de autenticação.\n' +
          '2. Realizar rolling restart dos pods afetados.',
      ],
    ];
    for (const [svc, title, content] of runbooks) {
      insertRunbook.run(svc, title, content);
    }
  }

  close(): void {
    this._db.close();
  }
}

export const sqliteStore = new SqliteOpsStore();
