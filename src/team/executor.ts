import { createModel } from '../agents/model.js';
import { openIncident, resolveIncident, listIncidents } from '../agents/tools.js';
import type { TraceEvent } from '../agents/types.js';
import { blackboardAsText, type TeamGraphState } from './types.js';

export const EXECUTOR_SYSTEM_PROMPT =
  'Você é o EXECUTOR de incidentes do time de operações do OpsPilot. ' +
  'Sua responsabilidade: executar estritamente as ações operacionais necessárias sobre incidentes ' +
  '(abrir incidente, atualizar status ou resolver incidente) conforme aprovado no plano tático do Blackboard. ' +
  'Você opera estritamente através das ferramentas autorizadas de incidentes, sem bypass e respeitando ' +
  'os parâmetros obrigatórios de severidade e serviço. Após a execução, reporte objetivamente as ações realizadas.';

/** Ferramentas estritas de gestão de incidentes autorizadas para o Executor */
export const executorIncidentTools = [openIncident, resolveIncident, listIncidents];

export interface ExecutorOptions {
  model?: any;
}

/**
 * Nó do Executor: executa ações sobre incidentes sem bypass
 * e registra as ações em blackboard.actions.
 */
export async function executorNode(
  state: TeamGraphState,
  options: ExecutorOptions = {}
): Promise<Partial<TeamGraphState>> {
  const model = options.model ?? createModel();
  const modelWithTools = model.bindTools ? model.bindTools(executorIncidentTools) : model;

  const promptMessages = [
    ['system', EXECUTOR_SYSTEM_PROMPT],
    [
      'user',
      `INSTRUÇÃO DO SUPERVISOR:\n${state.brief || 'Execute as intervenções de incidentes indicadas no plano.'}\n\n` +
        `ESTADO ATUAL DO BLACKBOARD:\n${blackboardAsText(state)}`,
    ],
  ];

  const traceEvents: TraceEvent[] = [];
  const executedActions: string[] = [];

  try {
    const response = await modelWithTools.invoke(promptMessages);

    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const call of response.tool_calls) {
        const toolFound = executorIncidentTools.find((t) => t.name === call.name);
        traceEvents.push({
          node: 'executor',
          kind: 'action',
          type: 'action',
          content: { tool: call.name, args: call.args || {} },
          timestampMs: Date.now(),
        });

        if (toolFound) {
          const rawResult = await (toolFound as any).invoke(call.args || {});
          const resultStr = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
          traceEvents.push({
            node: 'executor',
            kind: 'observation',
            type: 'observation',
            content: resultStr,
            timestampMs: Date.now(),
          });
          executedActions.push(`[${call.name}] ${resultStr}`);
        } else {
          executedActions.push(`[Ação Negada] Ferramenta não autorizada para o Executor: ${call.name}`);
        }
      }

      // Síntese pós-execução
      const followUp = await model.invoke([
        ['system', EXECUTOR_SYSTEM_PROMPT],
        [
          'user',
          `Ações executadas:\n${executedActions.join('\n')}\n` +
            'Resuma de forma concisa o status das intervenções realizadas.',
        ],
      ]);
      const text = typeof followUp.content === 'string' ? followUp.content : JSON.stringify(followUp.content);
      executedActions.push(`Resumo: ${text}`);
    } else {
      const text = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      executedActions.push(text);
    }
  } catch (err) {
    executedActions.push(`[Falha de execução] Erro ao operar sobre incidentes: ${(err as Error).message}`);
  }

  traceEvents.push({
    node: 'executor',
    kind: 'thought',
    content: `Execução concluída com ${executedActions.length} registros.`,
    timestampMs: Date.now(),
  });

  return {
    blackboard: {
      ...state.blackboard,
      status: 'executing',
      actions: [...(state.blackboard.actions || []), ...executedActions],
    },
    trace: traceEvents,
    metrics: {
      llmCalls: (state.metrics?.llmCalls || 0) + 1,
      latencyMs: state.metrics?.latencyMs || 0,
    },
  };
}
