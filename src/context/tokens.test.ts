/**
 * Testes unitários para o módulo de tokens e context breakdown.
 * 100% determinísticos — funções puras sem rede.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTokens,
  extractTokenUsage,
  calculateContextBreakdown,
} from './tokens.js';

describe('Context Tokens & Breakdown (src/context/tokens.ts)', () => {
  // ─── estimateTokens ─────────────────────────────────────────────────────────

  describe('estimateTokens', () => {
    test('retorna 0 para string vazia, null ou undefined', () => {
      assert.equal(estimateTokens(''), 0);
      assert.equal(estimateTokens(null), 0);
      assert.equal(estimateTokens(undefined), 0);
    });

    test('retorna Math.ceil(chars / 4) para diferentes tamanhos', () => {
      assert.equal(estimateTokens('a'), 1);
      assert.equal(estimateTokens('abcd'), 1);
      assert.equal(estimateTokens('abcde'), 2);
      assert.equal(estimateTokens('12345678'), 2);
      assert.equal(estimateTokens('123456789'), 3);
      assert.equal(estimateTokens('a'.repeat(100)), 25);
    });
  });

  // ─── extractTokenUsage ──────────────────────────────────────────────────────

  describe('extractTokenUsage', () => {
    test('retorna zeros para array vazio ou inválido', () => {
      assert.deepEqual(extractTokenUsage([]), {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.deepEqual(extractTokenUsage(null as any), {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });
    });

    test('extrai uso a partir de usage_metadata (formato LangChain)', () => {
      const messages = [
        { role: 'user', content: 'Olá' },
        {
          role: 'assistant',
          content: 'Como posso ajudar?',
          usage_metadata: {
            input_tokens: 15,
            output_tokens: 8,
            total_tokens: 23,
          },
        },
      ];

      const usage = extractTokenUsage(messages);
      assert.equal(usage.promptTokens, 15);
      assert.equal(usage.completionTokens, 8);
      assert.equal(usage.totalTokens, 23);
    });

    test('extrai uso a partir de response_metadata.token_usage (formato OpenAI)', () => {
      const messages = [
        {
          role: 'assistant',
          content: 'Resposta 1',
          response_metadata: {
            token_usage: {
              prompt_tokens: 50,
              completion_tokens: 20,
              total_tokens: 70,
            },
          },
        },
      ];

      const usage = extractTokenUsage(messages);
      assert.equal(usage.promptTokens, 50);
      assert.equal(usage.completionTokens, 20);
      assert.equal(usage.totalTokens, 70);
    });

    test('acumula o uso de múltiplas chamadas LLM no mesmo trace', () => {
      const messages = [
        {
          usage_metadata: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
        },
        {
          response_metadata: {
            token_usage: { prompt_tokens: 80, completion_tokens: 30, total_tokens: 110 },
          },
        },
      ];

      const usage = extractTokenUsage(messages);
      assert.equal(usage.promptTokens, 180);
      assert.equal(usage.completionTokens, 50);
      assert.equal(usage.totalTokens, 230);
    });
  });

  // ─── calculateContextBreakdown ──────────────────────────────────────────────

  describe('calculateContextBreakdown', () => {
    test('calcula breakdown apenas com a mensagem do usuário', () => {
      const res = calculateContextBreakdown({
        userMessage: '12345678', // 8 chars = 2 tokens
      });

      assert.equal(res.userMessage, 2);
      assert.equal(res.history, 0);
      assert.equal(res.memories, 0);
      assert.equal(res.totalEstimated, 2);
    });

    test('inclui tokens de histórico da conversa', () => {
      const res = calculateContextBreakdown({
        userMessage: 'Olá', // 3 chars = 1 token
        history: [
          { role: 'user', content: 'Primeira mensagem' }, // "user: Primeira mensagem" (23 chars = 6 tokens)
          { role: 'assistant', content: 'Resposta curta' }, // "assistant: Resposta curta" (25 chars = 7 tokens)
        ],
      });

      assert.equal(res.userMessage, 1);
      assert.ok(res.history > 0);
      assert.equal(res.totalEstimated, res.userMessage + res.history);
    });

    test('inclui tokens de memórias semânticas e cabeçalho', () => {
      const res = calculateContextBreakdown({
        userMessage: 'Como me chamo?',
        memories: [
          { fact: 'O usuário se chama Thiago' },
          'O usuário é tech lead',
        ],
      });

      assert.ok(res.memories > 0);
      assert.equal(res.summary, 0);
      assert.equal(res.totalEstimated, res.userMessage + res.memories);
    });

    test('inclui tokens do resumo (summary) da conversa anterior', () => {
      const res = calculateContextBreakdown({
        userMessage: 'Qual o status?',
        summary: 'Decisão: fechar incidente INC-123. Pendência: revisar fila de mensagens.',
      });

      assert.ok(res.summary > 0);
      assert.equal(res.history, 0);
      assert.equal(res.memories, 0);
      assert.equal(res.totalEstimated, res.userMessage + res.summary);
    });
  });
});
