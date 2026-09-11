import { z } from 'zod';

// ─── Schemas Zod e Tipos ──────────────────────────────────────────────────────

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
  reason: string;
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

// ─── Constantes Visuais e Mapeamentos ─────────────────────────────────────────

export const SEVERITY_EMOJIS: Record<IncidentSeverity, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '⚪',
};

export const SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

export const SEVERITY_WEIGHTS: Record<IncidentSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

// ─── Funções Puras de Auxílio ─────────────────────────────────────────────────

/**
 * Ordena incidentes decrescentemente por severidade e, em desempate, pelo mais recente primeiro.
 */
export function sortIncidents(incidents: IncidentItem[]): IncidentItem[] {
  return [...incidents].sort((a, b) => {
    const weightDiff = SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity];
    if (weightDiff !== 0) {
      return weightDiff;
    }

    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeB !== timeA) {
      return timeB - timeA;
    }

    return b.id - a.id;
  });
}

/**
 * Calcula métricas quantitativas totais e por severidade.
 */
export function computeReportSummary(incidents: IncidentItem[]): IncidentReportSummary {
  const summary: IncidentReportSummary = {
    total: incidents.length,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const inc of incidents) {
    if (inc.severity === 'critical') summary.critical++;
    else if (inc.severity === 'high') summary.high++;
    else if (inc.severity === 'medium') summary.medium++;
    else if (inc.severity === 'low') summary.low++;
  }

  return summary;
}

/**
 * Renderiza um único incidente no template padronizado de bloco.
 */
export function formatIncidentBlock(inc: IncidentItem): string {
  const emoji = SEVERITY_EMOJIS[inc.severity];
  const severityLabel = SEVERITY_LABELS[inc.severity];
  return `${emoji} **#${inc.id} · ${severityLabel}** — ${inc.service}\n${inc.title}\nCriado em: ${inc.created_at}`;
}

/**
 * Normaliza e tokeniza um texto para comparação de similaridade semântica.
 */
function tokenizeText(text: string): Set<string> {
  const stopWords = new Set([
    'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
    'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'sem', 'e', 'ou', 'se',
    'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'and', 'or',
    'servico', 'service', 'incidente', 'incident', 'problema', 'issue', 'teste', 'test'
  ]);

  const clean = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');

  const tokens = clean
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !stopWords.has(t));

  return new Set(tokens);
}

/**
 * Calcula a similaridade de Jaccard entre dois conjuntos de tokens.
 */
function calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionCount++;
    }
  }
  const unionSize = new Set([...setA, ...setB]).size;
  return unionSize === 0 ? 0 : intersectionCount / unionSize;
}

/**
 * Identifica suspeitas de duplicidade entre incidentes do mesmo serviço com sintomas similares.
 */
