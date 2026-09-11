import { z } from 'zod';

// ─── Contratos do Supervisor da Equipe ────────────────────────────────────────

export const supervisorDecisionSchema = z.object({
  next: z
    .enum(['analyst', 'planner', 'executor', 'FINISH'])
    .describe("Próximo especialista a assumir a tarefa ou 'FINISH' se o trabalho foi concluído."),
  brief: z
    .string()
    .min(1, 'O brief não pode ser vazio')
    .describe('Instrução ou síntese concisa para o próximo agente ou usuário.'),
});

export type SupervisorDecision = z.infer<typeof supervisorDecisionSchema>;

// ─── Contratos do Blackboard ──────────────────────────────────────────────────

export const blackboardStatusSchema = z.enum([
  'triaging',
  'planning',
  'executing',
  'completed',
  'exhausted',
]);

export type BlackboardStatus = z.infer<typeof blackboardStatusSchema>;

export const blackboardSchema = z.object({
  task: z.string(),
  findings: z.array(z.string()).default([]),
  plan: z.string().optional(),
  actions: z.array(z.string()).default([]),
  status: blackboardStatusSchema.default('triaging'),
});

export type BlackboardContract = z.infer<typeof blackboardSchema>;

// ─── Contrato de Handoff no Trace ─────────────────────────────────────────────

export const handoffEventPayloadSchema = z.object({
  from: z.string(),
  to: z.string(),
  brief: z.string(),
  iteration: z.number().int().positive().max(8),
});

export type HandoffEventPayload = z.infer<typeof handoffEventPayloadSchema>;
