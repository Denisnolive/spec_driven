# Data Model & Contracts: Relatório de Incidentes Abertos

**Feature**: `016-open-incidents-report`  
**Date**: 2026-09-11  

---

## 1. Schemas e Tipos (Zod + TypeScript)

### 1.1. Entrada: Incidente Operacional
```typescript
import { z } from 'zod';

export const incidentSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type IncidentSeverity = z.infer<typeof incidentSeveritySchema>;

export const incidentStatusSchema = z.enum(['open', 'resolved']);
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;

export const incidentItemSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  service: z.string().min(1),
  severity: incidentSeveritySchema,
  status: incidentStatusSchema,
  resolved_at: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  created_at: z.string().min(1),
});

export type IncidentItem = z.infer<typeof incidentItemSchema>;
```

### 1.2. Estrutura Intermediária de Análise
```typescript
export interface IncidentReportSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface DuplicateSuspect {
  idA: number;
  idB: number;
  service: string;
  similarityScore: number;
}

export interface ImmediateActionItem {
  id: number;
  service: string;
  reason: string;
}

export interface FormattedIncidentReport {
  summary: IncidentReportSummary;
  sortedIncidents: IncidentItem[];
  duplicates: DuplicateSuspect[];
  immediateActions: ImmediateActionItem[];
  markdown: string;
}
```

---

## 2. Contrato da Função de Serviço

```typescript
/**
 * Formata um conjunto de incidentes abertos no relatório em blocos padronizado.
 *
 * @param incidents Lista de incidentes abertos
 * @returns Relatório formatado em blocos markdown, métricas e análises
 */
export function formatOpenIncidentsReport(
  incidents: IncidentItem[]
): FormattedIncidentReport;
```

---

## 3. Template de Saída em Texto/Markdown

```text
## Incidentes abertos em produção
Total: {N} | Critical: {X} | High: {X} | Medium: {X} | Low: {X}

{EMOJI} **#{ID} · {SEVERIDADE}** — {SERVIÇO}
{TÍTULO}
Criado em: {DATA/HORA}

{EMOJI} **#{ID} · {SEVERIDADE}** — {SERVIÇO}
{TÍTULO}
Criado em: {DATA/HORA}

...

[Seção condicional de duplicidades se houver]
⚠️ Possível duplicidade: #{ID_A} e #{ID_B} ({SERVIÇO}) — sintomas semelhantes.

[Seção condicional de ação imediata para Critical e High]
### Ação imediata
- #{ID} ({SERVIÇO}) — {motivo em uma linha}
```
