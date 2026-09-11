import { parseArgs } from 'node:util';
import { ReActStrategy } from './agents/react.js';
import { PlanAndExecuteStrategy } from './agents/plan-and-execute.js';
import { store } from './agents/ops-store.js';
import type { ReasoningStrategy, TraceEvent, Metrics } from './agents/types.js';

// ─── CLI Args ─────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    strategies: {
      type: 'string',
      default: 'react',
      short: 's',
    },
    'max-iterations': {
      type: 'string',
      default: '10',
      short: 'm',
    },
    input: {
      type: 'string',
      default:
        'Liste todos os alertas ativos (firing) e abra um incidente para o mais crítico.',
      short: 'i',
    },
  },
  strict: false,
});

const strategyNames = (values.strategies as string)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const maxIterations = Math.max(1, parseInt(values['max-iterations'] as string, 10) || 10);
const queryInput = values.input as string;

import { withReflection } from './agents/reflection.js';

// ─── Fábrica de estratégias ───────────────────────────────────────────────────

const strategyRegistry: Record<string, () => ReasoningStrategy> = {
  react: () => new ReActStrategy({ maxIterations }),
  'plan-and-execute': () => new PlanAndExecuteStrategy({ maxSteps: maxIterations }),
  'reflect:react': () => withReflection(new ReActStrategy({ maxIterations })),
  'reflect:plan-and-execute': () => withReflection(new PlanAndExecuteStrategy({ maxSteps: maxIterations })),
};

// ─── Formatação de trace ──────────────────────────────────────────────────────

const KIND_COLORS: Record<string, string> = {
  thought: '\x1b[36m',      // cyan
  action: '\x1b[33m',       // yellow
  observation: '\x1b[32m',  // green
  plan: '\x1b[35m',         // magenta
  critique: '\x1b[34m',     // blue
  answer: '\x1b[92m',       // bright green
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function formatTrace(trace: TraceEvent[]): string {
  return trace
    .map((e, i) => {
      const color = KIND_COLORS[e.kind] ?? '';
      const idx = `${DIM}[${String(i + 1).padStart(2, '0')}]${RESET}`;
      const kindLabel = `${color}${BOLD}${e.kind.toUpperCase().padEnd(11)}${RESET}`;

      let body: string;
      if (typeof e.content === 'string') {
        body = e.content.length > 300
          ? e.content.slice(0, 300) + `${DIM}…${RESET}`
          : e.content;
      } else {
        body = `tool=${BOLD}${e.content.tool}${RESET} args=${JSON.stringify(e.content.args)}`;
      }

      return `${idx} ${kindLabel} ${body}`;
    })
    .join('\n');
}

function formatMetrics(m: Metrics, strategyName: string): string {
  return (
    `${BOLD}Estratégia:${RESET} ${strategyName}\n` +
    `${BOLD}llmCalls:${RESET}   ${m.llmCalls}\n` +
    `${BOLD}latencyMs:${RESET}  ${m.latencyMs} ms`
  );
}

// ─── Seed automático ──────────────────────────────────────────────────────────

async function ensureSeed(): Promise<void> {
  const alerts = await store.listAlerts('all');
  if (alerts.length > 0) return; // já populado

  console.log(`${DIM}(banco vazio — executando seed automático...)${RESET}\n`);
  await store.seed();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const sep = '═'.repeat(62);
  const thin = '─'.repeat(62);

  console.log(`\n${BOLD}${sep}${RESET}`);
  console.log(`${BOLD}  🤖  OpsPilot Arena${RESET}`);
  console.log(sep);
  console.log(`${BOLD}Input:${RESET}        ${queryInput}`);
  console.log(`${BOLD}Estratégias:${RESET}  ${strategyNames.join(', ')}`);
  console.log(`${BOLD}Max iter.:${RESET}    ${maxIterations}`);
  console.log(sep);

  await ensureSeed();

  const results: Array<{ name: string; latencyMs: number; llmCalls: number }> = [];

  for (const name of strategyNames) {
    const factory = strategyRegistry[name];

    if (!factory) {
      console.error(
        `\n❌ Estratégia desconhecida: "${name}". ` +
        `Disponíveis: ${Object.keys(strategyRegistry).join(', ')}`
      );
      continue;
    }

    const strategy = factory();
    console.log(`\n\n${BOLD}▶ Estratégia: ${strategy.name}${RESET}`);
    console.log(thin);

    const t0 = Date.now();
    try {
      const result = await strategy.run(queryInput);

      console.log(`\n${BOLD}Trace:${RESET}`);
      console.log(formatTrace(result.trace));
      console.log(`\n${BOLD}Resposta Final:${RESET}`);
      console.log(result.answer);
      console.log(`\n${BOLD}Métricas:${RESET}`);
      console.log(formatMetrics(result.metrics, strategy.name));

      results.push({
        name: strategy.name,
        latencyMs: result.metrics.latencyMs,
        llmCalls: result.metrics.llmCalls,
      });
    } catch (err) {
      console.error(`\n❌ ${strategy.name} falhou:`, err);
    }

    console.log(`\n${thin}`);
  }

  // ── Sumário comparativo ──────────────────────────────────────────────────
  if (results.length > 1) {
    console.log(`\n${BOLD}${sep}${RESET}`);
    console.log(`${BOLD}  📊  Comparativo${RESET}`);
    console.log(sep);

    const header = `${'Estratégia'.padEnd(22)} ${'llmCalls'.padStart(9)} ${'latencyMs'.padStart(11)}`;
    console.log(`${DIM}${header}${RESET}`);
    console.log(thin);

    for (const r of results) {
      console.log(
        `${r.name.padEnd(22)} ${String(r.llmCalls).padStart(9)} ${String(r.latencyMs).padStart(11)}`
      );
    }
    console.log(sep);
  }
}

main().catch((err: unknown) => {
  console.error('\n❌ Arena falhou:', err);
  process.exit(1);
});
