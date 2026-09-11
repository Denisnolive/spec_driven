import type { ReasoningStrategy } from './types.js';
import { ReActStrategy } from './react.js';
import { PlanAndExecuteStrategy } from './plan-and-execute.js';
import { withReflection } from './reflection.js';
import type { ReflectionOptions } from './reflection.js';

export * from './types.js';
export * from './model.js';
export * from './tools.js';
export * from './react.js';
export * from './plan-and-execute.js';
export * from './reflection.js';
export * from './production-graph.js';


// ─── Strategy Registry ────────────────────────────────────────────────────────

export type StrategyFactory = () => ReasoningStrategy;

export interface GetStrategyOptions {
  reflect?: boolean;
  reflectionOptions?: ReflectionOptions;
}

export class StrategyRegistry {
  private readonly factories = new Map<string, StrategyFactory>();
  private readonly defaultReflectionOptions?: ReflectionOptions;

  constructor(
    initialStrategies?: Record<string, StrategyFactory>,
    defaultReflectionOptions?: ReflectionOptions
  ) {
    if (initialStrategies) {
      for (const [name, factory] of Object.entries(initialStrategies)) {
        this.register(name, factory);
      }
    }
    this.defaultReflectionOptions = defaultReflectionOptions;
  }

  register(name: string, factory: StrategyFactory): void {
    this.factories.set(name.trim().toLowerCase(), factory);
  }

  has(name: string): boolean {
    return this.factories.has(name.trim().toLowerCase());
  }

  get(name: string, options: GetStrategyOptions = {}): ReasoningStrategy | undefined {
    const factory = this.factories.get(name.trim().toLowerCase());
    if (!factory) {
      return undefined;
    }

    const baseStrategy = factory();
    if (options.reflect) {
      const opts = options.reflectionOptions ?? this.defaultReflectionOptions;
      return withReflection(baseStrategy, opts);
    }

    return baseStrategy;
  }

  list(): string[] {
    return Array.from(this.factories.keys());
  }
}

// ─── Instância Padrão Global ──────────────────────────────────────────────────

export const defaultStrategyRegistry = new StrategyRegistry({
  react: () => new ReActStrategy(),
  'plan-and-execute': () => new PlanAndExecuteStrategy(),
});

export function getStrategy(
  name: string,
  options: GetStrategyOptions = {},
  registry: StrategyRegistry = defaultStrategyRegistry
): ReasoningStrategy | undefined {
  return registry.get(name, options);
}
