import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { sqliteStore } from '../store/sqlite-ops-store.js';
import type { OpsStore } from '../store/ops-store.js';
import { sqliteMemoryStore, type MemoryStore } from '../memory/memory-store.js';
import { formatOpenIncidentsReport } from '../services/incident-reporter.js';

let activeStore: OpsStore = sqliteStore;
let activeMemoryStore: MemoryStore = sqliteMemoryStore;
let activeUserId: string | null = null;
let activeFetch: typeof fetch = globalThis.fetch;

/**
 * Permite alterar a função de fetch ativa (útil em testes unitários para fake fetch).
 */
export function setFetchFn(fn: typeof fetch): void {
  activeFetch = fn;
}

export function getFetchFn(): typeof fetch {
  return activeFetch;
}

/**
 * Permite alterar a instância ativa de OpsStore (útil em testes ou benchmarking).
 */
export function setOpsStore(store: OpsStore): void {
  activeStore = store;
}

export function getOpsStore(): OpsStore {
  return activeStore;
}

/**
 * Permite alterar a instância ativa de MemoryStore.
 */
export function setMemoryStore(store: MemoryStore): void {
  activeMemoryStore = store;
}

export function getMemoryStore(): MemoryStore {
  return activeMemoryStore;
}

/**
 * Define o identificador do usuário ativo para tools que operam sobre preferências do usuário.
 */
export function setActiveUserId(userId: string | null): void {
  activeUserId = userId;
}

export function getActiveUserId(): string | null {
  return activeUserId;
}

export const statusSchema = z.object({
  status: z.object({ indicator: z.string(), description: z.string() }),
});

// ─── Schemas reutilizáveis (single source of truth) ───────────────────────────

export const listAlertsSchema = z.object({
  status: z
    .enum(['firing', 'resolved', 'all'])
    .default('firing')
    .describe(
      "Filtro de status dos alertas: 'firing' para alertas ativos disparando no momento, 'resolved' para alertas normalizados ou 'all' para todos"
    ),
});

export const openIncidentSchema = z.object({
  title: z
    .string()
    .min(1)
    .describe("Título descritivo e conciso do incidente informando o problema e o serviço afetado (ex: 'Alta utilização de CPU no api-gateway')"),
  service: z
    .string()
    .min(1)
    .describe("Nome exato do serviço afetado pelo incidente (ex: 'api-gateway', 'auth-service', 'billing-service', 'notification-service', 'analytics-service', 'checkout', 'payments', 'auth')"),
  severity: z
    .enum(['low', 'medium', 'high', 'critical'])
    .describe("Nível de severidade do incidente: 'low' (baixo impacto), 'medium' (degradação moderada), 'high' (impacto relevante), 'critical' (indisponibilidade total ou falha financeira/segurança)"),
  summary: z
    .string()
    .optional()
    .describe('Resumo opcional ou contexto inicial detalhado do diagnóstico do incidente'),
});

export const resolveIncidentSchema = z.object({
  id: z
    .number()
    .int()
    .positive()
    .describe('Identificador numérico único do incidente a ser resolvido'),
  summary: z
    .string()
    .optional()
    .describe('Resumo descritivo opcional da solução aplicada ou causa raiz para documentação histórica'),
});

export const listIncidentsSchema = z.object({
  status: z
    .enum(['open', 'resolved', 'all'])
    .default('open')
    .describe("Filtro de status dos incidentes: 'open' para incidentes ativos em andamento, 'resolved' para incidentes finalizados ou 'all' para todos os incidentes registrados"),
  format: z
    .enum(['json', 'report'])
    .optional()
    .default('json')
    .describe("Formato de saída: 'json' (padrão) para lista crua de dados ou 'report' para relatório estruturado em blocos de texto sem tabelas"),
});

export const getOpenIncidentsReportSchema = z.object({});

export const consultarRunbookSchema = z.object({
  service: z
    .string()
    .min(1)
    .describe("Nome do serviço a ser consultado (ex: 'checkout', 'payments', 'auth', 'api-gateway', 'billing-service', 'auth-service')"),
});

export const checkProviderStatusSchema = z.object({
  provider: z
    .enum(['github', 'cloudflare'])
    .default('github')
    .describe(
      "Nome do provedor externo a ser consultado: 'github' ou 'cloudflare' (padrão: 'github')"
    ),
});

