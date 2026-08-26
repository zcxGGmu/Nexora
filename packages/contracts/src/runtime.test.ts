import { describe, expect, it } from "vitest";
import {
  RuntimeCancelAckPayloadSchema,
  RuntimeEventPayloadSchema,
  RuntimeHelloPayloadSchema,
  RuntimeStartPayloadSchema,
} from "./index.js";

describe("runtime payload contracts", () => {
  it("accepts the typed handshake and start payloads", () => {
    expect(RuntimeHelloPayloadSchema.parse({ adapter_id: "fixture", protocol_version: 1, capabilities: { resume: true, cancel: true } })).toEqual({ adapter_id: "fixture", protocol_version: 1, capabilities: { resume: true, cancel: true } });
    expect(RuntimeStartPayloadSchema.parse({ input: { prompt: "hello", retries: 1 } })).toEqual({ input: { prompt: "hello", retries: 1 } });
  });

  it("keeps unknown runtime event names parseable for unmapped-event handling", () => {
    expect(RuntimeEventPayloadSchema.parse({ event_type: "vendor.progress", data: { chunk: "1" } })).toEqual({ event_type: "vendor.progress", data: { chunk: "1" } });
  });

  it("rejects extra fields in cancellation acknowledgements", () => {
    expect(RuntimeCancelAckPayloadSchema.safeParse({ acknowledged: true, unknown: false, reason: null, secret: "nope" }).success).toBe(false);
  });
});
