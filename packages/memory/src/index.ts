export { toMemoryConflict, MemoryConflictError, type MemoryConflict } from "./conflicts.js";
export { MemoryVaultError, type MemoryVaultErrorCode } from "./errors.js";
export { resolveVaultPath, type SafeVaultPath } from "./path-resolver.js";
export { applyUnverifiedMarker, canonicalSnapshotHash, sha256MemoryContent, trustStateForSources } from "./provenance.js";
export { assertMemoryAccess, scopesEqual, type MemoryAccessInput, type MemoryOperation } from "./scope-filter.js";
export { MemorySnapshotStore, type CreateSnapshotInput, type MemoryRollbackResult, type RollbackSnapshotInput } from "./snapshots.js";
export { initializeVaultLayout, MemoryVault, type MemoryReadInput, type MemoryReadResult, type MemoryWriteInput, type MemoryWriteResult } from "./vault.js";
