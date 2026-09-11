import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ContextBuilder,
  buildContext,
  resolveBudgetConfig,
  section,
  fitToBudget,
  assemble,
  type ContextMessageItem,
  type ContextMemoryItem,
} from './context-builder.js';
import { estimateTokens } from './tokens.js';

describe('ContextBuilder com Orçamento por Seção', () => {
  describe('Resolução de Configuração de Orçamento (resolveBudgetConfig)', () => {
    it('utiliza valores padrão quando variáveis de ambiente e overrides estão ausentes', () => {
      const budget = resolveBudgetConfig({});
      assert.deepEqual(budget, {
        summary: 200,
        history: 1200,
        memories: 300,
      });
    });

    it('lê variáveis de ambiente CONTEXT_BUDGET_*', () => {
      const budget = resolveBudgetConfig({
        CONTEXT_BUDGET_SUMMARY: '150',
        CONTEXT_BUDGET_WINDOW: '800',
        CONTEXT_BUDGET_MEMORIES: '250',
      });
      assert.deepEqual(budget, {
        summary: 150,
        history: 800,
        memories: 250,
      });
    });

    it('aceita CONTEXT_BUDGET_HISTORY como fallback para CONTEXT_BUDGET_WINDOW', () => {
      const budget = resolveBudgetConfig({
        CONTEXT_BUDGET_HISTORY: '950',
      });
      assert.equal(budget.history, 950);
    });

    it('aceita CONTEXT_BUDGET_SUMARY como tolerância ao erro de digitação de CONTEXT_BUDGET_SUMMARY', () => {
      const budget = resolveBudgetConfig({
        CONTEXT_BUDGET_SUMARY: '110',
      });
      assert.equal(budget.summary, 110);
    });

    it('aplica overrides pontuais sobre as variáveis de ambiente', () => {
      const budget = resolveBudgetConfig(
        {
          CONTEXT_BUDGET_SUMMARY: '150',
          CONTEXT_BUDGET_WINDOW: '800',
        },
        {
          history: 500,
        }
      );
      assert.equal(budget.summary, 150);
      assert.equal(budget.history, 500);
      assert.equal(budget.memories, 300);
    });
  });

  describe('Montagem Básica e Tetos Padrão (Sem Poda)', () => {
    it('monta contexto completo preservando todas as seções quando volume está dentro do orçamento', () => {
      const input = {
        systemPrompt: 'Você é o agente OpsPilot.',
        message: 'Qual o status do serviço de autenticação?',
        summary: 'Conversa anterior tratava de um deploy.',
        history: [
          { role: 'user' as const, content: 'Olá!' },
          { role: 'assistant' as const, content: 'Olá! Como posso ajudar?' },
        ],
        memories: [
          { fact: 'O cluster k8s roda em us-east-1', score: 0.85 },
          { fact: 'O serviço de auth roda na porta 4000', score: 0.92 },
        ],
      };

      const result = buildContext(input);

      assert.equal(result.systemPrompt, input.systemPrompt);
      assert.equal(result.userMessage, input.message);
      assert.equal(result.summary, input.summary);
      assert.equal(result.history.length, 2);
      assert.equal(result.memories.length, 2);

      // Verificação das mensagens estruturadas
      assert.equal(result.messages.length, 4); // system + 2 history + user
      assert.equal(result.messages[0].role, 'system');
      assert.equal(result.messages[1].role, 'user');
      assert.equal(result.messages[2].role, 'assistant');
      assert.equal(result.messages[3].role, 'user');

      // Verificação do bloco de prompt consolidado
      assert.match(result.promptMessage, /\[Resumo da Conversa Anterior\]/);
      assert.match(result.promptMessage, /\[Memórias do Usuário\]/);
      assert.match(result.promptMessage, /Qual o status do serviço de autenticação\?/);

      // Verificação das estatísticas
      assert.equal(result.stats.originalHistoryCount, 2);
      assert.equal(result.stats.includedHistoryCount, 2);
      assert.equal(result.stats.prunedHistoryCount, 0);
      assert.equal(result.stats.originalMemoriesCount, 2);
      assert.equal(result.stats.includedMemoriesCount, 2);
      assert.equal(result.stats.prunedMemoriesCount, 0);
      assert.equal(result.stats.summaryTruncated, false);

      // Breakdown positivo por seção
      assert.ok(result.breakdown.userMessage > 0);
      assert.ok(result.breakdown.history > 0);
      assert.ok(result.breakdown.memories > 0);
      assert.ok(result.breakdown.summary > 0);
      assert.equal(
        result.breakdown.totalEstimated,
        result.breakdown.userMessage +
          result.breakdown.history +
          result.breakdown.memories +
          result.breakdown.summary
      );
    });
  });

  describe('Poda FIFO de Histórico (Oldest-First Pruning)', () => {
    it('com teto de histórico baixo, descarta as mensagens mais antigas primeiro e preserva a ordem cronológica', () => {
      // 5 mensagens, cada uma com aproximadamente 20 tokens (~80 chars)
      const history: ContextMessageItem[] = [
        { role: 'user', content: 'Turno 1: Mensagem inicial bastante detalhada sobre o incidente A' },
        { role: 'assistant', content: 'Turno 2: Investigando logs do servidor web do incidente A' },
        { role: 'user', content: 'Turno 3: Encontrei novo erro de timeout no banco de dados' },
        { role: 'assistant', content: 'Turno 4: Verifiquei o pool de conexões com o banco' },
        { role: 'user', content: 'Turno 5: O pool de conexões foi restaurado com sucesso' },
      ];

      // Cada item consome ~18-20 tokens.
      // Calculamos o custo das 2 últimas mensagens:
      const t4Tokens = estimateTokens('assistant: Turno 4: Verifiquei o pool de conexões com o banco');
      const t5Tokens = estimateTokens('user: Turno 5: O pool de conexões foi restaurado com sucesso');
      const exactBudgetForLastTwo = t4Tokens + t5Tokens + 2;

      const result = buildContext({
        message: 'Qual é o status atual?',
        history,
        budget: {
          history: exactBudgetForLastTwo,
        },
      });

      // Apenas os turnos 4 e 5 devem permanecer (Turnos 1, 2 e 3 podados)
      assert.equal(result.history.length, 2);
      assert.equal(result.history[0].content, history[3].content);
      assert.equal(result.history[1].content, history[4].content);

      // Contadores de estatísticas
      assert.equal(result.stats.originalHistoryCount, 5);
      assert.equal(result.stats.includedHistoryCount, 2);
      assert.equal(result.stats.prunedHistoryCount, 3);
    });

    it('quando o teto de histórico é zero, todo o histórico é podado sem quebrar o builder', () => {
      const history: ContextMessageItem[] = [
        { role: 'user', content: 'Primeira' },
        { role: 'assistant', content: 'Segunda' },
      ];

      const result = buildContext({
        message: 'Mensagem atual',
        history,
        budget: { history: 0 },
      });

      assert.equal(result.history.length, 0);
      assert.equal(result.stats.originalHistoryCount, 2);
      assert.equal(result.stats.includedHistoryCount, 0);
      assert.equal(result.stats.prunedHistoryCount, 2);
    });
  });

  describe('Poda de Memórias por Score (Lowest-Score-First Pruning)', () => {
    it('com teto baixo de memórias, descarta as de menor score mantendo as mais relevantes', () => {
      const memories: ContextMemoryItem[] = [
        { fact: 'Memória D com score mais baixo', score: 0.35 },
        { fact: 'Memória A com maior relevância', score: 0.95 },
        { fact: 'Memória C com média relevância', score: 0.62 },
        { fact: 'Memória B com alta relevância', score: 0.88 },
      ];

      // Header '[Memórias do Usuário]\n' consome ~6 tokens
      const headerTokens = estimateTokens('[Memórias do Usuário]\n');
      const memATokens = estimateTokens('- Memória A com maior relevância');
      const memBTokens = estimateTokens('- Memória B com alta relevância');

      // Teto suficiente apenas para o cabeçalho + as 2 memórias de maior score
      const budgetMemories = headerTokens + memATokens + memBTokens;

      const result = buildContext({
        message: 'Preciso de ajuda',
        memories,
        budget: { memories: budgetMemories },
      });

      // Devem permanecer apenas Memória A (0.95) e Memória B (0.88)
      assert.equal(result.memories.length, 2);
      assert.equal(result.memories[0].fact, 'Memória A com maior relevância');
      assert.equal(result.memories[1].fact, 'Memória B com alta relevância');

      assert.equal(result.stats.originalMemoriesCount, 4);
      assert.equal(result.stats.includedMemoriesCount, 2);
      assert.equal(result.stats.prunedMemoriesCount, 2);
    });

    it('quando o teto de memórias é zero, nenhuma memória é incluída e cabeçalho é omitido', () => {
      const memories: ContextMemoryItem[] = [
        { fact: 'Algum fato importante', score: 0.99 },
      ];

      const result = buildContext({
        message: 'Olá',
        memories,
        budget: { memories: 0 },
      });

      assert.equal(result.memories.length, 0);
      assert.equal(result.stats.prunedMemoriesCount, 1);
      assert.ok(!result.promptMessage.includes('[Memórias do Usuário]'));
    });
  });

  describe('Truncamento Seguro de Resumo', () => {
    it('trunca resumo quando o número de tokens ultrapassa o teto', () => {
      const longSummary = 'A'.repeat(400); // ~100 tokens

      const result = buildContext({
        message: 'Teste',
        summary: longSummary,
        budget: { summary: 20 }, // teto baixo: 20 tokens -> ~80 chars
      });

      assert.ok(result.summary !== null);
      assert.ok(result.summary.length <= 80);
      assert.ok(result.summary.endsWith('...'));
      assert.equal(result.stats.summaryTruncated, true);
    });

    it('preserva resumo intacto quando cabe no teto', () => {
      const summary = 'Resumo curto de teste.';

      const result = buildContext({
        message: 'Teste',
        summary,
        budget: { summary: 200 },
      });

      assert.equal(result.summary, summary);
      assert.equal(result.stats.summaryTruncated, false);
    });
  });

  describe('Garantia de Intocabilidade de System e Mensagem do Usuário', () => {
    it('preserva 100% de systemPrompt e userMessage mesmo sob orçamentos zerados', () => {
      const largeSystemPrompt = 'Instruções de segurança e auditoria rigorosas. '.repeat(20);
      const largeUserMessage = 'Como resolver o erro de timeout no gateway? '.repeat(15);

      const result = buildContext({
        systemPrompt: largeSystemPrompt,
        message: largeUserMessage,
        history: [{ role: 'user', content: 'mensagem antiga' }],
        memories: [{ fact: 'fato antigo', score: 0.9 }],
        summary: 'resumo antigo',
        budget: {
          history: 0,
          memories: 0,
          summary: 0,
        },
      });

      // System e mensagem do usuário permanecem idênticos, caractere por caractere
      assert.equal(result.systemPrompt, largeSystemPrompt);
      assert.equal(result.userMessage, largeUserMessage);
      assert.ok(result.promptMessage.endsWith(largeUserMessage));

      // As seções com teto zerado foram eliminadas
      assert.equal(result.history.length, 0);
      assert.equal(result.memories.length, 0);
    });
  });

  describe('Modelo Funcional de Seções (section, fitToBudget, assemble)', () => {
    it('permite construir e compor seções de forma desacoplada', () => {
      const secHistory = section('history', [{ role: 'user' as const, content: 'msg' }], {
        budget: 50,
        cut: 'oldest-first',
      });
      const fitted = fitToBudget(secHistory);

      assert.equal(fitted.name, 'history');
      assert.equal(fitted.includedCount, 1);

      const built = assemble([fitted], 'Mensagem atual', 'System');
      assert.equal(built.userMessage, 'Mensagem atual');
      assert.equal(built.systemPrompt, 'System');
      assert.equal(built.history.length, 1);
    });
  });
});
