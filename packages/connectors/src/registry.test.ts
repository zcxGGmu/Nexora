import { describe, expect, it } from "vitest";
import { mockDraftConnectorDescriptor } from "./mock-draft-connector.js";
import { ConnectorRegistry, ConnectorRegistryError } from "./registry.js";

describe("ConnectorRegistry", () => {
  it("Given a connector descriptor When registered Then it can be resolved by id and version", () => {
    const registry = new ConnectorRegistry();

    registry.register(mockDraftConnectorDescriptor);

    expect(registry.get("mock-draft", "1.0.0")).toEqual(mockDraftConnectorDescriptor);
    expect(registry.list().map((descriptor) => descriptor.id)).toEqual(["mock-draft"]);
  });

  it("Given a duplicate descriptor When registered Then it is rejected", () => {
    const registry = new ConnectorRegistry();

    registry.register(mockDraftConnectorDescriptor);

    expect(() => registry.register(mockDraftConnectorDescriptor)).toThrowError(ConnectorRegistryError);
  });
});
