export const FAULT_SCENARIOS = {
  timeout: { error_code: "RUNTIME_TIMEOUT", retryable: true, side_effect_unknown: false },
  crash: { error_code: "RUNTIME_CRASHED", retryable: true, side_effect_unknown: false },
  stale_lease: { error_code: "STALE_LEASE", retryable: true, side_effect_unknown: false },
  projection_failure: { error_code: "PROJECTION_DEGRADED", retryable: false, side_effect_unknown: false },
  connector_outage: { error_code: "CONNECTOR_UNAVAILABLE", retryable: true, side_effect_unknown: true },
} as const;

export type FaultScenario = keyof typeof FAULT_SCENARIOS;
export type FaultResult = (typeof FAULT_SCENARIOS)[FaultScenario] & { readonly scenario: FaultScenario };

export class FaultInjector {
  private readonly remaining: Map<FaultScenario, number>;
  private readonly scenarios: typeof FAULT_SCENARIOS;

  constructor(options: { readonly scenarios?: typeof FAULT_SCENARIOS } = {}) {
    this.scenarios = options.scenarios ?? FAULT_SCENARIOS;
    this.remaining = new Map(Object.keys(this.scenarios).map((scenario) => [scenario as FaultScenario, 1]));
  }

  inject(scenario: FaultScenario): FaultResult | undefined {
    const count = this.remaining.get(scenario) ?? 0;
    if (count <= 0) return undefined;
    this.remaining.set(scenario, count - 1);
    return { scenario, ...this.scenarios[scenario] };
  }

  reset(scenario?: FaultScenario): void {
    if (scenario === undefined) {
      for (const key of Object.keys(this.scenarios) as FaultScenario[]) this.remaining.set(key, 1);
      return;
    }
    this.remaining.set(scenario, 1);
  }
}
