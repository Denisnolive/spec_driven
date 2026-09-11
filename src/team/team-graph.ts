import { StateGraph, START, END } from '@langchain/langgraph';
import type { ReasoningStrategy, StrategyInput, StrategyResult, TraceEvent } from '../agents/types.js';
import { normalizeInput } from '../agents/types.js';
import { TeamState, type TeamGraphState, blackboardAsText } from './types.js';
import { supervisorNode, type SupervisorOptions } from './supervisor.js';
import { analystNode, type AnalystOptions } from './analyst.js';
import { plannerNode, type PlannerOptions } from './planner.js';
import { executorNode, type ExecutorOptions } from './executor.js';
import { createModel } from '../agents/model.js';

export interface TeamGraphOptions {
  supervisorModel?: any;
  analystModel?: any;
  plannerModel?: any;
  executorModel?: any;
  finalModel?: any;
}

/**
 * Nó de finalização (done): consolida a síntese conclusiva com base no estado do Blackboard.
 */
async function doneNode(
  state: TeamGraphState,
  options: TeamGraphOptions = {}
): Promise<Partial<TeamGraphState>> {
  const bb = state.blackboard;
  let finalAnswer = state.brief || '';

  // Se o brief for uma instrução genérica ou estiver vazio, consolida uma síntese rica
  if (!finalAnswer || finalAnswer.startsWith('Finalizado') || finalAnswer.length < 20) {
    const parts: string[] = [];
    parts.push(`## Relatório de Atendimento do Time de Operações\n`);
    parts.push(`**Demanda**: ${bb.task || state.task}\n`);

    if (bb.findings && bb.findings.length > 0) {
      parts.push(`### 🔍 Diagnóstico Factual (Analista)\n${bb.findings.join('\n\n')}`);
    }

    if (bb.plan) {
      parts.push(`### 📋 Plano Tático (Planejador)\n${bb.plan}`);
    }

    if (bb.actions && bb.actions.length > 0) {
      parts.push(`### ⚡ Ações Executadas (Executor)\n${bb.actions.join('\n\n')}`);
    }

    if (bb.status === 'exhausted') {
      parts.push(`\n⚠️ *Aviso: O atendimento atingiu o teto operacional de 8 turnos da equipe.*`);
    }

    finalAnswer = parts.join('\n\n');
  }

  const answerEvent: TraceEvent = {
    node: 'done',
    kind: 'answer',
    type: 'answer',
    content: finalAnswer,
    timestampMs: Date.now(),
  };

  return {
    answer: finalAnswer,
    trace: [answerEvent],
    blackboard: {
      ...bb,
      status: bb.status === 'exhausted' ? 'exhausted' : 'completed',
    },
  };
}

/**
 * Constrói e compila o StateGraph supervisionado do time multiagente.
 */
export function createTeamGraph(options: TeamGraphOptions = {}) {
  const workflow = new StateGraph(TeamState)
    .addNode('supervisor', (state) => supervisorNode(state, { model: options.supervisorModel }))
    .addNode('analista', (state) => analystNode(state, { model: options.analystModel }))
    .addNode('planejador', (state) => plannerNode(state, { model: options.plannerModel }))
    .addNode('executor', (state) => executorNode(state, { model: options.executorModel }))
    .addNode('done', (state) => doneNode(state, options))
    .addEdge(START, 'supervisor')
    .addConditionalEdges('supervisor', (s) => s.next || 'done', {
      analista: 'analista',
      planejador: 'planejador',
      executor: 'executor',
      done: 'done',
    })
    .addEdge('analista', 'supervisor')
    .addEdge('planejador', 'supervisor')
    .addEdge('executor', 'supervisor')
    .addEdge('done', END);

  return workflow.compile();
}

/** Instância singleton do grafo de equipe */
export const teamGraph = createTeamGraph();

/**
 * Executa o grafo de equipe e retorna o resultado formatado.
 */
export async function runTeamGraph(
  input: {
    message: string;
    history?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  },
  options: TeamGraphOptions = {}
): Promise<StrategyResult> {
  const graph = options && Object.keys(options).length > 0 ? createTeamGraph(options) : teamGraph;

  const result = await graph.invoke({
    task: input.message,
    history: input.history || [],
    blackboard: {
      task: input.message,
      findings: [],
      actions: [],
      status: 'triaging',
    },
    iterationCount: 0,
  });

  return {
    answer: result.answer || result.brief || 'Atendimento concluído pela equipe.',
    trace: result.trace || [],
    metrics: result.metrics || { llmCalls: 0, latencyMs: 0 },
  };
}

/**
 * Estratégia compatível com ReasoningStrategy do OpsPilot.
 */
export class TeamStrategy implements ReasoningStrategy {
  readonly name = 'team';
  private options: TeamGraphOptions;

  constructor(options: TeamGraphOptions = {}) {
    this.options = options;
  }

  async run(input: string | StrategyInput): Promise<StrategyResult> {
    const normalized = normalizeInput(input);
    return runTeamGraph(
      {
        message: normalized.message,
        history: normalized.history,
      },
      this.options
    );
  }
}
