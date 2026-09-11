import { createModel } from '../agents/model.js';
import type { TraceEvent } from '../agents/types.js';
import {
  nextSchema,
  blackboardAsText,
  type TeamGraphState,
  type NextDecision,
} from './types.js';

export const SUPERVISOR_PROMPT = `Você é o SUPERVISOR do time de operações de plantão do OpsPilot.
Sua responsabilidade é coordenar especialistas (Analista, Planejador, Executor) usando um Blackboard compartilhado.

Papéis disponíveis no time:
1. analista: Produz diagnóstico factual estrito usando apenas ferramentas de leitura. Liste alertas, status, runbooks e incidentes. NÃO propõe soluções nem executa mutações.
2. planejador: Elabora um plano de ação tático passo a passo com base estrita nas evidências levantadas pelo analista. Opera SEM ferramentas externas (zero-tools).
3. executor: Executa estritamente as ações operacionais sobre incidentes (abertura, atualização, resolução) com base no plano aprovado, sem desvios e com validação de domínio.
4. done: O atendimento da tarefa do usuário foi plenamente concluído, ou o diagnóstico/plano já são suficientes para resposta final ao operador.

Critérios de sequência recomendados:
- Início de incidente ou dúvida: delegue primeiro para "analista" para colher fatos e evidências.
- Após o diagnóstico colhido: delegue para "planejador" estruturar a resolução tática.
- Após o plano estruturado: se houver necessidade de intervir em incidentes (abrir/resolver), delegue para "executor".
- Quando as intervenções terminarem ou se nenhuma intervenção for necessária: delegue para "done" sintetizando a resposta final.

Retorne estritamente o próximo papel ("analista", "planejador", "executor" ou "done") e um "brief" contendo a instrução de trabalho concisa ou o resumo final se done.`;

export interface SupervisorOptions {
  model?: {
    withStructuredOutput(schema: typeof nextSchema): {
      invoke(input: unknown): Promise<NextDecision>;
    };
  };
}

/**
 * Nó do Supervisor: avalia o blackboard e emite decisão estruturada { next, brief }
 * aplicando teto incondicional de 8 iterações.
 */
export async function supervisorNode(
  state: TeamGraphState,
  options: SupervisorOptions = {}
): Promise<Partial<TeamGraphState>> {
  const nextIteration = (state.iterationCount || 0) + 1;

  // ─── Teto de Segurança (Max 8 Iterações) ──────────────────────────────────
  if (nextIteration > 8) {
    const brief = '⚠️ Teto operacional da equipe atingido (8/8 turnos). Atendimento finalizado com o estado consolidado no blackboard.';
    const handoffEvent: TraceEvent = {
      node: 'supervisor',
      kind: 'handoff',
      type: 'handoff',
      from: 'supervisor',
      to: 'done',
      brief,
      iteration: 8,
      content: `Handoff [8/8]: supervisor ➔ done - "${brief}"`,
      timestampMs: Date.now(),
    };

    return {
      iterationCount: 8,
      next: 'done',
      brief,
      blackboard: {
        ...state.blackboard,
        status: 'exhausted',
      },
      trace: [handoffEvent],
    };
  }

  // ─── Chamada Estruturada ao LLM ───────────────────────────────────────────
  let verdict: NextDecision;
  try {
    const model = options.model ?? createModel();
    const promptInput = [
      ['system', SUPERVISOR_PROMPT],
      ['user', blackboardAsText(state)],
    ];

    const rawVerdict = await model.withStructuredOutput(nextSchema).invoke(promptInput);
    const parsed = nextSchema.safeParse(rawVerdict);
    if (parsed.success) {
      verdict = parsed.data;
    } else {
      verdict = {
        next: 'done',
        brief: 'Finalizado após retorno não estruturado do supervisor.',
      };
    }
  } catch (err) {
    verdict = {
      next: 'done',
      brief: `Finalizado com segurança devido a erro no supervisor: ${(err as Error).message}`,
    };
  }

  // Se atingiu exatamente a 8ª iteração e o veredito não foi 'done', avisa que é a última chance
  if (nextIteration === 8 && verdict.next !== 'done') {
    // Permite que o especialista execute a 8ª ação; no retorno o supervisor finalizará
  }

  const handoffEvent: TraceEvent = {
    node: 'supervisor',
    kind: 'handoff',
    type: 'handoff',
    from: 'supervisor',
    to: verdict.next,
    brief: verdict.brief,
    iteration: nextIteration,
    content: `Handoff [${nextIteration}/8]: supervisor ➔ ${verdict.next} - "${verdict.brief}"`,
    timestampMs: Date.now(),
  };

  return {
    iterationCount: nextIteration,
    next: verdict.next,
    brief: verdict.brief,
    trace: [handoffEvent],
    metrics: {
      llmCalls: (state.metrics?.llmCalls || 0) + 1,
      latencyMs: state.metrics?.latencyMs || 0,
    },
  };
}
