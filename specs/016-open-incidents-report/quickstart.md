# Quickstart: Validação do Relatório de Incidentes Abertos

**Feature**: `016-open-incidents-report`  
**Date**: 2026-09-11  

---

## 1. Executando os Testes Automatizados

Para validar a formatação em blocos, ordenação, ausência de tabelas markdown, cálculo de contagens e detecção de duplicidades:

```bash
# Executar todos os testes unitários do serviço de relatório
node --import tsx --test src/services/incident-reporter.test.ts

# Verificação estrita de tipagem TypeScript
npm run typecheck
```

---

## 2. Testando Diretamente via CLI ou Script de Diagnóstico

Você pode testar a geração do relatório com os dados reais do banco SQLite (`data/opspilot.db`):

```bash
node --env-file=.env --import tsx -e "
import { store } from './src/agents/ops-store.js';
import { formatOpenIncidentsReport } from './src/services/incident-reporter.js';

async function run() {
  const incidents = await store.listIncidents('open');
  const report = formatOpenIncidentsReport(incidents);
  console.log(report.markdown);
}
run();
"
```

---

## 3. Critérios Visuais de Validação

1. **Sem tabelas**: Certifique-se de que não há nenhum caractere `|` formando grades ou cabeçalhos de tabela (`| --- |`).
2. **Blocos limpos**: Cada incidente possui uma quebra de linha dupla (`\n\n`) separando-o do bloco vizinho.
3. **Emojis corretos**:
   - `🔴 CRITICAL`
   - `🟠 HIGH`
   - `🟡 MEDIUM`
   - `⚪ LOW`
4. **Contagem no cabeçalho**: Confere exatamente com a soma e contagem de itens listados.
5. **Seção de Ação imediata**: Lista apenas os incidentes `🔴 CRITICAL` e `🟠 HIGH`.