export const STATUS_URL = {
  github: 'https://www.githubstatus.com/api/v2/status.json',
  cloudflare: 'https://www.cloudflarestatus.com/api/v2/status.json',
} as const;

export type ProviderName = keyof typeof STATUS_URL;

export async function fetchProviderStatus(
  provider: ProviderName,
  doFetch: typeof fetch = activeFetch
): Promise<string> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await doFetch(STATUS_URL[provider], {
        signal: AbortSignal.timeout(5000),
      });
      if (response.status >= 500) throw new Error(`upstream ${response.status}`);
      if (!response.ok) return `status page de ${provider} respondeu HTTP ${response.status}`;
      const { status } = statusSchema.parse(await response.json());
      return `${provider} está ${status.indicator} - ${status.description}`;
    } catch (error) {
      if (attempt === 2) {
        return `não consegui consultar o status de ${provider} (${(error as Error).message}).\nResponda com base nos alertas internos e avise o plantonista da limitação`;
      }
    }
  }

  return 'unreachable';
}

export interface CreateOpsToolsOptions {
  fetchFn?: typeof fetch;
  memoryStore?: MemoryStore;
  userId?: string | null;
}

/**
 * Fábrica de ferramentas operacionais configuradas com uma instância específica de OpsStore.
 */
export function createOpsTools(
  storeInstance: OpsStore = activeStore,
  options?: CreateOpsToolsOptions
) {
  const currentFetch = options?.fetchFn ?? activeFetch;
  const currentMemoryStore = options?.memoryStore ?? activeMemoryStore;

  const listAlertsTool = tool(
    async ({ status }) => JSON.stringify(await storeInstance.listAlerts(status)),
    {
      name: 'list_alerts',
      description:
        'Lista e filtra alertas de monitoramento da infraestrutura e serviços. ' +
        'Use quando o operador perguntar sobre o estado do plantão, serviços degradados, alertas ativos ou resolvidos. ' +
        'Não use para listar incidentes já abertos (use list_incidents). ' +
        'Retorna uma lista JSON de alertas com id, título, serviço, severidade e status.',
      schema: listAlertsSchema,
    }
  );

  const openIncidentTool = tool(
    async ({ title, service, severity, summary }) =>
      JSON.stringify(await storeInstance.openIncident({ title, service, severity, summary })),
    {
      name: 'open_incident',
      description:
        'Abre um novo incidente operacional para um serviço com problema ou degradação. ' +
        'Use quando for identificado um alerta crítico sem incidente correspondente, indisponibilidade de serviço ou quando o operador solicitar explicitamente a abertura de chamado/incidente. ' +
        'Não use para consultar incidentes ou alertas existentes. ' +
        "Retorna o objeto JSON do incidente criado contendo seu identificador numérico único (id), título, serviço, severidade e status 'open'.",
      schema: openIncidentSchema,
    }
  );

  const resolveIncidentTool = tool(
    async ({ id, summary }) => JSON.stringify(await storeInstance.resolveIncident(id, summary)),
    {
      name: 'resolve_incident',
      description:
        'Marca um incidente operacional existente como resolvido no sistema através do seu identificador numérico. ' +
        'Use quando a causa raiz de um incidente tiver sido mitigada, corrigida ou quando o operador solicitar o fechamento de um incidente. ' +
        'Não use sem ter o identificador numérico do incidente (consulte via list_incidents primeiro se necessário). ' +
        "Retorna o objeto JSON do incidente atualizado com status 'resolved' e timestamp de resolução, ou mensagem de erro caso o ID não exista.",
      schema: resolveIncidentSchema,
    }
  );

  const listIncidentsTool = tool(
    async ({ status, format }) => {
      const incidents = await storeInstance.listIncidents(status);
      if (format === 'report') {
        return formatOpenIncidentsReport(incidents).markdown;
      }
      return JSON.stringify(incidents);
    },
    {
      name: 'list_incidents',
      description:
        'Lista os incidentes operacionais registrados no sistema, permitindo filtrar pelo status. ' +
        'Use quando o operador perguntar sobre incidentes abertos, chamados em andamento, histórico de incidentes ou status geral de atendimento operacional. ' +
        'Use format="report" para retornar o relatório legível em blocos de texto sem tabelas markdown. ' +
        'Não use para listar alertas de monitoramento não triados (use list_alerts). ' +
        "Retorna uma lista JSON de incidentes ou relatório formatado em blocos quando format='report'.",
      schema: listIncidentsSchema,
    }
  );

  const getOpenIncidentsReportTool = tool(
    async () => {
      const incidents = await storeInstance.listIncidents('open');
      return formatOpenIncidentsReport(incidents).markdown;
    },
    {
      name: 'get_open_incidents_report',
      description:
        'Gera o Relatório Oficial de Incidentes Abertos em produção no formato padronizado de blocos de texto sem tabelas markdown. ' +
        'Contém cabeçalho quantitativo (Total, Critical, High, Medium, Low), incidentes ordenados por severidade e data decrescente, ' +
        'sinalização de duplicidades de sintomas e seção de Ação Imediata.',
      schema: getOpenIncidentsReportSchema,
    }
  );

  const consultarRunbookTool = tool(
    async ({ service }) => {
      const runbook = await storeInstance.getRunbook(service);
      if (!runbook) {
        return JSON.stringify({
          error: `Runbook não encontrado para o serviço: ${service}`,
          service,
        });
      }
      return JSON.stringify(runbook);
    },
    {
      name: 'consultar_runbook',
      description:
        'Consulta o runbook (guia operacional de diagnóstico e recuperação) associado a um serviço específico. ' +
        'Use quando precisar de instruções passo a passo para mitigar falhas, reprocessar filas, reiniciar componentes ou investigar causas de incidentes em um serviço. ' +
        'Não use para alterar o estado de incidentes ou alertas. ' +
        'Retorna o título e as instruções operacionais do serviço em formato de texto estruturado ou mensagem informativa se o serviço não possuir runbook cadastrado.',
      schema: consultarRunbookSchema,
    }
  );

  const checkProviderStatusTool = tool(
    async ({ provider }) => fetchProviderStatus(provider, currentFetch),
    {
      name: 'check_provider_status',
      description:
        'Consulta a statuspage pública de provedores externos essenciais (GitHub e Cloudflare) para verificar a saúde operacional de serviços terceiros. ' +
        'Use quando houver suspeita de instabilidade externa, falhas em dependências de terceiros, lentidão de rede externa ou para responder à pergunta "é problema nosso ou do provedor?". ' +
        'Não use para consultar alertas, incidentes ou serviços internos da nossa infraestrutura (use list_alerts e list_incidents). ' +
        'Retorna uma linha compacta informando o indicador e descrição oficial do provedor ou mensagem explicativa em caso de indisponibilidade de consulta.',
      schema: checkProviderStatusSchema,
    }
  );

  const forgetPreferenceTool = tool(
    async ({ query, memoryId }) => {
      const uid = options?.userId ?? activeUserId;
      if (!uid) {
        return JSON.stringify({
          error: 'Nenhum usuário ativo identificado para esquecer preferências.',
        });
      }

      if (memoryId !== undefined) {
        const removed = await currentMemoryStore.forget(uid, memoryId);
        if (removed) {
          return JSON.stringify({
            status: 'success',
            message: `Preferência com ID ${memoryId} foi esquecida com sucesso.`,
            memoryId,
          });
        }
        return JSON.stringify({
          status: 'not_found',
          message: `Nenhuma preferência com ID ${memoryId} foi encontrada para este usuário.`,
        });
      }

      const recalled = await currentMemoryStore.recall(uid, query, 1);
      if (recalled.length === 0) {
        return JSON.stringify({
          status: 'not_found',
          message: `Nenhuma preferência correspondente a "${query}" foi encontrada na sua memória.`,
        });
      }

      const target = recalled[0];
      const removed = await currentMemoryStore.forget(uid, target.id);
      if (removed) {
        return JSON.stringify({
          status: 'success',
          message: `A preferência "${target.fact}" foi esquecida com sucesso.`,
          forgottenFact: target.fact,
          memoryId: target.id,
        });
      }

      return JSON.stringify({
        error: 'Falha ao remover a preferência da memória.',
      });
    },
    {
      name: 'forget_preference',
      description:
        'Esquece ou apaga uma preferência, fato ou informação previamente memorizada sobre o usuário no sistema. ' +
        'Use quando o usuário pedir explicitamente para esquecer, apagar ou desconsiderar uma preferência anterior.',
      schema: forgetPreferenceSchema,
    }
  );

  return {
    listAlerts: listAlertsTool,
    openIncident: openIncidentTool,
    resolveIncident: resolveIncidentTool,
    listIncidents: listIncidentsTool,
    getOpenIncidentsReport: getOpenIncidentsReportTool,
    consultarRunbook: consultarRunbookTool,
    checkProviderStatus: checkProviderStatusTool,
    forgetPreference: forgetPreferenceTool,
    allTools: [
      listAlertsTool,
      openIncidentTool,
      resolveIncidentTool,
      listIncidentsTool,
      getOpenIncidentsReportTool,
      consultarRunbookTool,
      checkProviderStatusTool,
      forgetPreferenceTool,
    ],
  };
}

