import readline from "node:readline";

const scenario = process.argv[2] ?? "success";
const base = {
  schema_version: 1,
  protocol_version: 1,
  run_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  attempt_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  step_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  trace_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  sequence: 0,
  cursor: null,
  deadline_at: "2026-08-26T04:01:00.000Z",
  lease_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  fencing_token: 3,
};

function write(message_type, payload, sequence = 0, cursor = null, protocol_version = 1) {
  const message_id = `01ARZ3NDEKTSV4RRFFQ69G5F${String(sequence).padStart(2, "0")}`;
  const run_id = scenario === "foreign" ? "01BRZ3NDEKTSV4RRFFQ69G5FAV" : base.run_id;
  process.stdout.write(`${JSON.stringify({ ...base, run_id, protocol_version, message_id, message_type, sequence, cursor, payload })}\n`);
}

write("hello_ack", { accepted: scenario !== "protocol-mismatch", adapter_id: scenario === "wrong-adapter" ? "other-runtime" : "local-process", protocol_version: 1, reason: scenario === "protocol-mismatch" ? "unsupported protocol" : null }, 0, null, scenario === "protocol-mismatch" ? 2 : 1);
process.stderr.write("fixture diagnostic SECRET_TOKEN\n");
if (process.env.RUNTIME_SECRET) process.stderr.write(`environment secret ${process.env.RUNTIME_SECRET}\n`);
if (scenario === "split-secret") {
  process.stderr.write("SEC");
  setTimeout(() => process.stderr.write("RET_TOKEN\n"), 5);
}
if (scenario === "stderr-large") process.stderr.write("x".repeat(2_000));

const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.message_type === "start") {
    write("event", { event_type: "started", data: { phase: "run" } }, 1, "1");
    if (scenario === "crash") {
      process.exit(17);
    }
    if (scenario !== "cancel-timeout") {
      const data = scenario === "large" ? { runtime_status: "completed", output: "x".repeat(2_000) } : { runtime_status: "completed" };
      write("event", { event_type: "completed", data }, 2, "2");
      if (scenario !== "no-close") write("close", { reason: "completed" }, 3, "3");
      input.close();
      if (scenario === "no-close") process.exit(0);
    }
  }
  if (message.message_type === "cancel" && scenario !== "cancel-timeout") {
    write("cancel_ack", { acknowledged: true, unknown: false, reason: null }, 4, "4");
    write("close", { reason: "cancelled" }, 5, "5");
    input.close();
  }
});
