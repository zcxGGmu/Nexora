# C16 Fault Drill Report

The explicit `FaultInjector` fixture emits one-shot, typed outcomes for:

| Scenario | Error code | Retryable | Side effect unknown |
|---|---|---:|---:|
| timeout | `RUNTIME_TIMEOUT` | yes | no |
| crash | `RUNTIME_CRASHED` | yes | no |
| stale lease | `STALE_LEASE` | yes | no |
| projection failure | `PROJECTION_DEGRADED` | no | no |
| connector outage | `CONNECTOR_UNAVAILABLE` | yes | yes |

Automated drill evidence: `tests/c16-release-hardening.test.ts` passed all five outcomes and verified timeout is consumed once. Existing recovery, remote recovery, backup/restore, observability, and quarantine integration tests passed 9/9.

Docker runtime fault injection was not attempted because the local Docker daemon was unavailable; this remains a CI/next-environment check.
