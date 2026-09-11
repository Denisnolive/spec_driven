/**
 * Testes unitários do SqliteMemoryStore e busca semântica em :memory:.
 * Valida persistência de embeddings em BLOB, deduplicação (> 0.92),
 * forget com isolamento de usuário e recall sem palavras em comum.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SqliteMemoryStore } from './memory-store.js';
import { embed, dot } from './embeddings.js';

describe('SqliteMemoryStore (:memory:)', () => {
  let db: DatabaseSync;
  let store: SqliteMemoryStore;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    store = new SqliteMemoryStore(db);
  });

  describe('remember() e persistência em BLOB', () => {
    test('persiste fato e embedding em BLOB com Float32Array íntegro', async () => {
      const fact = 'Thiago é o engenheiro responsável pelo serviço auth';
      const result = await store.remember('user-1', fact);

      assert.equal(result.isNew, true);
      assert.equal(result.memory.user_id, 'user-1');
      assert.equal(result.memory.fact, fact);
      assert.equal(result.memory.embedding.length, 384);
      assert.ok(result.memory.id > 0);

      // Valida recuperação direta do banco
      const list = await store.list('user-1');
      assert.equal(list.length, 1);
      assert.equal(list[0].fact, fact);
      assert.equal(list[0].embedding.length, 384);

      // O produto escalar do embedding salvo com ele mesmo deve ser ~1.0 (vetor unitário)
      const selfDot = dot(result.memory.embedding, list[0].embedding);
      assert.ok(Math.abs(selfDot - 1.0) < 1e-4, `Auto-similaridade esperada ~1.0, obteve ${selfDot}`);
    });

    test('deduplicação semântica descarta fatos com similaridade > 0.92', async () => {
      const fact1 = 'Adoro café preto sem açúcar pelas manhãs';
      const fact2 = 'Eu adoro café preto sem açúcar pela manhã';

      const res1 = await store.remember('user-1', fact1);
      assert.equal(res1.isNew, true);

      // Inserção de frase quase idêntica semanticamente
      const res2 = await store.remember('user-1', fact2);
      assert.equal(res2.isNew, false);
      assert.equal(res2.memory.id, res1.memory.id);

      // Confirma que não duplicou na base
      const all = await store.list('user-1');
      assert.equal(all.length, 1);
    });

    test('permite fatos com similaridade > 0.92 para usuários diferentes', async () => {
      const fact = 'Prefiro trabalhar com Node.js e TypeScript';
      const res1 = await store.remember('user-1', fact);
      const res2 = await store.remember('user-2', fact);

      assert.equal(res1.isNew, true);
      assert.equal(res2.isNew, true);
      assert.notEqual(res1.memory.user_id, res2.memory.user_id);
    });
  });

  describe('forget() e isolamento de usuário', () => {
    test('remove memória pertencente ao usuário', async () => {
      const res = await store.remember('user-1', 'Usa teclado mecânico');
      const removed = await store.forget('user-1', res.memory.id);

      assert.equal(removed, true);
      const list = await store.list('user-1');
      assert.equal(list.length, 0);
    });

    test('retorna false ao tentar apagar memória pertencente a outro usuário', async () => {
      const res = await store.remember('user-1', 'Dado confidencial do user 1');
      const removed = await store.forget('user-2', res.memory.id);

      assert.equal(removed, false);
      const list = await store.list('user-1');
      assert.equal(list.length, 1);
    });
  });

  describe('recall() e busca semântica', () => {
    test('recall acha fato sem palavra em comum', async () => {
      // Fato não compartilha nenhuma palavra com a pergunta:
      // Fato: "o carro precisa trocar os pneus e o óleo"
      // Query: "quando devemos fazer a manutenção do veículo?"
      // Tokens do fato: ['o', 'carro', 'precisa', 'trocar', 'os', 'pneus', 'e', 'óleo']
      // Tokens da query: ['quando', 'devemos', 'fazer', 'a', 'manutenção', 'do', 'veículo']
      // Interseção = {}
      const fact = 'o carro precisa trocar os pneus e o óleo';
      const query = 'quando devemos fazer a manutenção do veículo?';

      await store.remember('user-1', fact);
      await store.remember('user-1', 'o servidor web utiliza nodejs com express');
      await store.remember('user-1', 'previsão do tempo indica chuva amanhã');

      // Validação estrita de que não há palavras em comum entre o fato e a query
      const factWords = new Set(fact.toLowerCase().replace(/[?.,]/g, '').split(/\s+/));
      const queryWords = new Set(query.toLowerCase().replace(/[?.,]/g, '').split(/\s+/));
      const commonWords = [...factWords].filter((w) => queryWords.has(w));
      assert.deepEqual(commonWords, [], 'Teste deve garantir zero palavras em comum entre fato e query');

      const results = await store.recall('user-1', query, 3);

      assert.ok(results.length >= 1, 'Deveria encontrar ao menos uma memória relevante');
      assert.equal(results[0].fact, fact);
      assert.ok(results[0].score > 0.3, `Score esperado > 0.3, obteve ${results[0].score}`);
    });

    test('respeita o threshold de relevância mínima (> 0.3) e top k ordenado', async () => {
      await store.remember('user-1', 'Gosto de programar em Python');
      await store.remember('user-1', 'Gosto de desenvolver em JavaScript');
      await store.remember('user-1', 'Gosto de codificar em Rust');
      await store.remember('user-1', 'Receita de bolo de chocolate com morango');

      const results = await store.recall('user-1', 'linguagens de programação favoritas', 2);

      assert.equal(results.length, 2, 'Deve limitar ao top-2 especificado');
      assert.ok(results[0].score >= results[1].score, 'Deve estar ordenado por score decrescente');
      assert.ok(results.every((r) => r.score > 0.3), 'Todos devem ter score > 0.3');
      assert.ok(!results.some((r) => r.fact.includes('bolo')), 'Não deve incluir bolo de chocolate');
    });

    test('retorna array vazio quando nenhuma memória atinge score > 0.3', async () => {
      await store.remember('user-1', 'A Terra orbita ao redor do Sol');

      const results = await store.recall('user-1', 'como consertar um pneu furado de bicicleta', 3);
      assert.equal(results.length, 0);
    });

    test('isola recall entre usuários diferentes', async () => {
      await store.remember('user-1', 'O servidor de autenticação caiu');
      await store.remember('user-2', 'O servidor de pagamentos está estável');

      const results = await store.recall('user-1', 'como está a autenticação?', 3);
      assert.equal(results.length, 1);
      assert.equal(results[0].fact, 'O servidor de autenticação caiu');
    });
  });
});
