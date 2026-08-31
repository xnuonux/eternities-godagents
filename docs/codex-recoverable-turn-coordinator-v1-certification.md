# Recoverable Codex turn coordinator v1 certification

## certified source

The recovery-first coordinator implementation is frozen at source commit `90535eaf8d4bf7ad32a7bf4e522efc7b91dfb8f8`.

- certification receipt: `receipts/codex-recoverable-turn-coordinator-v1.json`
- receipt digest: `b2fa996abd3250c1fb39726d4d6ffdb6efdbf80488e8dfa37addd6eb180bb627`
- receipt file SHA-256: `74a4998ec6d47556067c4a265bff2a2fb7deff2dcc4b044efadcbf06957ed5b7`
- deterministic fixture: `fixtures/codex-recoverable-turn-coordinator-v1.json`
- fixture logical digest: `ccb8a1d3e567068e77cafe5956840f1c2529df6e49958431cb249457a94dea78`
- fixture file SHA-256: `7892646de5b7638c010ff33db2e7758828c29542deb2d9fff6367dd60f925394`
- implementation manifest digest: `eb77cf0f3772e947aec760fdbe6a283bb357736612d649df4e12134ed0dfcd6c`
- test manifest digest: `8476368339aec479103a99013ce965ca856326225bedb4a22b9f859fd541cb21`

## verified behavior

The coordinator binds the strict task-control and recovery descriptors into one transport identity, reconciles task reservation before creation, and reconciles the exact dispatch digest before any model dispatch. An accepted operation can be reopened by operation id and returns its verified response and receipt without transport discovery or use.

Seven process-shaped interruption windows cover reservation, binding acquisition, attempt publication, external dispatch completion before journal publication, durable transport publication, binding closure, and final acceptance. Every reconstructed case converges on one task, one completed dispatch, and one accepted result. An active orphan remains retryable pending until its exact lease becomes terminal. An absent orphan dispatch is closed and explicitly abandoned before a new ordinal can bind.

Completed work recovered after process death may finalize through an expired binding only when the execution witness proves that the exact dispatch and response began and completed inside the original lease. Revoked completion quarantines. Downgraded descriptors, ambiguous reconciliation, parent or actor drift, changed response evidence, malformed receipts, and model-authored authority all fail closed.

The deterministic fixture certifies create, continue, and compaction resume across three cortex ids while preserving one actor and task. It also reconstructs the uncertain external-dispatch window through exact terminal reconciliation and lease expiry. It records zero duplicate reservations, zero duplicate dispatches, zero active bindings after completion, zero credential leaks, zero transcript inputs, zero continuity admissions, and zero Realm effects.

## verification

- 71 focused tests passed
- 458 full repository tests passed
- all 12 `CRC` requirement rows passed
- all 15 append-only certification receipts and their declared historical links verified
- certification ledger digest: `0d3bff58809f97bceda2052980e1dd25bc9bcd113389672bce6609eb8e241885`
- source-lineage digest before the release-only commit: `4bee8992bb1a312cae2d233f59e6f11d0a253b96bcb12d8447edeff5fe615795`
- inline adversarial review found no unresolved critical defect
- no independent reviewer was used because this milestone was completed inline

## proof limits

This receipt certifies only a deterministic injected transport with trusted terminal reconciliation. It does not certify the current public Codex app controls, provider credentials, cross-process adapter atomicity beyond the declared contract, task migration, continuity-content admission, personal-keel content writes, Godskills activation, Realm effects, background operation, cross-machine replication, hostile same-user isolation, model quality, Lunari integration, or Soul activation.