// ─── Ferramentas conectadas à store ativa ─────────────────────────────────────

export const listAlerts = tool(
  async ({ status }) => JSON.stringify(await activeStore.listAlerts(status)),
  {
    name: 'list_alerts',
    description:
      'Lista e filtra alertas de monitoramento da infraestrutura e serviços. ' +
      'Use quando o operador perguntar sobre o estado do plantão, serviços degradados, alertas ativos ou resolvidos. ' +
      'Não use para listar incidentes já abertos (use list_incidents). ' +
      'Retorna uma lista JSON de alertas com id, título, serviço, severidade e status.',
    schema: listAlertsSchema,
  }
);

export const openIncident = tool(
  async ({ title, service, severity, summary }) =>
    JSON.stringify(await activeStore.openIncident({ title, service, severity, summary })),
  {
    name: 'open_incident',
    description:
      'Abre um novo incidente operacional para um serviço com problema ou degradação. ' +
      'Use quando for identificado um alerta crítico sem incidente correspondente, indisponibilidade de serviço ou quando o operador solicitar explicitamente a abertura de chamado/incidente. ' +
      'Não use para consultar incidentes ou alertas existentes. ' +
      "Retorna o objeto JSON do incidente criado contendo seu identificador numérico único (id), título, serviço, severidade e status 'open'.",
    schema: openIncidentSchema,
  }
);

