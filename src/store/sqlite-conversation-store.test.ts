/**
 * Testes do SqliteConversationStore em :memory:.
 * 100% determinísticos — sem rede, sem LLM.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SqliteConversationStore } from './sqlite-conversation-store.js';

describe('SqliteConversationStore (:memory:)', () => {
  let db: DatabaseSync;
  let store: SqliteConversationStore;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    store = new SqliteConversationStore(db);
  });

  // ─── create() e exists() ─────────────────────────────────────────────────

  describe('create() e exists()', () => {
    test('create() retorna UUIDv4 válido e exists() confirma', () => {
      const id = store.create();

      // UUIDv4: 8-4-4-4-12 hexadecimal
      assert.match(
        id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        'deve ser UUIDv4 válido'
      );
      assert.ok(store.exists(id), 'conversa deve existir após create()');
    });

    test('exists() retorna false para UUID inexistente', () => {
      assert.equal(
        store.exists('00000000-0000-4000-a000-000000000000'),
        false
      );
    });

    test('IDs gerados são únicos', () => {
      const id1 = store.create();
      const id2 = store.create();
      assert.notEqual(id1, id2, 'IDs devem ser diferentes');
    });
  });

  // ─── append() ────────────────────────────────────────────────────────────

  describe('append()', () => {
    test('persiste mensagem e retorna MessageData completo', () => {
      const convId = store.create();
      const msg = store.append(convId, 'user', 'Olá, OpsPilot!');

      assert.ok(typeof msg.id === 'number' && msg.id > 0);
      assert.equal(msg.conversation_id, convId);
      assert.equal(msg.role, 'user');
      assert.equal(msg.content, 'Olá, OpsPilot!');
      assert.ok(msg.created_at, 'deve ter created_at preenchido');
    });

    test('persiste mensagem assistant', () => {
      const convId = store.create();
      const msg = store.append(convId, 'assistant', 'Estou aqui para ajudar.');

      assert.equal(msg.role, 'assistant');
      assert.equal(msg.content, 'Estou aqui para ajudar.');
    });

    test('lança erro de FOREIGN KEY para conversationId inexistente', () => {
      assert.throws(
        () => store.append('inexistente-id', 'user', 'Teste'),
        /FOREIGN KEY constraint failed/i
      );
    });

    test('lança erro de CHECK para role inválido', () => {
      const convId = store.create();
      assert.throws(
        () =>
          store.append(
            convId,
            'system' as unknown as 'user',
            'Teste role inválido'
          ),
        /CHECK constraint failed/i
      );
    });
  });

  // ─── lastMessages() ──────────────────────────────────────────────────────

  describe('lastMessages()', () => {
    test('retorna mensagens em ordem cronológica (ASC por id)', () => {
      const convId = store.create();
      store.append(convId, 'user', 'msg 1');
      store.append(convId, 'assistant', 'msg 2');
      store.append(convId, 'user', 'msg 3');

      const msgs = store.lastMessages(convId, 10);
      assert.equal(msgs.length, 3);
      assert.equal(msgs[0].content, 'msg 1');
      assert.equal(msgs[1].content, 'msg 2');
      assert.equal(msgs[2].content, 'msg 3');
      assert.ok(msgs[0].id < msgs[1].id && msgs[1].id < msgs[2].id);
    });

    test('limita a N mensagens mais recentes', () => {
      const convId = store.create();
      for (let i = 1; i <= 15; i++) {
        store.append(convId, i % 2 === 1 ? 'user' : 'assistant', `msg ${i}`);
      }

      const msgs = store.lastMessages(convId, 12);
      assert.equal(msgs.length, 12, 'deve retornar exatamente 12');
      assert.equal(
        msgs[0].content,
        'msg 4',
        'primeira mensagem deve ser a 4ª (15-12+1)'
      );
      assert.equal(msgs[11].content, 'msg 15', 'última deve ser a 15ª');
    });

    test('retorna array vazio para conversa sem mensagens', () => {
      const convId = store.create();
      const msgs = store.lastMessages(convId, 12);
      assert.deepEqual(msgs, []);
    });

    test('não retorna mensagens de outra conversa', () => {
      const conv1 = store.create();
      const conv2 = store.create();

      store.append(conv1, 'user', 'Conv 1 msg');
      store.append(conv2, 'user', 'Conv 2 msg');

      const msgs1 = store.lastMessages(conv1, 10);
      assert.equal(msgs1.length, 1);
      assert.equal(msgs1[0].content, 'Conv 1 msg');

      const msgs2 = store.lastMessages(conv2, 10);
      assert.equal(msgs2.length, 1);
      assert.equal(msgs2[0].content, 'Conv 2 msg');
    });
  });

  // ─── conversation_summaries e paginação ──────────────────────────────────

  describe('conversation_summaries e paginação', () => {
    test('countMessages() e getMessagesRange() contam e paginam corretamente', () => {
      const convId = store.create();
      assert.equal(store.countMessages(convId), 0);

      for (let i = 1; i <= 10; i++) {
        store.append(convId, i % 2 === 1 ? 'user' : 'assistant', `m-${i}`);
      }

      assert.equal(store.countMessages(convId), 10);

      const page1 = store.getMessagesRange(convId, 0, 4);
      assert.equal(page1.length, 4);
      assert.equal(page1[0].content, 'm-1');
      assert.equal(page1[3].content, 'm-4');

      const page2 = store.getMessagesRange(convId, 4, 4);
      assert.equal(page2.length, 4);
      assert.equal(page2[0].content, 'm-5');
      assert.equal(page2[3].content, 'm-8');
    });

    test('getSummary() retorna null quando não há resumo salvo', () => {
      const convId = store.create();
      assert.equal(store.getSummary(convId), null);
    });

    test('saveSummary() e getSummary() gravam e recuperam o resumo com upsert', () => {
      const convId = store.create();
      store.saveSummary(convId, 'Resumo inicial das 8 mensagens', 8);

      const summary1 = store.getSummary(convId);
      assert.ok(summary1);
      assert.equal(summary1.conversation_id, convId);
      assert.equal(summary1.summary, 'Resumo inicial das 8 mensagens');
      assert.equal(summary1.summarized_messages_count, 8);
      assert.ok(summary1.updated_at);

      // Upsert: atualiza o resumo existente
      store.saveSummary(convId, 'Resumo mesclado das 16 mensagens', 16);
      const summary2 = store.getSummary(convId);
      assert.ok(summary2);
      assert.equal(summary2.summary, 'Resumo mesclado das 16 mensagens');
      assert.equal(summary2.summarized_messages_count, 16);
    });
  });
});
