import { Annotation } from '@langchain/langgraph';
import { z } from 'zod';
import type { TraceEvent, Metrics } from '../agents/types.js';
import type { BuiltContext } from '../context/context-builder.js';

// ─── Schema de Decisão Estruturada do Supervisor ──────────────────────────────

export const nextSchema = z.object({
  next: z
    .enum(['analista', 'planejador', 'executor', 'done'])
    .describe('instrução de trabalho para o próximo papel (nó) ou resumo final se done'),
  brief: z
    .string()
    .describe('instrução de trabalho para o próximo papel (nó) ou resumo final se done'),
});

export type NextDecision = z.infer<typeof nextSchema>;
export const supervisorDecisionSchema = nextSchema;
export type SupervisorDecision = NextDecision;

// ─── Estrutura do Blackboard ──────────────────────────────────────────────────

export interface Blackboard {
  task: string;
  findings: string[];
  plan?: string;
  actions: string[];
  status: 'triaging' | 'planning' | 'executing' | 'completed' | 'exhausted';
}

export const blackboardSchema = z.object({
  task: z.string(),
  findings: z.array(z.string()).default([]),
  plan: z.string().optional(),
  actions: z.array(z.string()).default([]),
  status: z.enum(['triaging', 'planning', 'executing', 'completed', 'exhausted']).default('triaging'),
});

// ─── Anotação de Estado do Grafo de Equipe (TeamState) ─────────────────────────

export const TeamState = Annotation.Root({
  task: Annotation<string>({
    reducer: (_, b) => b,
    default: () => '',
  }),
  history: Annotation<Array<{ role: 'user' | 'assistant' | 'system'; content: string }>>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  builtContext: Annotation<BuiltContext | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  blackboard: Annotation<Blackboard>({
    reducer: (curr, update) => ({
      ...curr,
      ...update,
      findings: update.findings !== undefined ? update.findings : curr.findings,
      actions: update.actions !== undefined ? update.actions : curr.actions,
    }),
    default: () => ({
      task: '',
      findings: [],
      actions: [],
      status: 'triaging',
    }),
  }),
  next: Annotation<string>({
    reducer: (_, b) => b,
    default: () => 'supervisor',
  }),
  brief: Annotation<string>({
    reducer: (_, b) => b,
    default: () => '',
  }),
  iterationCount: Annotation<number>({
    reducer: (_, b) => b,
    default: () => 0,
  }),
  trace: Annotation<TraceEvent[]>({
    reducer: (curr, add) => [...curr, ...add],
    default: () => [],
  }),
  answer: Annotation<string>({
    reducer: (_, b) => b,
    default: () => '',
  }),
  metrics: Annotation<Metrics>({
    reducer: (curr, upd) => ({
      ...curr,
      ...upd,
      llmCalls: (curr.llmCalls || 0) + (upd.llmCalls || 0),
      latencyMs: (curr.latencyMs || 0) + (upd.latencyMs || 0),
    }),
    default: () => ({ llmCalls: 0, latencyMs: 0 }),
  }),
});

export type TeamGraphState = typeof TeamState.State;

// ─── Helper de Serialização do Blackboard ──────────────────────────────────────

/**
 * Converte o estado atual do Blackboard em texto formatado para o prompt do Supervisor.
 */
export function blackboardAsText(state: TeamGraphState): string {
  const bb = state.blackboard;
  const sections: string[] = [];

  sections.push(`### TAREFA DO PLANTÃO:\n${bb.task || state.task || '(não informada)'}`);

  sections.push(
    `### DIAGNÓSTICO FACTUAL (ANALISTA):\n` +
      (bb.findings && bb.findings.length > 0
        ? bb.findings.map((f, i) => `${i + 1}. ${f}`).join('\n')
        : '(Nenhuma observação factual registrada até o momento)')
  );

  sections.push(
    `### PLANO TÁTICO (PLANEJADOR):\n` +
      (bb.plan ? bb.plan : '(Nenhum plano tático estruturado ainda)')
  );

  sections.push(
    `### AÇÕES OPERACIONAIS (EXECUTOR):\n` +
      (bb.actions && bb.actions.length > 0
        ? bb.actions.map((a, i) => `${i + 1}. ${a}`).join('\n')
        : '(Nenhuma ação sobre incidentes executada ainda)')
  );

  sections.push(
    `### STATUS GERAL: ${bb.status.toUpperCase()} | TURNO ATUAL: ${state.iterationCount}/8`
  );

  return sections.join('\n\n');
}
