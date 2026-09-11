import { parseArgs } from 'node:util';
import { ReActStrategy } from './agents/react.js';
import { PlanAndExecuteStrategy } from './agents/plan-and-execute.js';
import { store } from './agents/ops-store.js';
import type { ReasoningStrategy, StrategyResult } from './agents/types.js';

// ─── CLI Args ─────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    scenario: {
      type: 'string',
      short: 's',
      default: 'all',
    },
    'no-replanner': {
      type: 'boolean',
      default: false,
    },
  },
  strict: false,
});

const scenarioFilter = (values.scenario as string || 'all').toLowerCase();
const noReplanner = Boolean(values['no-replanner']);

// ─── Cores e Formatação ───────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';

// ─── Definição de Cenários ───────────────────────────────────────────────────

interface BenchmarkScenario {
  id: string;
  name: string;
  description: string;
  prompt: string;
  evaluator: (result: StrategyResult) => Promise<{ passed: boolean; reason?: string }>;
}

const scenarios: BenchmarkScenario[] = [
  {
    id: 'c1',
    name: 'C1 direto',
    description: 'Quantos alertas críticos estão disparando?',
    prompt: 'Quantos alertas críticos estão disparando?',
    evaluator: async (result: StrategyResult) => {
      // Estado esperado: nenhum incidente criado (apenas consulta)
      const incidents = await store.listIncidents('all');
      if (incidents.length > 0) {
        return { passed: false, reason: `Criou ${incidents.length} incidentes indevidamente` };
      }

      // Verificação na resposta: no seed há 2 alertas críticos disparando (auth-service e billing-service)
      const mentionsTwo = /\b(2|dois)\b/i.test(result.answer);
      if (!mentionsTwo) {
        return { passed: false, reason: 'Resposta não identificou 2 alertas críticos' };
      }

      return { passed: true };
    },
  },
  {
    id: 'c2',
    name: 'C2 estruturado',
    description: 'Abra três incidentes sev2 para checkout, payment e catalog, nessa ordem, e resolva o primeiro',
    prompt:
      'Abra três incidentes sev2 para checkout, payment e catalog, nessa mesma ordem, e resolva o primeiro.',
    evaluator: async () => {
      // Estado esperado no store: 3 incidentes criados na ordem checkout, payment, catalog
      const incidents = await store.listIncidents('all');

      if (incidents.length !== 3) {
        return { passed: false, reason: `Esperava 3 incidentes no banco, encontrou ${incidents.length}` };
      }

      const services = incidents.map((inc) => inc.service.toLowerCase());
      const expectedServices = ['checkout', 'payment', 'catalog'];

      for (let i = 0; i < 3; i++) {
        if (!services[i].includes(expectedServices[i])) {
          return {
            passed: false,
            reason: `Incidente #${i + 1} serviço incorreto: esperado "${expectedServices[i]}", obtido "${services[i]}"`,
          };
        }
      }

      // Primeiro deve estar resolvido, os outros dois abertos
      if (incidents[0].status !== 'resolved') {
        return {
          passed: false,
          reason: `Primeiro incidente (#${incidents[0].id} - ${incidents[0].service}) deveria estar "resolved", mas está "${incidents[0].status}"`,
        };
      }

      if (incidents[1].status !== 'open' || incidents[2].status !== 'open') {
        return {
          passed: false,
          reason: `Segundo e terceiro incidentes deveriam estar "open" (obtidos: ${incidents[1].status}, ${incidents[2].status})`,
        };
      }

      return { passed: true };
    },
  },
  {
    id: 'c3',
    name: 'C3 dinâmico',
    description: 'Dos alertas disparando, abra incidente para o mais antigo e diga quantos sobraram',
    prompt:
      'Dos alertas disparando, abra um incidente para o mais antigo e diga quantos sobraram',
    evaluator: async (result: StrategyResult) => {
      // Estado esperado no store: exatamente 1 incidente aberto para o alerta mais antigo disparando
      // No seed: alertas disparando são #1 (api-gateway), #2 (auth-service), #3 (billing-service).
      // O mais antigo é o #1 (api-gateway).
      const incidents = await store.listIncidents('all');

      if (incidents.length !== 1) {
        return { passed: false, reason: `Esperava 1 incidente no banco, encontrou ${incidents.length}` };
      }

      const inc = incidents[0];
      const service = inc.service.toLowerCase();
      const isApiGateway =
        service.includes('api-gateway') ||
        inc.title.toLowerCase().includes('api-gateway') ||
        inc.title.toLowerCase().includes('cpu');

      if (!isApiGateway) {
        return {
          passed: false,
          reason: `Incidente aberto para o serviço errado: "${inc.service}" (esperado alerta mais antigo: api-gateway)`,
        };
      }

      // Verificação na resposta: sobraram 2 alertas disparando sem incidente
      const mentionsTwo = /\b(2|dois)\b/i.test(result.answer);
      if (!mentionsTwo) {
        return { passed: false, reason: 'Resposta não mencionou que sobraram 2 alertas' };
      }

      return { passed: true };
    },
  },
];

