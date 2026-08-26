import { describe, expect, it } from "vitest";
import { AttemptIdSchema, LeaseIdSchema, RunIdSchema, StepIdSchema, TraceIdSchema } from "@nexora/contracts";
import { LocalProcessAdapter } from "./local-process-adapter.js";
import { RuntimeAdapterError } from "./errors.js";
import type { StartInput } from "./runtime-adapter.js";
import { fileURLToPath } from "node:url";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const input: StartInput = {
  run_id: RunIdSchema.parse(ID), attempt_id: AttemptIdSchema.parse(ID), step_id: StepIdSchema.parse(ID), trace_id: TraceIdSchema.parse(ID),
  deadline_at: "2026-08-26T04:01:00.000Z", lease_id: LeaseIdSchema.parse(ID), fencing_token: 3, input: { prompt: "hello" },
};
const fixture = fileURLToPath(new URL("../test-fixtures/agent-fixture.mjs", import.meta.url));
const node = process.execPath;
const NOW = "2026-08-26T04:00:00.000Z";

async function collectTypes(adapter: LocalProcessAdapter, handle: Awaited<ReturnType<LocalProcessAdapter["start"]>>): Promise<readonly string[]> {
  const types: string[] = [];
  for await (const event of adapter.collect(handle)) types.push(event.type);
  return types;
}

