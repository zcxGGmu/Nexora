import { z } from "zod";
import { AgentIdSchema, ScheduleSchema, TicketIdSchema, WorkspaceIdSchema } from "@nexora/contracts";
import { AgentRepository, IdempotencyRepository, ScheduleRepository, TicketRepository, withTransaction, type SqliteDatabase } from "@nexora/persistence";
import { assertScope, type PolicyActor } from "@nexora/policy";
import { accepted, requestHash } from "./command-helpers.js";
import type { AcceptedCommand, IdFactory } from "./command-service.js";
import { ApiHttpError } from "./errors.js";

const CreateScheduleBodySchema = ScheduleSchema.omit({ id: true, created_at: true, updated_at: true }).extend({ workspace_id: WorkspaceIdSchema, run_template: z.object({ ticket_id: TicketIdSchema, agent_id: AgentIdSchema, execution_location: z.enum(["local", "remote"]) }).strict() }).strict();

export class ScheduleCommandService {
  private readonly idempotency: IdempotencyRepository;
  private readonly schedules: ScheduleRepository;

  constructor(private readonly options: { readonly database: SqliteDatabase; readonly clock: { readonly now: () => string }; readonly idFactory: IdFactory }) {
    this.idempotency = new IdempotencyRepository(options.database);
    this.schedules = new ScheduleRepository(options.database);
  }

  createSchedule(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const body = CreateScheduleBodySchema.parse(input);
    return withTransaction(this.options.database, () => {
      this.requireScope(actor, body.workspace_id);
      if (new TicketRepository(this.options.database).get(body.workspace_id, body.run_template.ticket_id) === undefined) throw notFound();
      if (new AgentRepository(this.options.database).get(body.workspace_id, body.run_template.agent_id) === undefined) throw notFound();
      const reserved = this.reserve(body.workspace_id, idempotencyKey, requestHash(body));
      if (reserved.kind === "new") this.schedules.create(ScheduleSchema.parse({ ...body, id: reserved.resource_id, created_at: this.now(), updated_at: this.now() }));
      return accepted({ command_id: idempotencyKey, object_type: "schedule", object_id: reserved.resource_id, workspace_id: body.workspace_id });
    });
  }

  private reserve(workspaceId: string, key: string, hash: string): { readonly kind: "existing" | "new"; readonly resource_id: string } {
    const existing = this.idempotency.get(workspaceId, key);
    const resourceId = existing?.resource_id ?? this.options.idFactory();
    const record = this.idempotency.reserve({ workspace_id: workspaceId, idempotency_key: key, request_hash: hash, resource_type: "schedule", resource_id: resourceId, created_at: this.now() });
    if (record.resource_type !== "schedule") throw new ApiHttpError({ status_code: 409, code: "IDEMPOTENCY_KEY_REUSED", message: "Idempotency key was reused with a different request", retryable: false, required_action: "use_new_idempotency_key" });
    return { kind: existing === undefined ? "new" : "existing", resource_id: record.resource_id };
  }

  private requireScope(actor: PolicyActor, workspaceId: string): void {
    const decision = assertScope({ actor, action: "run:write", enforcement_point: "api", requested_scope: { kind: "workspace", id: workspaceId } });
    if (!decision.allowed) throw new ApiHttpError({ status_code: 403, code: decision.code, message: decision.reason, retryable: false, required_action: decision.required_action });
  }

  private now(): string {
    return this.options.clock.now();
  }
}

function notFound(): ApiHttpError {
  return new ApiHttpError({ status_code: 404, code: "SCOPE_DENIED", message: "Resource not found", retryable: false, required_action: "check_scope" });
}
