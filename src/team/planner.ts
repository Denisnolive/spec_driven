import { createModel } from '../agents/model.js';
import type { TraceEvent } from '../agents/types.js';
import { blackboardAsText, type TeamGraphState } from './types.js';

export const PLANNER_SYSTEM_PROMPT =
  'Você é o PLANEJADOR do time de operações do OpsPilot. ' +
  'Sua responsabilidade: elaborar uma estratégia tática de mitigação estruturada e passo a passo ' +
  'com base EXCLUSIVA nas evidências factuais registradas pelo Analista no Blackboard. ' +
  'Você opera sem acesso a ferramentas externas (zero-tools). ' +
  'Defina: 1) Escopo do impacto; 2) Passos operacionais recomendados (ex: abrir incidente com severidade X, executar passos Y do runbook); ' +
  '3) Critério de verificação pós-ação. Seja direto, cirúrgico e tático.';

export interface PlannerOptions {
  model?: any;
}

/**
 * Nó do Planejador: sintetiza plano de ação tático sem ferramentas externas
 * e grava o plano em blackboard.plan.
 */
export async function plannerNode(
  state: TeamGraphState,
  options: PlannerOptions = {}
): Promise<Partial<TeamGraphState>> {
  const model = options.model ?? createModel();

  const promptMessages = [
    ['system', PLANNER_SYSTEM_PROMPT],
    [
      'user',
      `INSTRUÇÃO DO SUPERVISOR:\n${state.brief || 'Elabore o plano tático de mitigação com base nos dados apurados.'}\n\n` +
        `ESTADO ATUAL DO BLACKBOARD:\n${blackboardAsText(state)}`,
    ],
  ];

  const traceEvents: TraceEvent[] = [];
  let planText = '';

  try {
    const response = await model.invoke(promptMessages);
    planText = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  } catch (err) {
    planText = `[Erro de planejamento] Não foi possível estruturar o plano: ${(err as Error).message}`;
  }

  traceEvents.push({
    node: 'planejador',
    kind: 'plan',
    type: 'plan',
    content: planText,
    timestampMs: Date.now(),
  });

  return {
    blackboard: {
      ...state.blackboard,
      status: 'planning',
      plan: planText,
    },
    trace: traceEvents,
    metrics: {
      llmCalls: (state.metrics?.llmCalls || 0) + 1,
      latencyMs: state.metrics?.latencyMs || 0,
    },
  };
}
