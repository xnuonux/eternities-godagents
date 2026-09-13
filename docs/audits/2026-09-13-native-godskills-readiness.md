# Native Godskills consumer readiness

Coordination-only review returned by the Godskills task on September 13 while
the Godagents native operator batch was in progress. This note is **not** a new
release verification, skill activation, certification or measured quality gain.

The colleague inspected Godskills main
`6aee69ba6d25b17474d2ece48280df4a4c620642`, held checkout
`3615b355e7dafbf2efe9e6c6bb3373458eba6119`, and Godagents `9dfd9a7`.
It reports both Godskills checkouts clean, hashed selected receipts, and did not
run verifiers, suites, providers or modify source. Its observations need fresh
verification at any actual integration boundary.
The Godagents owner separately rechecked the main commit and all four artifact
hashes in the table below during this batch; they matched. That read-only check
does not substitute for release-closure verification.

## Confirmed native gap

`src/host/native-host-binding.mjs` and `src/host/pi-native-session.mjs` explicitly
leave Godskills inactive. They bind actor/grant/request/history but do not bind a
selected Godskills package into the native stream. The successful native coding
mission did not test this missing consumer.

## Smallest recommended next consumer

Add an optional, host-owned skill-binding input, disabled by default. Reuse
`src/skills/local-recoverable-godskills-adapter.mjs` and `mission-binder.mjs`, not
another skill engine, automatic Pi discovery or copied third-party skill bodies.

Inputs must pin the release, routing and activation roots; actor eligibility and
forbidden families; mission/source epoch; host effects and authority; at most
three selected skills; a real package-byte bound; and truthful review availability.
Persist the resulting receipt and exact disclosure digest with the native
actor/session/mission. Validate before **every** provider call and reopen.
Compaction validates continuity without inventing another route or activation.
Start with one immutable selection per mission association; changes are an
explicit binding epoch/migration, not silent reuse of the request digest.

Preserve the existing modes: native discloses no selected body; guardrail uses
compiled contract constraints; method uses only the permitted selected verified
entrypoint and contract; review remains scheduled, not executed, until an actual
later phase exists. No skill creates file/process/network permission. Use the
intersection of host grant, constitution, Realm, mission and actor eligibility.

## Required proof before activation

1. Real Pi SDK scripted-provider tests observe exact disclosure in the four
   modes, with no accumulated duplicate injection or personal context discovery.
2. Corrupt roots, authority enlargement, oversize context, missing references,
   source drift and pending binding fail before provider entry.
3. Same-state resume and compaction preserve the exact selection receipt.
4. Explicitly absent skill binding preserves all current native behavior.
5. A separate matched outcome study, not these mechanics, establishes benefit.

The previously negative candidate result and host confound in Godskills
`docs/audits/2026-09-08-incident-refinement-closeout.md` remain negative/unresolved
evidence. Do not activate or recertify that candidate incidentally.

## Observed pins supplied by the Godskills task

| Artifact | Observed SHA-256 |
| --- | --- |
| `receipts/godskills-system-certification-v3.json` | `228ba0a63d252f0c37178ff3de8c1278d0ea878e9abeb173e7faea699f28fb57` |
| `receipts/agent-native-router-v8.json` | `b32500d810ba66539334cbe3ae5ef31223dbf712197a061779fc21f75048ebf3` |
| `receipts/portable-capability-manifest-v1.json` | `f78f6aded5198e8db1591af49fe97285307427d93396b34c78dd6e5f2466f33d` |
| `artifacts/portable-capabilities/manifest.v1.json` | `ab81495770ceede97522f140260354fbdff54da7b4824ca52046d473c9d5917a` |

These are teammate observations, not replacement trust roots. Existing
`release-verifier.mjs` must verify the entire relevant closure at integration.
No dependency root or activation was changed during this operator batch.
