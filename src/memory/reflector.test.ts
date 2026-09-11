/**
 * Testes unitários do Refletor de Aprendizado.
 * 100% determinísticos — sem rede, com mock do modelo estruturado.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { reflectLearning, LearningSchema, type StructuredModel } from './reflector.js';

describe('Learning Reflector (reflectLearning)', () => {
  test('extrai fato durável legítimo quando o usuário expressa preferências ou identidade', async () => {
    const mockModel: StructuredModel = {
      withStructuredOutput: (_schema) => ({
        invoke: async (messages) => {
          const userContent = messages[1].content;
          if (userContent.includes('Thiago') && userContent.includes('auth')) {
            return {
              hasLearning: true,
              fact: 'O usuário se chama Thiago e é o responsável pelo microsserviço auth',
            };
          }
          return { hasLearning: false };
        },
      }),
    };

    const result = await reflectLearning(
      'me chame de Thiago e eu cuido do auth',
      mockModel
    );

    assert.equal(result.hasLearning, true);
    assert.equal(
      result.fact,
      'O usuário se chama Thiago e é o responsável pelo microsserviço auth'
    );
  });

  test('descarta pedidos operacionais pontuais (ordens imediatas)', async () => {
    const mockModel: StructuredModel = {
      withStructuredOutput: (_schema) => ({
        invoke: async (messages) => {
          const userContent = messages[1].content.toLowerCase();
          // Pedido pontual: simula o comportamento do LLM seguindo o system prompt
          if (userContent.includes('abra um low') || userContent.includes('liste os alertas')) {
            return { hasLearning: false };
          }
          return { hasLearning: false };
        },
      }),
    };

    const res1 = await reflectLearning('abra um incidente low no checkout', mockModel);
    assert.equal(res1.hasLearning, false);
    assert.equal(res1.fact, undefined);

    const res2 = await reflectLearning('liste os alertas firing agora', mockModel);
    assert.equal(res2.hasLearning, false);
    assert.equal(res2.fact, undefined);
  });

  test('descarta estritamente credenciais, senhas e tokens de API', async () => {
    const mockModel: StructuredModel = {
      withStructuredOutput: (_schema) => ({
        invoke: async (messages) => {
          const userContent = messages[1].content;
          if (userContent.includes('sk-proj') || userContent.includes('secret_key')) {
            return { hasLearning: false };
          }
          return { hasLearning: false };
        },
      }),
    };

    const result = await reflectLearning(
      'minha chave de API é sk-proj-9999999999',
      mockModel
    );

    assert.equal(result.hasLearning, false);
    assert.equal(result.fact, undefined);
  });

  test('trata respostas com fact vazio ou whitespace como hasLearning: false', async () => {
    const mockModel: StructuredModel = {
      withStructuredOutput: (_schema) => ({
        invoke: async () => ({
          hasLearning: true,
          fact: '   ',
        }),
      }),
    };

    const result = await reflectLearning('teste de retorno em branco', mockModel);
    assert.equal(result.hasLearning, false);
    assert.equal(result.fact, undefined);
  });
});