export function detectDuplicates(incidents: IncidentItem[]): DuplicateSuspect[] {
  const suspects: DuplicateSuspect[] = [];
  const seenPairs = new Set<string>();

  // Agrupa incidentes por serviço normalizado
  const byService = new Map<string, IncidentItem[]>();
  for (const inc of incidents) {
    const srvKey = inc.service.trim().toLowerCase();
    const list = byService.get(srvKey) ?? [];
    list.push(inc);
    byService.set(srvKey, list);
  }

  for (const [srvKey, serviceIncidents] of byService.entries()) {
    if (serviceIncidents.length < 2) continue;

    for (let i = 0; i < serviceIncidents.length; i++) {
      for (let j = i + 1; j < serviceIncidents.length; j++) {
        const incA = serviceIncidents[i];
        const incB = serviceIncidents[j];

        const pairKey = `${Math.min(incA.id, incB.id)}-${Math.max(incA.id, incB.id)}`;
        if (seenPairs.has(pairKey)) continue;

        const tokensA = tokenizeText(incA.title);
        const tokensB = tokenizeText(incB.title);

        const similarity = calculateJaccardSimilarity(tokensA, tokensB);

        // Se ambos compartilham termos críticos ou têm similaridade >= 0.25
        const hasCommonKeyTerms =
          (tokensA.has('checkout') && tokensB.has('checkout')) ||
          (tokensA.has('latencia') && tokensB.has('latencia')) ||
          (tokensA.has('latency') && (tokensB.has('latencia') || tokensB.has('latency'))) ||
          (tokensA.has('p99') && tokensB.has('p99')) ||
          (tokensA.has('notificacao') && tokensB.has('notificacao')) ||
          (tokensA.has('notificacoes') && tokensB.has('notificacoes')) ||
          (tokensA.has('auth') && tokensB.has('auth'));

        const areSimilar = similarity >= 0.25 || (hasCommonKeyTerms && similarity > 0);

        if (areSimilar) {
          seenPairs.add(pairKey);
          suspects.push({
            idA: Math.min(incA.id, incB.id),
            idB: Math.max(incA.id, incB.id),
            service: incA.service,
            reason: 'sintomas semelhantes',
          });
        }
      }
    }
  }

  // Ordena por IDs de incidente
  return suspects.sort((a, b) => a.idA - b.idA || a.idB - b.idB);
}

/**
 * Extrai o motivo em uma linha para a seção de ação imediata.
 */
function extractActionReason(inc: IncidentItem): string {
  if (inc.summary && inc.summary.trim()) {
    const firstSentence = inc.summary.split('.')[0].trim();
    if (firstSentence.length > 0 && firstSentence.length <= 110) {
      return firstSentence;
    }
  }
  return inc.title.trim();
}

/**
 * Formata um conjunto de incidentes abertos no relatório em blocos padronizado.
 */
export function formatOpenIncidentsReport(
  rawIncidents: unknown[]
): FormattedIncidentReport {
  // Validação Zod
  const incidents = rawIncidents.map((item) => incidentItemSchema.parse(item));

  const sortedIncidents = sortIncidents(incidents);
  const summary = computeReportSummary(sortedIncidents);
  const duplicates = detectDuplicates(sortedIncidents);

  // Filtra incidentes críticos e de alta severidade
  const immediateActions: ImmediateActionItem[] = sortedIncidents
    .filter((inc) => inc.severity === 'critical' || inc.severity === 'high')
    .map((inc) => ({
      id: inc.id,
      service: inc.service,
      reason: extractActionReason(inc),
    }));

  // Montagem do Markdown
  const lines: string[] = [];

  // 1. Resumo no topo
  lines.push('## Incidentes abertos em produção');
  lines.push(
    `Total: ${summary.total} | Critical: ${summary.critical} | High: ${summary.high} | Medium: ${summary.medium} | Low: ${summary.low}`
  );
  lines.push('');

  // 2. Lista em blocos (separados por linha em branco)
  if (sortedIncidents.length === 0) {
    lines.push('Nenhum incidente aberto no momento.');
  } else {
    for (let i = 0; i < sortedIncidents.length; i++) {
      lines.push(formatIncidentBlock(sortedIncidents[i]));
      if (i < sortedIncidents.length - 1) {
        lines.push('');
      }
    }
  }

  // 3. Suspeitas de duplicidade (se houver)
  if (duplicates.length > 0) {
    lines.push('');
    lines.push('---');
    lines.push('');
    for (const dup of duplicates) {
      lines.push(`⚠️ Possível duplicidade: #${dup.idA} e #${dup.idB} (${dup.service}) — ${dup.reason}.`);
    }
  }

  // 4. Seção de Prioridade Imediata
  if (immediateActions.length > 0) {
    lines.push('');
    lines.push('### Ação imediata');
    for (const action of immediateActions) {
      lines.push(`- #${action.id} (${action.service}) — ${action.reason}`);
    }
  }

  const markdown = lines.join('\n');

  return {
    summary,
    sortedIncidents,
    duplicates,
    immediateActions,
    markdown,
  };
}
