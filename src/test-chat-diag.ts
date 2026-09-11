import { createServer } from './http/server.js';
import { sqliteConversationStore } from './store/sqlite-conversation-store.js';
import { sqliteMemoryStore } from './memory/memory-store.js';
import { HistorySummarizer } from './context/summarizer.js';

async function main() {
  const summarizer = new HistorySummarizer({ store: sqliteConversationStore });
  const app = createServer({
    conversationStore: sqliteConversationStore,
    memoryStore: sqliteMemoryStore,
    summarizer,
    timeoutMs: 120000,
  });

  const server = app.listen(3003, async () => {
    try {
      console.log('--- ENVIANDO REQUEST /chat ---');
      const start = Date.now();
      const res = await fetch('http://localhost:3003/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Organize meu plantão', userId: 'u-42' }),
      });
      const elapsed = Date.now() - start;
      console.log(`--- RESPOSTA RECEBIDA (${elapsed}ms) - STATUS: ${res.status} ---`);
      const body = await res.text();
      console.log('CORPO:', body);
    } catch (e) {
      console.error('ERRO NO FETCH:', e);
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
