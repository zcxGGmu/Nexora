import { DurableScheduler, type SchedulerFireResult } from "@nexora/orchestration";
import type { Clock } from "@nexora/contracts";
import type { SqliteDatabase } from "@nexora/persistence";

export type SchedulerLoopResult =
  | { readonly kind: "idle" }
  | { readonly kind: "fired"; readonly fired: number; readonly results: readonly SchedulerFireResult[] };

export class SchedulerLoop {
  private readonly scheduler: DurableScheduler;

  constructor(private readonly options: { readonly database: SqliteDatabase; readonly workspace_id: string; readonly clock: Clock; readonly idFactory: () => string }) {
    this.scheduler = new DurableScheduler({ database: options.database, clock: options.clock, idFactory: options.idFactory });
  }

  runOnce(now = this.options.clock.now()): SchedulerLoopResult {
    const results = this.scheduler.fireDue({ workspace_id: this.options.workspace_id, now });
    if (results.length === 0) return { kind: "idle" };
    return { kind: "fired", fired: results.length, results };
  }
}
