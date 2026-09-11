export type ServiceTier = 'tier-1' | 'tier-2' | 'tier-3';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'firing' | 'resolved';
export type IncidentStatus = 'open' | 'resolved';

export interface ServiceData {
  id: number;
  name: string;
  tier?: ServiceTier | string;
  created_at?: string;
}

export interface AlertData {
  id: number;
  title: string;
  service: string;
  severity: AlertSeverity | string;
  status: AlertStatus | string;
  created_at?: string;
}

export interface IncidentData {
  id: number;
  title: string;
  service: string;
  severity: AlertSeverity | string;
  status: IncidentStatus | string;
  resolved_at?: string | null;
  summary?: string | null;
  created_at?: string;
}

export interface RunbookData {
  id: number;
  service: string;
  title: string;
  content: string;
  created_at?: string;
}

export type Service = ServiceData;
export type Alert = AlertData;
export type Incident = IncidentData;
export type Runbook = RunbookData;

export type IncidentFilter = 'open' | 'resolved' | 'all';
export type AlertFilter = 'firing' | 'resolved' | 'all';

export interface OpenIncidentInput {
  title: string;
  service: string;
  severity: AlertSeverity;
  summary?: string;
}

export interface OpsStore {
  init(force?: boolean): Promise<void> | void;
  listAlerts(status?: AlertFilter): Promise<AlertData[]> | AlertData[];
  openIncident(input: OpenIncidentInput): Promise<IncidentData> | IncidentData;
  resolveIncident(id: number, summary?: string): Promise<IncidentData | { error: string }> | IncidentData | { error: string };
  listIncidents(status?: IncidentFilter): Promise<IncidentData[]> | IncidentData[];
  getRunbook(service: string): Promise<RunbookData | null> | RunbookData | null;
  seed(): Promise<void> | void;
}

/**
 * Implementação em memória de OpsStore para cenários de teste leves e isolados.
 */
export class InMemoryOpsStore implements OpsStore {
  private services: ServiceData[] = [];
  private alerts: AlertData[] = [];
  private incidents: IncidentData[] = [];
  private runbooks: RunbookData[] = [];
  private nextIncidentId = 1;

  async init(force = false): Promise<void> {
    if (force) {
      this.services = [];
      this.alerts = [];
      this.incidents = [];
      this.runbooks = [];
      this.nextIncidentId = 1;
    }
  }

  async listAlerts(status: 'firing' | 'resolved' | 'all' = 'firing'): Promise<AlertData[]> {
    if (status === 'all') return [...this.alerts];
    return this.alerts.filter((a) => a.status === status);
  }

  async openIncident(input: OpenIncidentInput): Promise<IncidentData> {
    const incident: IncidentData = {
      id: this.nextIncidentId++,
      title: input.title,
      service: input.service,
      severity: input.severity,
      status: 'open',
      summary: input.summary ?? null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    };
    this.incidents.push(incident);
    return { ...incident };
  }

  async resolveIncident(id: number, summary?: string): Promise<IncidentData | { error: string }> {
    const incident = this.incidents.find((inc) => inc.id === id);
    if (!incident) {
      return { error: `Incidente ${id} não encontrado` };
    }
    incident.status = 'resolved';
    incident.resolved_at = new Date().toISOString();
    if (summary) {
      incident.summary = summary;
    }
    return { ...incident };
  }

  async listIncidents(status: 'open' | 'resolved' | 'all' = 'open'): Promise<IncidentData[]> {
    if (status === 'all') return [...this.incidents];
    return this.incidents.filter((inc) => inc.status === status);
  }

  async getRunbook(service: string): Promise<RunbookData | null> {
    const norm = service.trim().toLowerCase();
    const runbook = this.runbooks.find((r) => r.service.toLowerCase() === norm);
    return runbook ? { ...runbook } : null;
  }

  async seed(): Promise<void> {
    await this.init(true);

    this.services = [
      { id: 1, name: 'api-gateway', tier: 'tier-1', created_at: new Date().toISOString() },
      { id: 2, name: 'auth-service', tier: 'tier-1', created_at: new Date().toISOString() },
      { id: 3, name: 'billing-service', tier: 'tier-1', created_at: new Date().toISOString() },
      { id: 4, name: 'notification-service', tier: 'tier-2', created_at: new Date().toISOString() },
      { id: 5, name: 'analytics-service', tier: 'tier-3', created_at: new Date().toISOString() },
    ];

    this.alerts = [
      { id: 1, title: 'Alta utilização de CPU no api-gateway', service: 'api-gateway', severity: 'high', status: 'firing' },
      { id: 2, title: 'Vazamento de memória detectado no auth-service', service: 'auth-service', severity: 'critical', status: 'firing' },
      { id: 3, title: 'Erros no processamento de pagamentos no billing-service', service: 'billing-service', severity: 'critical', status: 'firing' },
      { id: 4, title: 'Atraso na fila de e-mails do notification-service', service: 'notification-service', severity: 'medium', status: 'resolved' },
      { id: 5, title: 'Query lenta detectada no analytics-service', service: 'analytics-service', severity: 'low', status: 'resolved' },
      { id: 6, title: 'Limite de rate excedido no api-gateway', service: 'api-gateway', severity: 'high', status: 'resolved' },
    ];

    this.runbooks = [
      {
        id: 1,
        service: 'checkout',
        title: 'Runbook: Checkout Service',
        content:
          '1. Verificar conectividade com gateway de pagamentos e serviço de autenticação.\n' +
          '2. Inspecionar fila de checkout pendente e reprocessar mensagens mortas (DLQ).\n' +
          '3. Escalar instâncias do container de checkout caso a latência exceda 2000ms.\n' +
          '4. Se persistirem falhas de transação, ativar fallback de checkout simplificado.',
      },
      {
        id: 2,
        service: 'payments',
        title: 'Runbook: Payments & Billing Service',
        content:
          '1. Checar status da API da adquirente externa e certificados TLS de webhook.\n' +
          '2. Validar integridade da tabela de transações e bloqueios de concorrência.\n' +
          '3. Habilitar modo retry exponencial com jitter para requisições com timeout.\n' +
          '4. Notificar time financeiro se houver rejeição em lote superior a 5%.',
      },
      {
        id: 3,
        service: 'auth',
        title: 'Runbook: Auth Service',
        content:
          '1. Verificar uso de memória do processo Node.js e métricas do heap V8.\n' +
          '2. Validar conectividade e latência do cluster Redis de sessões e tokens JWT.\n' +
          '3. Se vazamento de memória for detectado, acionar rolling restart dos pods.\n' +
          '4. Checar expiração de chaves públicas/privadas de assinatura de tokens.',
      },
      {
        id: 4,
        service: 'api-gateway',
        title: 'Runbook: API Gateway',
        content:
          '1. Analisar distribuição de tráfego e taxa de requisições por IP.\n' +
          '2. Ajustar regras de rate limiting e caching de endpoints estáticos.\n' +
          '3. Reiniciar instâncias com saturação de CPU.',
      },
      {
        id: 5,
        service: 'billing-service',
        title: 'Runbook: Billing Service',
        content:
          '1. Verificar logs de integração com gateways bancários e adquirentes.\n' +
          '2. Reprocessar eventos com erro na fila de faturamento.',
      },
      {
        id: 6,
        service: 'auth-service',
        title: 'Runbook: Auth Service',
        content:
          '1. Verificar uso de memória e latência do cache de autenticação.\n' +
          '2. Realizar rolling restart dos pods afetados.',
      },
    ];
  }
}