export const resolveIncident = tool(
  async ({ id, summary }) => JSON.stringify(await activeStore.resolveIncident(id, summary)),
  {
    name: 'resolve_incident',
    description:
      'Marca um incidente operacional existente como resolvido no sistema através do seu identificador numérico. ' +
      'Use quando a causa raiz de um incidente tiver sido mitigada, corrigida ou quando o operador solicitar o fechamento de um incidente. ' +
      'Não use sem ter o identificador numérico do incidente (consulte via list_incidents primeiro se necessário). ' +
      "Retorna o objeto JSON do incidente atualizado com status 'resolved' e timestamp de resolução, ou mensagem de erro caso o ID não exista.",
    schema: resolveIncidentSchema,
  }
);

export const listIncidents = tool(
  async ({ status, format }) => {
    const incidents = await activeStore.listIncidents(status);
    if (format === 'report') {
      return formatOpenIncidentsReport(incidents).markdown;
    }
    return JSON.stringify(incidents);
  },
  {
    name: 'list_incidents',
    description:
      'Lista os incidentes operacionais registrados no sistema, permitindo filtrar pelo status. ' +
      'Use quando o operador perguntar sobre incidentes abertos, chamados em andamento, histórico de incidentes ou status geral de atendimento operacional. ' +
      'Use format="report" para retornar o relatório oficial legível em blocos de texto sem tabelas. ' +
      'Não use para listar alertas de monitoramento não triados (use list_alerts). ' +
      "Retorna uma lista JSON de incidentes ou relatório estruturado em blocos quando format='report'.",
    schema: listIncidentsSchema,
  }
);

export const getOpenIncidentsReport = tool(
  async () => {
    const incidents = await activeStore.listIncidents('open');
    return formatOpenIncidentsReport(incidents).markdown;
  },
  {
    name: 'get_open_incidents_report',
    description:
      'Gera o Relatório Oficial de Incidentes Abertos em produção no formato padronizado de blocos de texto sem tabelas markdown. ' +
      'Contém cabeçalho quantitativo (Total, Critical, High, Medium, Low), incidentes ordenados por severidade e data decrescente, ' +
      'sinalização de duplicidades de sintomas e seção de Ação Imediata.',
    schema: getOpenIncidentsReportSchema,
  }
);

