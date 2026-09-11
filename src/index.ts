import { createServer } from './http/server.js';
import { sqliteConversationStore } from './store/sqlite-conversation-store.js';
import { sqliteTraceStore } from './store/sqlite-trace-store.js';
import { sqliteMemoryStore } from './memory/memory-store.js';
import { HistorySummarizer } from './context/summarizer.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const summarizer = new HistorySummarizer({ store: sqliteConversationStore });

const app = createServer({
  conversationStore: sqliteConversationStore,
  memoryStore: sqliteMemoryStore,
  traceStore: sqliteTraceStore,
  summarizer,
});

app.listen(PORT, () => {
  console.log(`🚀 OpsPilot HTTP Server rodando em http://localhost:${PORT}`);
  console.log(`📡 Endpoint de chat: POST http://localhost:${PORT}/chat`);
  console.log(`🔍 Endpoint de auditoria: GET http://localhost:${PORT}/requests/:id`);
});

