import { z } from 'zod';
import { createModel } from '../agents/model.js';

// ─── Schema de Saída Estruturada do Aprendizado ───────────────────────────────

export const LearningSchema = z.object({
  hasLearning: z
    .boolean()
    .describe(
      'true se a mensagem do usuário contém fatos, preferências duráveis ou papéis persistentes; false caso contrário'
    ),
  fact: z
    .string()
    .optional()
    .describe(
      'Fato durável conciso em terceira pessoa (ex: "O usuário se chama Thiago e é o tech lead do auth"). NUNCA incluir pedidos pontuais nem segredos. Omitir se hasLearning for false.'
    ),
});

export type LearningResult = z.infer<typeof LearningSchema>;

// ─── System Prompt do Refletor ────────────────────────────────────────────────

export const REFLECTOR_SYSTEM_PROMPT =
  `Você é um analisador e destilador de memória semântica para o OpsPilot.\n` +
  `Sua missão é analisar a mensagem do usuário e determinar se há alguma preferência, característica ou fato DURÁVEL sobre o usuário que deva ser lembrado no longo prazo.\n\n` +
  `Regras estritas:\n` +
  `1. FATOS DURÁVEIS PERMITIDOS:\n` +
  `   - Preferências pessoais ou de trabalho (ex: "prefiro logs em json", "gosto de respostas em tópicos", "trabalho no período noturno").\n` +
  `   - Nomes, identificações ou papéis no time (ex: "meu nome é Thiago", "sou o tech lead do serviço auth").\n` +
  `   - Tecnologias favoritas ou ferramentas usadas pelo usuário.\n\n` +
  `2. NUNCA MEMORIZAR PEDIDOS PONTUAIS OPERACIONAIS:\n` +
  `   - Ordens imediatas de execução (ex: "abra um incidente", "liste os alertas", "qual o status do github?", "consulte o runbook de pagamentos", "reinicie o pod").\n` +
  `   - Perguntas pontuais do usuário (ex: "qual o meu nome?", "o que você pode fazer?").\n` +
  `   - Nesses casos, defina hasLearning = false e omita o campo fact.\n\n` +
  `3. NUNCA MEMORIZAR SEGREDOS OU DADOS SENSÍVEIS:\n` +
  `   - Senhas, tokens de autenticação, chaves de API, segredos de infraestrutura, credenciais, bearer tokens.\n` +
  `   - Nesses casos, defina hasLearning = false e NUNCA coloque o segredo em fact.\n\n` +
  `Formato de saída:\n` +
  `- hasLearning: boolean (true se houver fato durável legítimo, false caso contrário)\n` +
  `- fact: string concisa na terceira pessoa ou neutra resumindo o fato (ex: "O usuário se chama Thiago e é o responsável pelo serviço auth"). Omitir se hasLearning for false.`;

// ─── Função de Reflexão de Aprendizado ─────────────────────────────────────────

export interface StructuredModel {
  withStructuredOutput(schema: typeof LearningSchema): {
    invoke(messages: Array<{ role: string; content: string }>): Promise<LearningResult>;
  };
}

/**
 * Analisa a mensagem do usuário e destila fatos duráveis para a memória semântica.
 * Descarta pedidos pontuais operacionais e segredos/credenciais.
 */
export async function reflectLearning(
  userMessage: string,
  model?: StructuredModel
): Promise<LearningResult> {
  const activeModel = (model ?? createModel()) as unknown as StructuredModel;
  const structuredExtractor = activeModel.withStructuredOutput(LearningSchema);

  const result = await structuredExtractor.invoke([
    { role: 'system', content: REFLECTOR_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ]);

  if (!result.hasLearning || !result.fact?.trim()) {
    return { hasLearning: false };
  }

  return {
    hasLearning: true,
    fact: result.fact.trim(),
  };
}