export const consultarRunbook = tool(
  async ({ service }) => {
    const runbook = await activeStore.getRunbook(service);
    if (!runbook) {
      return JSON.stringify({
        error: `Runbook não encontrado para o serviço: ${service}`,
        service,
      });
    }
    return JSON.stringify(runbook);
  },
  {
    name: 'consultar_runbook',
    description:
      'Consulta o runbook (guia operacional de diagnóstico e recuperação) associado a um serviço específico. ' +
      'Use quando precisar de instruções passo a passo para mitigar falhas, reprocessar filas, reiniciar componentes ou investigar causas de incidentes em um serviço. ' +
      'Não use para alterar o estado de incidentes ou alertas. ' +
      'Retorna o título e as instruções operacionais do serviço em formato de texto estruturado ou mensagem informativa se o serviço não possuir runbook cadastrado.',
    schema: consultarRunbookSchema,
  }
);

export const checkProviderStatus = tool(
  async ({ provider }) => fetchProviderStatus(provider, activeFetch),
  {
    name: 'check_provider_status',
    description:
      'Consulta a statuspage pública de provedores externos essenciais (GitHub e Cloudflare) para verificar a saúde operacional de serviços terceiros. ' +
      'Use quando houver suspeita de instabilidade externa, falhas em dependências de terceiros, lentidão de rede externa ou para responder à pergunta "é problema nosso ou do provedor?". ' +
      'Não use para consultar alertas, incidentes ou serviços internos da nossa infraestrutura (use list_alerts e list_incidents). ' +
      'Retorna uma linha compacta informando o indicador e descrição oficial do provedor ou mensagem explicativa em caso de indisponibilidade de consulta.',
    schema: checkProviderStatusSchema,
  }
);

export const forgetPreferenceSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      'Termo ou descrição da preferência ou fato sobre o usuário que deve ser esquecido (ex: "preferência por tópicos", "alertas no slack")'
    ),
  memoryId: z
    .number()
    .optional()
    .describe('ID numérico específico da memória a ser esquecida, caso conhecido'),
});

export const forgetPreference = tool(
  async ({ query, memoryId }) => {
    const userId = activeUserId;
    if (!userId) {
      return JSON.stringify({
        error: 'Nenhum usuário ativo identificado para esquecer preferências.',
      });
    }

    if (memoryId !== undefined) {
      const removed = await activeMemoryStore.forget(userId, memoryId);
      if (removed) {
        return JSON.stringify({
          status: 'success',
          message: `Preferência com ID ${memoryId} foi esquecida com sucesso.`,
          memoryId,
        });
      }
      return JSON.stringify({
        status: 'not_found',
        message: `Nenhuma preferência com ID ${memoryId} foi encontrada para este usuário.`,
      });
    }

    // Busca semântica para encontrar a preferência mais relevante
    const recalled = await activeMemoryStore.recall(userId, query, 1);
    if (recalled.length === 0) {
      return JSON.stringify({
        status: 'not_found',
        message: `Nenhuma preferência correspondente a "${query}" foi encontrada na sua memória.`,
      });
    }

    const target = recalled[0];
    const removed = await activeMemoryStore.forget(userId, target.id);
    if (removed) {
      return JSON.stringify({
        status: 'success',
        message: `A preferência "${target.fact}" foi esquecida com sucesso.`,
        forgottenFact: target.fact,
        memoryId: target.id,
      });
    }

    return JSON.stringify({
      error: 'Falha ao remover a preferência da memória.',
    });
  },
  {
    name: 'forget_preference',
    description:
      'Esquece ou apaga uma preferência, fato ou informação previamente memorizada sobre o usuário no sistema. ' +
      'Use quando o usuário pedir explicitamente para esquecer, apagar ou desconsiderar uma preferência anterior.',
    schema: forgetPreferenceSchema,
  }
);

export const opsTools = [
  listAlerts,
  openIncident,
  resolveIncident,
  listIncidents,
  getOpenIncidentsReport,
  consultarRunbook,
  checkProviderStatus,
  forgetPreference,
];

export const tools = opsTools;

export type ToolName =
  | 'list_alerts'
  | 'open_incident'
  | 'resolve_incident'
  | 'list_incidents'
  | 'get_open_incidents_report'
  | 'consultar_runbook'
  | 'check_provider_status'
  | 'forget_preference';
