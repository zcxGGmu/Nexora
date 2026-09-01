import { describe, expect, test } from "vitest";

import {
  EnvironmentValidationError,
  parseEnvironment,
} from "./env.js";

const secretSentinel = "NEXORA_SECRET_SHOULD_NOT_APPEAR";

function captureValidationError(
  input: Record<string, string | undefined>,
): EnvironmentValidationError {
  try {
    parseEnvironment(input);
  } catch (error) {
    if (error instanceof EnvironmentValidationError) {
      return error;
    }

    throw error;
  }

  throw new Error("Expected environment parsing to fail");
}

describe("parseEnvironment", () => {
  test("Given valid local input When parsed Then it applies local-first defaults", () => {
    const input: Record<string, string | undefined> = {
      NEXORA_DATA_DIR: "/tmp/nexora-data",
    };

    const environment = parseEnvironment(input);

    expect(environment).toEqual({
      dataDir: "/tmp/nexora-data",
      apiHost: "127.0.0.1",
      apiPort: 4310,
      logLevel: "info",
      authMode: "local",
      enableLocalSessionBootstrap: false,
      dbPath: "/tmp/nexora-data/nexora.sqlite",
      migrationMode: "auto",
    });
  });

  test("Given explicit database settings When parsed Then it preserves the path and migration mode", () => {
    const environment = parseEnvironment({
      NEXORA_DATA_DIR: "/tmp/nexora-data",
      NEXORA_DB_PATH: "/tmp/custom.sqlite",
      NEXORA_MIGRATION_MODE: "validate",
    });

    expect(environment.dbPath).toBe("/tmp/custom.sqlite");
    expect(environment.migrationMode).toBe("validate");
  });

  test("Given a local control token secret When parsed Then it exposes the secret without changing migration defaults", () => {
    const environment = parseEnvironment({
      NEXORA_DATA_DIR: "/tmp/nexora-data",
      NEXORA_CONTROL_TOKEN_SECRET: "0123456789abcdef0123456789abcdef",
    });

    expect(environment.controlTokenSecret).toBe("0123456789abcdef0123456789abcdef");
    expect(environment.migrationMode).toBe("auto");
  });

  test("Given local session bootstrap opt-in When parsed Then it enables cookie bootstrap explicitly", () => {
    const environment = parseEnvironment({
      NEXORA_DATA_DIR: "/tmp/nexora-data",
      NEXORA_ENABLE_LOCAL_SESSION_BOOTSTRAP: "true",
    });

    expect(environment.enableLocalSessionBootstrap).toBe(true);
  });

  test("Given missing data directory When parsed Then it reports a redacted typed error", () => {
    const error = captureValidationError({
      NEXORA_API_SECRET: secretSentinel,
    });

    expect(error).toBeInstanceOf(EnvironmentValidationError);
    expect(error.message).toContain("NEXORA_DATA_DIR");
    expect(error.message).not.toContain(secretSentinel);
  });

  test("Given invalid port and a secret sentinel When parsed Then it does not leak the sentinel", () => {
    const error = captureValidationError({
      NEXORA_DATA_DIR: "/tmp/nexora-data",
      NEXORA_API_PORT: "not-a-port",
      NEXORA_API_SECRET: secretSentinel,
    });

    expect(error).toBeInstanceOf(EnvironmentValidationError);
    expect(error.message).toContain("NEXORA_API_PORT");
    expect(error.message).not.toContain(secretSentinel);
  });
});
