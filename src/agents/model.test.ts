/**
 * Testes unitários para a fábrica de modelos resilientes (createModel).
 * 100% determinísticos — sem chamadas de rede externas, utilizando FakeListChatModel.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import {
  createModel,
  runWithModelContext,
  isModelUnavailableError,
  ModelUnavailableError,
} from './model.js';

describe('Resiliência de Modelo — createModel', () => {
  test('User Story 1: Sucesso no primário sem acionamento de fallback', async () => {
    const primary = new FakeListChatModel({ responses: ['Resposta do Primário'] });
    const fallback = new FakeListChatModel({ responses: ['Resposta do Fallback'] });

    const model = createModel({
      primary,
      fallback,
      primaryName: 'test/primary-model',
      fallbackName: 'test/fallback-model',
    });

    const execution = await runWithModelContext(async () => {
      return await model.invoke('Mensagem de teste');
    });

    assert.equal((execution.result as any).content, 'Resposta do Primário');
    assert.equal(execution.modelUsed, 'test/primary-model');
    assert.equal(execution.events.length, 0, 'Não deve emitir evento de fallback quando primário responde');
  });

  test('User Story 1: Sucesso após retry transitório no primário', async () => {
    let attempts = 0;
    const primary = new FakeListChatModel({ responses: ['Recuperado no retry'] });
    const originalInvoke = primary.invoke.bind(primary);
    primary.invoke = async (input: any, options: any) => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Erro transitório 429');
      }
      return originalInvoke(input, options);
    };

    const fallback = new FakeListChatModel({ responses: ['Resposta do Fallback'] });

    const model = createModel({
      primary,
      fallback,
      primaryName: 'test/primary-model',
      fallbackName: 'test/fallback-model',
      stopAfterAttempt: 2,
    });

    const execution = await runWithModelContext(async () => {
      return await model.invoke('Teste com retry');
    });

    assert.equal((execution.result as any).content, 'Recuperado no retry');
    assert.equal(execution.modelUsed, 'test/primary-model');
    assert.equal(execution.events.length, 0, 'Retry bem-sucedido no primário não deve gerar evento fallback');
    assert.equal(attempts, 2);
  });

  test('User Story 2: Failover para reserva com evento fallback no trace e metrics.modelUsed', async () => {
    const primary = new FakeListChatModel({ responses: [] });
    primary.invoke = async () => {
      throw new Error('Quota de requisições esgotada no primário');
    };

    const fallback = new FakeListChatModel({ responses: ['Resposta gerada pelo Fallback'] });

    const model = createModel({
      primary,
      fallback,
      primaryName: 'openrouter/free',
      fallbackName: 'openrouter/deepseek-r1:free',
    });

    const execution = await runWithModelContext(
      async () => {
        return await model.invoke('Qual o status do serviço?');
      },
      { currentNode: 'roteador' }
    );

    assert.equal((execution.result as any).content, 'Resposta gerada pelo Fallback');
    assert.equal(execution.modelUsed, 'openrouter/deepseek-r1:free');
    assert.equal(execution.events.length, 1, 'Deve emitir exatamente 1 evento fallback');

    const fallbackEvent = execution.events[0];
    assert.equal(fallbackEvent.kind, 'fallback');
    assert.equal(fallbackEvent.node, 'roteador');
    assert.equal(fallbackEvent.fromModel, 'openrouter/free');
    assert.equal(fallbackEvent.toModel, 'openrouter/deepseek-r1:free');
    assert.ok(fallbackEvent.error?.includes('Quota de requisições esgotada'));
    assert.ok(typeof fallbackEvent.content === 'string');
  });

  test('User Story 3: Caso nada funcione, lança ModelUnavailableError com statusCode 503', async () => {
    const primary = new FakeListChatModel({ responses: [] });
    primary.invoke = async () => {
      throw new Error('Primário offline 500');
    };

    const fallback = new FakeListChatModel({ responses: [] });
    fallback.invoke = async () => {
      throw new Error('Reserva offline 503');
    };

    const model = createModel({
      primary,
      fallback,
      primaryName: 'openrouter/free',
      fallbackName: 'openrouter/deepseek-r1:free',
    });

    await assert.rejects(
      async () => {
        await model.invoke('Teste de falha total');
      },
      (err: unknown) => {
        assert.ok(isModelUnavailableError(err));
        assert.ok(err instanceof ModelUnavailableError);
        assert.equal(err.statusCode, 503);
        assert.equal(err.primaryModel, 'openrouter/free');
        assert.equal(err.fallbackModel, 'openrouter/deepseek-r1:free');
        return true;
      }
    );
  });

  test('User Story 4: withStructuredOutput com fallback automático', async () => {
    const routeSchema = z.object({
      route: z.enum(['react', 'planExecute', 'reflect']),
      reason: z.string(),
    });

    const primary = {
      invoke: async () => {
        throw new Error('Primary invoke failed');
      },
      withStructuredOutput: () => ({
        invoke: async () => {
          throw new Error('Primary structured output failed');
        },
      }),
    };

    const fallback = {
      invoke: async () => ({
        route: 'react',
        reason: 'Decidido pelo fallback após falha',
      }),
      withStructuredOutput: () => ({
        invoke: async () => ({
          route: 'react',
          reason: 'Decidido pelo fallback após falha',
        }),
      }),
    };

    const model = createModel({
      primary,
      fallback,
      primaryName: 'primary-model',
      fallbackName: 'fallback-model',
    });

    const structured = model.withStructuredOutput(routeSchema);

    const execution = await runWithModelContext(async () => {
      return await structured.invoke('Como está o banco de dados?');
    });

    assert.deepEqual(execution.result, {
      route: 'react',
      reason: 'Decidido pelo fallback após falha',
    });
    assert.equal(execution.modelUsed, 'fallback-model');
    assert.equal(execution.events.length, 1);
    assert.equal(execution.events[0].kind, 'fallback');
  });

  test('User Story 4: bindTools com fallback automático', async () => {
    const dummyTool = {
      name: 'dummy_tool',
      description: 'A dummy tool',
      schema: z.object({}),
    };

    const primary = {
      invoke: async () => {
        throw new Error('Primary invoke failed');
      },
      bindTools: () => ({
        invoke: async () => {
          throw new Error('Primary bindTools failed');
        },
      }),
    };

    const fallback = {
      invoke: async () => ({
        content: 'Ferramenta executada pelo fallback',
      }),
      bindTools: () => ({
        invoke: async () => ({
          content: 'Ferramenta executada pelo fallback',
        }),
      }),
    };

    const model = createModel({
      primary,
      fallback,
      primaryName: 'primary-model',
      fallbackName: 'fallback-model',
    });

    const bound = model.bindTools([dummyTool]);

    const execution = await runWithModelContext(async () => {
      return await bound.invoke('Executar ferramenta');
    });

    assert.equal((execution.result as any).content, 'Ferramenta executada pelo fallback');
    assert.equal(execution.modelUsed, 'fallback-model');
    assert.equal(execution.events.length, 1);
  });
});
