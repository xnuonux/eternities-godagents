# Resumable mission review kernel v1 certification

## certified source

The provider-neutral mission, review, and revision kernel is frozen at source commit `b1474c762880f243412229f87f5550bf8ed248c8`.

- certification receipt: `receipts/resumable-mission-review-kernel-v1.json`
- receipt digest: `f408426ed60ebfc35c0d987268f807352b5ab8430d15e23aa4bb20e9bbae6c7d`
- receipt file SHA-256: `5f83c6ca8c5af4326b6c2f00a7e079fccda2488853c9c90d57420a5821a8079c`
- deterministic fixture: `fixtures/resumable-mission-review-kernel-v1.json`
- fixture logical digest: `4e9b74d95df0b75b4d14aae04fd299cae484e099d39f2f77e91b373f589963c1`
- fixture file SHA-256: `bb01c0189f5a7e9df7f983c9adb01d386f1ce70f4e617ca00bba154e7d85eb7e`
- implementation manifest digest: `0a2ddd43e923a4818930e9007c5239fae72b4696696100b5c28ba33f8754885f`
- test manifest digest: `544a367e728f03881424cd152275fccc2a4bd049108b1a7e90a5f5fb83e9e6bc`

## verified behavior

The kernel admits one exact native-only or Godskills-reviewed mission under a separately pinned authority ceiling and completion-token budget. Native output is durably prepared, reconciled, executed, content-addressed, and committed before a deferred review is bound. The reviewed path permits one first review, at most one revision, and one terminal second review. A second revision recommendation rejects rather than opening an unbounded loop.

Every external phase is identified by its admission, executor descriptor, ordered prior-artifact inputs, round, and reserved completion ceiling. Recovery reconciles that exact request before dispatch. The deterministic fixture kills the first review after external completion but before journal commit, then reconstructs the mission without redispatch. It records one native dispatch, two review dispatches, one revision dispatch, zero duplicate completed dispatches, and zero executor calls on exact terminal replay.

The journal validates phase evidence before durable mutation, publishes canonical artifact bytes before their commit event, and replays the complete digest chain on every read. Inline adversarial review added regressions proving that a pre-admission result and a backward journal clock are rejected without replacing the last valid state. Changed admission, trust roots, executor descriptors, phase inputs, artifacts, required finding identities, usage, and journal bytes fail closed.

Input, cached-input, reasoning, visible-output, and completion usage remain separate. The fixture records 625 completion tokens across its native-only and reviewed missions. Later work that cannot reserve its admitted phase ceiling terminates through an explicit rejected verdict rather than dispatching or bricking recovery. Every descriptor, result, verdict, and completion records zero authority expansion and zero Realm effects.

## verification

- 42 focused tests passed
- 493 full repository tests passed
- all 12 `MRK` requirement rows passed
- two fixture builds reproduced file SHA-256 `bb01c0189f5a7e9df7f983c9adb01d386f1ce70f4e617ca00bba154e7d85eb7e`
- two receipt builds reproduced receipt digest `f408426ed60ebfc35c0d987268f807352b5ab8430d15e23aa4bb20e9bbae6c7d` and file SHA-256 `5f83c6ca8c5af4326b6c2f00a7e079fccda2488853c9c90d57420a5821a8079c`
- all 16 append-only certification receipts and their declared historical links verified
- certification ledger digest: `e338df83d5df64f4793bd23cb6694b4fa9ce8876e2d68944fac214b526021813`
- source-lineage digest before the release-only commit: `f3e4b4577bdb89f38a3d6295d5021ec36eeb7b9ea65db75a98a6bb57001e8685`
- inline adversarial review found no unresolved critical defect
- no independent reviewer was used because this milestone was completed inline

## proof limits

This receipt certifies deterministic coordination mechanics against trusted injected executors. It does not certify a live model or provider, hostile-executor isolation, review or revision quality improvement, automatic execution of a real Godskills evaluator package, default vessel wiring, current Codex desktop task controls, provider credentials, Realm action or compensation, continuity-content admission, personal-keel writes, delegation, daemon operation, cross-machine replication, Lunari integration, Inspiration, or Soul activation.
