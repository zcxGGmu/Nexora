import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RegistryPage, registryFixture } from "./RegistryPage.js";

describe("Registry page", () => {
  it("shows runtime and catalog health facts without claiming external connectivity", () => {
    const markup = renderToStaticMarkup(<RegistryPage view={registryFixture} />);

    expect(markup).toContain("Runtime Registry");
    expect(markup).toContain("Hermes local");
    expect(markup).toContain("Descriptor only · no external connection");
    expect(markup).toContain("Provider / Model");
    expect(markup).toContain("Requested runtime");
    expect(markup).toContain("Actual runtime");
    expect(markup).toContain("Execution location");
    expect(markup).toContain("local");
    expect(markup).toContain('aria-labelledby="provider-model-registry-title"');
    expect(markup).not.toContain('aria-labelledby="Provider / Model-registry-title"');
    expect(markup.match(/aria-labelledby=/g)).toHaveLength(4);
    expect(markup).toContain("status-badge--success");
    expect(markup).toContain("healthy · declared");
  });
});