describe("local process adapter", () => {
  it("rejects executables outside the explicit allowlist", () => {
    expect(() => new LocalProcessAdapter({ executable: node, allowed_executables: [], cwd: process.cwd() })).toThrowError(RuntimeAdapterError);
  });

  it("streams JSON envelopes from the fixture and redacts stderr", async () => {
    const adapter = new LocalProcessAdapter({ executable: node, allowed_executables: [node], cwd: process.cwd(), args: [fixture, "success"], stderr_redactions: ["SECRET_TOKEN"], now: () => NOW });
    const handle = await adapter.start(input);
    const types = await collectTypes(adapter, handle);

    expect(types).toContain("started");
    expect(types).toContain("completed");
    expect(adapter.stderr(handle).join("")).not.toContain("SECRET_TOKEN");
  });

  it("maps a process crash to RUNTIME_CRASHED", async () => {
    const adapter = new LocalProcessAdapter({ executable: node, allowed_executables: [node], cwd: process.cwd(), args: [fixture, "crash"], now: () => NOW });
    const handle = await adapter.start(input);

    await expect(async () => {
      for await (const _event of adapter.collect(handle)) continue;
    }).rejects.toMatchObject({ code: "RUNTIME_CRASHED" });
  });

  it("keeps cancellation unknown when the fixture does not acknowledge before timeout", async () => {
    const adapter = new LocalProcessAdapter({ executable: node, allowed_executables: [node], cwd: process.cwd(), args: [fixture, "cancel-timeout"], cancel_timeout_ms: 20, now: () => NOW });
    const handle = await adapter.start(input);

    await expect(adapter.cancel(handle)).resolves.toEqual({ state: "cancel_unknown", reason: "Runtime did not acknowledge cancellation" });
  });

  it("rejects a runtime that speaks an incompatible protocol version", async () => {
    const adapter = new LocalProcessAdapter({ executable: node, allowed_executables: [node], cwd: process.cwd(), args: [fixture, "protocol-mismatch"], now: () => NOW });

    await expect(adapter.start(input)).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH" });
  });

  it("rejects envelopes from a different run or lease scope", async () => {
    const adapter = new LocalProcessAdapter({ executable: node, allowed_executables: [node], cwd: process.cwd(), args: [fixture, "foreign"], now: () => NOW });

    await expect(adapter.start(input)).rejects.toMatchObject({ code: "STALE_LEASE" });
  });

  it("rejects an accepted handshake from a different adapter identity", async () => {
    const adapter = new LocalProcessAdapter({ executable: node, allowed_executables: [node], cwd: process.cwd(), args: [fixture, "wrong-adapter"], now: () => NOW });

    await expect(adapter.start(input)).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH" });
  });

  it("bounds stdout before parsing an oversized runtime response", async () => {
    const adapter = new LocalProcessAdapter({ executable: node, allowed_executables: [node], cwd: process.cwd(), args: [fixture, "large"], max_output_bytes: 1_024, now: () => NOW });
    const handle = await adapter.start(input);

    await expect(async () => {
      for await (const _event of adapter.collect(handle)) continue;
    }).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("rejects stale fencing handles before reading the process stream", async () => {
    const adapter = new LocalProcessAdapter({ executable: node, allowed_executables: [node], cwd: process.cwd(), args: [fixture, "success"], now: () => NOW });
    const handle = await adapter.start(input);
    const staleHandle = { ...handle, fencing_token: 4 };

    await expect(async () => {
      for await (const _event of adapter.collect(staleHandle)) continue;
    }).rejects.toMatchObject({ code: "STALE_LEASE" });
    await adapter.cancel(handle);
  });

  it("redacts secrets split across stderr chunks", async () => {
    const adapter = new LocalProcessAdapter({ executable: node, allowed_executables: [node], cwd: process.cwd(), args: [fixture, "split-secret"], stderr_redactions: ["SECRET_TOKEN"], now: () => NOW });
    const handle = await adapter.start(input);
    for await (const _event of adapter.collect(handle)) continue;

    expect(adapter.stderr(handle).join("")).not.toContain("SECRET_TOKEN");
  });

  it("starts children with a minimal environment instead of inheriting process secrets", async () => {
    const previous = process.env["RUNTIME_SECRET"];
    process.env["RUNTIME_SECRET"] = "INHERITED_SECRET";
    try {
      const adapter = new LocalProcessAdapter({ executable: node, allowed_executables: [node], cwd: process.cwd(), args: [fixture, "success"], now: () => NOW });
      const handle = await adapter.start(input);
      for await (const _event of adapter.collect(handle)) continue;

      expect(adapter.stderr(handle).join("")).not.toContain("INHERITED_SECRET");
    } finally {
      if (previous === undefined) delete process.env["RUNTIME_SECRET"];
      else process.env["RUNTIME_SECRET"] = previous;
    }
  });

  it("bounds stderr before an untrusted runtime can grow memory", async () => {
    const adapter = new LocalProcessAdapter({ executable: node, allowed_executables: [node], cwd: process.cwd(), args: [fixture, "stderr-large"], max_stderr_bytes: 1_024, now: () => NOW });
    const handle = await adapter.start(input);

    await expect(async () => {
      for await (const _event of adapter.collect(handle)) continue;
    }).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("wakes a collector when a child exits cleanly without a close envelope", async () => {
    const adapter = new LocalProcessAdapter({ executable: node, allowed_executables: [node], cwd: process.cwd(), args: [fixture, "no-close"], now: () => NOW });
    const handle = await adapter.start(input);

    await expect(async () => {
      for await (const _event of adapter.collect(handle)) continue;
    }).rejects.toMatchObject({ code: "RUNTIME_CRASHED" });
  });

  it("terminates an unresponsive child when the runtime deadline expires", async () => {
    const adapter = new LocalProcessAdapter({ executable: node, allowed_executables: [node], cwd: process.cwd(), args: [fixture, "cancel-timeout"], now: () => NOW });
    const shortInput = { ...input, deadline_at: "2026-08-26T04:00:00.500Z" };
    const handle = await adapter.start(shortInput);

    await expect(async () => {
      for await (const _event of adapter.collect(handle)) continue;
    }).rejects.toMatchObject({ code: "CONNECTOR_TIMEOUT" });
  });

  it("does not overflow timers for deadlines beyond the native timer range", async () => {
    const adapter = new LocalProcessAdapter({ executable: node, allowed_executables: [node], cwd: process.cwd(), args: [fixture, "success"], now: () => NOW });
    const longInput = { ...input, deadline_at: "2026-10-01T04:00:00.000Z" };
    const handle = await adapter.start(longInput);

    await expect(collectTypes(adapter, handle)).resolves.toContain("completed");
  });
});
