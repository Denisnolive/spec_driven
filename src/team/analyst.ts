import { createModel } from '../agents/model.js';
import {
  listAlerts,
  listIncidents,
  getOpenIncidentsReport,
  consultarRunbook,
  checkProviderStatus,
} from '../agents/tools.js';
import type { TraceEvent } from '../agents/types.js';
import { blackboardAsText, type TeamGraphState } from './types.js';

export const ANALYST_SYSTEM_PROMPT =
  'Você é o ANALISTA do plantão. Sua única função: produzir diagnóstico FACTUAL do estado atual, ' +
  'usando as ferramentas de leitura. Liste: alertas disparando (com data e severidade), incidentes ' +
  'recentes (abertos e resolvidos), runbooks relevantes, status dos provedores, janelas/fatos conhecidos do time. ' +
  'NÃO proponha soluções. NÃO abra nem resolva nada. Formato: tópicos telegráficos. ' +
  'Seja cético: se um dado não está nas observações, não afirme.';

/** Conjunto estrito de ferramentas de leitura autorizadas para o Analista */
export const analystReadTools = [
  listAlerts,
  listIncidents,
  getOpenIncidentsReport,
  consultarRunbook,
  checkProviderStatus,
];

export interface AnalystOptions {
  model?: any;
}

/**
 * Nó do Analista: coleta dados factuais estritos através de ferramentas de leitura
 * e anexa as observações ao Blackboard sem propor soluções.
 */
export async function analystNode(
  state: TeamGraphState,
  options: AnalystOptions = {}
): Promise<Partial<TeamGraphState>> {
  const model = options.model ?? createModel();
  const modelWithTools = model.bindTools ? model.bindTools(analystReadTools) : model;

  const promptMessages = [
    ['system', ANALYST_SYSTEM_PROMPT],
    [
      'user',
      `INSTRUÇÃO DO SUPERVISOR:\n${state.brief || 'Analise os sintomas e colha evidências factuais.'}\n\n` +
        `ESTADO ATUAL DO BLACKBOARD:\n${blackboardAsText(state)}`,
    ],
  ];

  const traceEvents: TraceEvent[] = [];
  let newFindings: string[] = [];

  try {
    const response = await modelWithTools.invoke(promptMessages);

    // Se o modelo emitiu tool calls, executa as ferramentas de leitura autorizadas
    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const call of response.tool_calls) {
        const toolFound = analystReadTools.find((t) => t.name === call.name);
        traceEvents.push({
          node: 'analista',
          kind: 'action',
          type: 'action',
          content: { tool: call.name, args: call.args || {} },
          timestampMs: Date.now(),
        });

        if (toolFound) {
          const rawResult = await (toolFound as any).invoke(call.args || {});
          const resultStr = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
          traceEvents.push({
            node: 'analista',
            kind: 'observation',
            type: 'observation',
            content: resultStr,
            timestampMs: Date.now(),
          });
          newFindings.push(`[${call.name}] ${resultStr.slice(0, 300)}`);
        }
      }

      // Segunda passagem para síntese telegráfica dos fatos colhidos
      const followUp = await model.invoke([
        ['system', ANALYST_SYSTEM_PROMPT],
        [
          'user',
          `Com base nas observações colhidas:\n${newFindings.join('\n')}\n` +
            'Resuma em tópicos telegráficos puramente factuais, sem hipóteses ou sugestões.',
        ],
      ]);

      const text = typeof followUp.content === 'string' ? followUp.content : JSON.stringify(followUp.content);
      newFindings.push(text);
    } else {
      const text = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      newFindings.push(text);
    }
  } catch (err) {
    newFindings.push(`[Erro de análise] Falha na coleta de diagnóstico: ${(err as Error).message}`);
  }

  traceEvents.push({
    node: 'analista',
    kind: 'thought',
    content: `Diagnóstico factual concluído com ${newFindings.length} apontamentos.`,
    timestampMs: Date.now(),
  });

  return {
    blackboard: {
      ...state.blackboard,
      status: 'triaging',
      findings: [...(state.blackboard.findings || []), ...newFindings],
    },
    trace: traceEvents,
    metrics: {
      llmCalls: (state.metrics?.llmCalls || 0) + 1,
      latencyMs: state.metrics?.latencyMs || 0,
    },
  };
}
