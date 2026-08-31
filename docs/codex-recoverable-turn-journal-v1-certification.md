# Codex recoverable turn journal v1 certification

## certified source

The inert journal implementation is frozen at source commit `2b510322baa827d3c6afaa828daa1469f80c1650`.

- certification receipt: `receipts/codex-recoverable-turn-journal-v1.json`
- receipt digest: `839067559007f8ed4e62c780ca9b740b52801d61e9652065470bbba57205e14c`
- receipt file SHA-256: `bdddce10dcc03583d7fed9cc9c530f1d8e7a37926f641daee76a1ef87814f8fe`
- deterministic fixture: `fixtures/codex-recoverable-turn-journal-v1.json`
- fixture logical digest: `9c08fb177cdf416784dd77e63e4df178fb3683405a4cb4b67a4046e0d021b9b4`
- fixture file SHA-256: `108992c82c255efeff5f3f7ec0fca7babbb5971188118b5d16bd4a4669709e87`
- implementation manifest digest: `d755ab4a312328a1897e49991fcf0bbde322a289c479771f92ecff6e2b84a020`
- test manifest digest: `232f575d252e006b1c4517952967ce1d0bb39e4c01fdd8fec4de9c38e21c7082`

## verified behavior

One operation id owns one deterministic transaction slot. Every journal mutation is serialized, preverified, atomically replaced, reread, and semantically replayed. Exact retries append nothing. Changed identity or evidence under an existing operation id fails closed.

The closed event chain distinguishes reservation, prepared and uncertain dispatch, verified transport completion, binding closure, abandoned attempt, cancellation, acceptance, and quarantine. A completed transport cannot be abandoned. A new attempt ordinal is legal only after the prior undispatched attempt has a verified terminal binding receipt and an explicit abandonment event.

Transport completion binds the exact phase-3 dispatch, transport receipt, UTF-8 response byte count and digest, and a trusted execution-time witness. Start and completion must remain within the active phase-2 writer lease. The untrusted response is stored as a separate content-addressed blob and is independently reread before terminal acceptance or recovery.

Final acceptance requires the phase-3 host receipt to match the exact task, actor, parent, reservation, binding, sealed envelope, transport, cortex, lifecycle, and response evidence. No transcript is accepted or required.

The deterministic fixture reconstructed a fresh journal handle across 25 durable boundaries. It certified three accepted transactions, one safe abandoned-attempt rollover, one cancelled transaction, one quarantined transaction, five terminal outcomes, three exact recovered responses, zero duplicate events on exact retry, zero trusted-metadata leaks, zero continuity admissions, and zero Realm effects.

## verification

- 35 focused tests passed
- 432 full repository tests passed
- all 12 `CBJ` requirement rows passed
- all 14 append-only certification receipts and their declared historical links verified
- certification ledger digest: `1a10a7b9cb9d97d82a8e3d8ab26d865ae9359187fffa09fac4461fef7530ca97`
- source-lineage digest before the release-only commit: `091f073476d72b784e423d7ac9a0a9b13d336816954c3ba3fce6c9a521aa86a0`
- inline adversarial review found no unresolved critical defect
- no independent reviewer was used because this milestone was completed inline

## proof limits

This receipt does not certify a live Codex app task adapter, task-transport reconciliation, automatic binding lifecycle control, external dispatch, continuity-content admission, Godskills activation, Realm effects, cross-machine replication, hostile same-user isolation, Lunari integration, or universal filesystem and hardware durability. Those require later implementation and separate evidence.

