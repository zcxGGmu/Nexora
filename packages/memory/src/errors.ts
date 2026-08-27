export type MemoryVaultErrorCode = "MEMORY_CONFLICT" | "MEMORY_NOT_FOUND" | "SCOPE_DENIED" | "VAULT_PATH_INVALID" | "VAULT_WRITE_FAILED";

export class MemoryVaultError extends Error {
  readonly code: MemoryVaultErrorCode;

  constructor(code: MemoryVaultErrorCode, message: string) {
    super(message);
    this.name = "MemoryVaultError";
    this.code = code;
  }
}