// ─── Resultado da Execução ───────────────────────────────────────────────────

interface BenchmarkResult {
  scenario: string;
  strategy: string;
  passed: boolean;
  reason?: string;
  llCalls: number;
  latencyMs: number;
}

// ─── Execução do Benchmark ───────────────────────────────────────────────────

async function main(): Promise<void> {
  const selectedScenarios =
    scenarioFilter === 'all'
      ? scenarios
      : scenarios.filter((s) => s.id === scenarioFilter || s.name.toLowerCase().includes(scenarioFilter));

  if (selectedScenarios.length === 0) {
    console.error(
      `\n❌ Nenhum cenário encontrado para o filtro: "${scenarioFilter}". ` +
      `Disponíveis: c1, c2, c3, all`
    );
    process.exit(1);
  }

  const sep = '═'.repeat(74);
  const thin = '─'.repeat(74);

  console.log(`\n${BOLD}${sep}${RESET}`);
  console.log(`${BOLD}  🧪  OpsPilot Benchmark — Raciocínio & Estado Real do Store${RESET}`);
  console.log(sep);
  console.log(`${BOLD}Cenários:${RESET}     ${selectedScenarios.map((s) => s.name).join(', ')}`);
  console.log(`${BOLD}Estratégias:${RESET}  react, plan-and-execute${noReplanner ? ' (sem replanner)' : ''}`);
  console.log(sep);

  const results: BenchmarkResult[] = [];

  for (const scenario of selectedScenarios) {
    console.log(`\n${BOLD}${CYAN}▶ Cenário: ${scenario.name}${RESET}`);
    console.log(`${DIM}Prompt: "${scenario.prompt}"${RESET}`);
    console.log(thin);

    const strategies: Array<{ name: string; factory: () => ReasoningStrategy }> = [
      {
        name: 'react',
        factory: () => new ReActStrategy({ maxIterations: 10 }),
      },
      {
        name: noReplanner ? 'plan-and-execute [no-replanner]' : 'plan-and-execute',
        factory: () => new PlanAndExecuteStrategy({ maxSteps: 8, replanner: !noReplanner }),
      },
    ];

    for (const { name: stratName, factory } of strategies) {
      process.stdout.write(`  • Executando ${YELLOW}${stratName.padEnd(30)}${RESET}... `);

      // Reseta o store com dados determinísticos do seed antes de cada execução
      await store.seed();

      const strategy = factory();
      const startMs = Date.now();

      try {
        const result = await strategy.run(scenario.prompt);
        const evalResult = await scenario.evaluator(result);

        const latencyMs = result.metrics.latencyMs || Date.now() - startMs;
        const llCalls = result.metrics.llmCalls;

        results.push({
          scenario: scenario.name,
          strategy: stratName,
          passed: evalResult.passed,
          reason: evalResult.reason,
          llCalls,
          latencyMs,
        });

        if (evalResult.passed) {
          console.log(`${GREEN}✅ Passou${RESET} (${llCalls} chamadas, ${latencyMs}ms)`);
        } else {
          console.log(`${RED}❌ Falhou${RESET} (${evalResult.reason ?? 'inconsistente'})`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          scenario: scenario.name,
          strategy: stratName,
          passed: false,
          reason: `Erro: ${msg}`,
          llCalls: 0,
          latencyMs: Date.now() - startMs,
        });
        console.log(`${RED}❌ Erro de execução: ${msg}${RESET}`);
      }
    }
  }

  // ─── Tabela Consolidada ───────────────────────────────────────────────────────

  console.log(`\n\n${BOLD}${sep}${RESET}`);
  console.log(`${BOLD}  📊  Tabela Consolidada de Resultados${RESET}`);
  console.log(sep);

  const colScenario = 'Cenário'.padEnd(16);
  const colStrategy = 'Estratégia'.padEnd(32);
  const colPass = 'Acerto'.padEnd(12);
  const colCalls = 'llCalls'.padStart(9);
  const colLatency = 'latencyMs'.padStart(11);

  console.log(`${DIM}${colScenario} ${colStrategy} ${colPass} ${colCalls} ${colLatency}${RESET}`);
  console.log(thin);

  for (const r of results) {
    const passLabel = r.passed ? `${GREEN}✅ Passou${RESET}` : `${RED}❌ Falhou${RESET}`;
    const scenarioStr = r.scenario.padEnd(16);
    const strategyStr = r.strategy.padEnd(32);
    const callsStr = String(r.llCalls).padStart(9);
    const latencyStr = `${r.latencyMs} ms`.padStart(11);

    console.log(`${scenarioStr} ${strategyStr} ${passLabel.padEnd(20)} ${callsStr} ${latencyStr}`);
    if (!r.passed && r.reason) {
      console.log(`${DIM}   ↳ Motivo: ${r.reason}${RESET}`);
    }
  }

  console.log(sep);
}

main().catch((err: unknown) => {
  console.error('\n❌ Falha fatal no benchmark:', err);
  process.exit(1);
});
