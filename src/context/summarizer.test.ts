/**
 * Testes unitários para HistorySummarizer com FakeSummarizer.
 * 100% determinísticos — sem rede, sem LLM real.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SqliteConversationStore } from '../store/sqlite-conversation-store.js';
import {
  HistorySummarizer,
  FakeSummarizer,
  SummarizeEvent,
  SUMMARIZER_PROMPT,
} from './summarizer.js';

describe('HistorySummarizer (src/context/summarizer.ts)', () => {
  let db: DatabaseSync;
  let store: SqliteConversationStore;
  let fakeClient: FakeSummarizer;
  let summarizer: HistorySummarizer;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    store = new SqliteConversationStore(db);
    fakeClient = new FakeSummarizer();
    summarizer = new HistorySummarizer({
      store,
      client: fakeClient,
    });
  });

  test('não sumariza em conversas com até 8 mensagens (janela recente)', async () => {
    const convId = store.create();
    for (let i = 1; i <= 8; i++) {
      store.append(convId, i % 2 === 1 ? 'user' : 'assistant', `Mensagem ${i}`);
    }

    let eventEmitted = false;
    summarizer.on('summarize', () => {
      eventEmitted = true;
    });

    const res = await summarizer.checkAndSummarize(convId);

    assert.equal(res, null);
    assert.equal(fakeClient.callCount, 0, 'não deve chamar o sumarizador');
    assert.equal(eventEmitted, false, 'não deve emitir evento summarize');
  });

  test('não sumariza quando saíram menos de 8 mensagens da janela recente (ex: 15 mensagens no total)', async () => {
    const convId = store.create();
    for (let i = 1; i <= 15; i++) {
      store.append(convId, i % 2 === 1 ? 'user' : 'assistant', `Mensagem ${i}`);
    }

    let eventEmitted = false;
    summarizer.on('summarize', () => {
      eventEmitted = true;
    });

    const res = await summarizer.checkAndSummarize(convId);

    assert.equal(res, null);
    assert.equal(fakeClient.callCount, 0, 'não deve chamar para 7 mensagens podadas');
    assert.equal(eventEmitted, false);
  });

  test('dispara sumarização e emite evento quando exatamente 8 mensagens saem da janela (16 mensagens no total)', async () => {
    const convId = store.create();
    for (let i = 1; i <= 16; i++) {
      store.append(convId, i % 2 === 1 ? 'user' : 'assistant', `Conteúdo da msg ${i}`);
    }

    let capturedEvent: SummarizeEvent | null = null;
    summarizer.on('summarize', (event) => {
      capturedEvent = event;
    });

    const res = await summarizer.checkAndSummarize(convId);

    assert.ok(res);
    assert.equal(res.conversation_id, convId);
    assert.equal(res.summarized_messages_count, 8);
    assert.match(res.summary, /Resumo fake #1/);

    // Verifica chamada ao FakeSummarizer
    assert.equal(fakeClient.callCount, 1);
    assert.equal(fakeClient.calls[0].systemInstruction, SUMMARIZER_PROMPT);
    assert.ok(fakeClient.calls[0].input.includes('Conteúdo da msg 1'));
    assert.ok(fakeClient.calls[0].input.includes('Conteúdo da msg 8'));
    assert.ok(!fakeClient.calls[0].input.includes('Conteúdo da msg 9'));

    // Verifica evento emitido
    assert.ok(capturedEvent);
    const event: SummarizeEvent = capturedEvent;
    assert.equal(event.conversationId, convId);
    assert.equal(event.oldSummary, null);
    assert.equal(event.messagesSummarized, 8);
    assert.equal(event.totalMessages, 16);
  });

  test('não refaz a cada request subsequente se não saíram 8 novas mensagens (ex: turnos intermediários 17 a 23)', async () => {
    const convId = store.create();
    for (let i = 1; i <= 16; i++) {
      store.append(convId, i % 2 === 1 ? 'user' : 'assistant', `Msg ${i}`);
    }

    // Primeiro disparo (com 16 msgs)
    await summarizer.checkAndSummarize(convId);
    assert.equal(fakeClient.callCount, 1);

    // Adiciona mais mensagens (total 22 msgs = 14 fora da janela, 8 já sumarizadas, pendentes = 6 < 8)
    for (let i = 17; i <= 22; i++) {
      store.append(convId, i % 2 === 1 ? 'user' : 'assistant', `Msg ${i}`);
    }

    let eventEmitted = false;
    summarizer.on('summarize', () => {
      eventEmitted = true;
    });

    const res = await summarizer.checkAndSummarize(convId);

    // Deve retornar o resumo já gravado sem disparar LLM nem emitir evento
    assert.ok(res);
    assert.equal(res.summarized_messages_count, 8);
    assert.equal(fakeClient.callCount, 1, 'chamadas não devem ter aumentado');
    assert.equal(eventEmitted, false, 'não deve reemitir evento');
  });

  test('dispara segundo ciclo quando mais 8 mensagens saem da janela (24 mensagens), mesclando ao resumo anterior', async () => {
    const convId = store.create();

    // Cria 16 mensagens
    for (let i = 1; i <= 16; i++) {
      store.append(convId, i % 2 === 1 ? 'user' : 'assistant', `Msg ${i}`);
    }

    // 1º resumo
    await summarizer.checkAndSummarize(convId);
    assert.equal(fakeClient.callCount, 1);

    // Adiciona mais 8 mensagens (total 24 mensagens -> 16 fora da janela, 8 já sumarizadas, pendentes = 8)
    for (let i = 17; i <= 24; i++) {
      store.append(convId, i % 2 === 1 ? 'user' : 'assistant', `Msg ${i}`);
    }

    const events: SummarizeEvent[] = [];
    summarizer.on('summarize', (event) => {
      events.push(event);
    });

    const res = await summarizer.checkAndSummarize(convId);

    assert.ok(res);
    assert.equal(res.summarized_messages_count, 16);
    assert.equal(fakeClient.callCount, 2);

    // O input do 2º resumo deve conter o resumo anterior E as novas mensagens (9 a 16)
    const secondCallInput = fakeClient.calls[1].input;
    assert.ok(secondCallInput.includes('Resumo anterior:'));
    assert.ok(secondCallInput.includes('Resumo fake #1'));
    assert.ok(secondCallInput.includes('Novas mensagens a incorporar:'));
    assert.ok(secondCallInput.includes('Msg 9'));
    assert.ok(secondCallInput.includes('Msg 16'));

    // Verifica evento do 2º ciclo
    assert.equal(events.length, 1);
    assert.equal(events[0].conversationId, convId);
    assert.ok(events[0].oldSummary?.includes('Resumo fake #1'));
    assert.ok(events[0].newSummary.includes('Resumo fake #2'));
    assert.equal(events[0].messagesSummarized, 8);
    assert.equal(events[0].totalMessages, 24);
  });
});
