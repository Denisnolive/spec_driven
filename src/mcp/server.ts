import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SqliteOpsStore } from '../store/sqlite-ops-store.js';
import {
  listAlertsSchema,
  openIncidentSchema,
  resolveIncidentSchema,
} from '../agents/tools.js';

const store = new SqliteOpsStore();
const server = new McpServer({
  name: 'opspilot',
  version: '1.0.0',
});

// ─── Tools ────────────────────────────────────────────────────────────────────

server.registerTool(
  'list_alerts',
  {
    description:
      'Lista e filtra alertas de monitoramento da infraestrutura e serviços. ' +
      'Use quando o operador perguntar sobre o estado do plantão, serviços degradados, alertas ativos ou resolvidos.',
    inputSchema: listAlertsSchema.shape,
  },
  async ({ status }) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(await store.listAlerts(status)) }],
  })
);

server.registerTool(
  'open_incident',
  {
    description:
      'Abre um novo incidente no OpsPilot. ' +
      'Use quando o usuário relatar um problema em produção ou pedir para registrar/abrir um incidente.',
    inputSchema: openIncidentSchema.shape,
  },
  async ({ title, service, severity, summary }) => ({
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(await store.openIncident({ title, service, severity, summary })),
      },
    ],
  })
);

server.registerTool(
  'resolve_incident',
  {
    description:
      'Marca um incidente existente como resolvido. ' +
      'Use quando a causa raiz tiver sido mitigada ou o operador solicitar o fechamento.',
    inputSchema: resolveIncidentSchema.shape,
  },
  async ({ id, summary }) => {
    const result = await store.resolveIncident(id, summary);
    const isError = 'error' in result;
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      isError,
    };
  }
);

// ─── Bootstrap ────────────────────────────────────────────────────────────────

await server.connect(new StdioServerTransport());
console.error('opspilot MCP server: pronto (stdio)'); // stderr, nunca stdout
