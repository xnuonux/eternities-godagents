# Godagents current state and bounded completion path

Review date: 2026-09-06. Baseline: `07b1d53ff2ef6440ceaa3ad540c10cb7f48062cb`
on `main`, reconciled with `origin/main`. Remote:
`https://github.com/xnuonux/eternities-godagents.git`.
This is a product and release-process review, not a new certification.

Latest verified follow-up, 2026-09-08: runtime `61251c7` connects the native Grok
subscription host to the full v2 local artifact workflow. All 1,314 integration
tests passed. One real admitted scheduling task produced the independently
verified optimum, published its artifact, and replayed in a fresh process with
zero observed Grok executable attempts. See the
[exact evidence and limits](audits/2026-09-08-grok-local-artifact-workflow.md).
The subsequent [matched Grok comparison](audits/2026-09-08-grok-matched-development-comparison.md)
completed on `66ef6ce`: both arms returned the same optimal answer, with 37.40%
more reported input tokens for the Godagent. This is one development sample,
not general quality superiority. Exact context-cost profiling now identified a
duplicated objective. The [opt-in objective view](audits/2026-09-08-grok-native-objective-view.md)
preserves the original input while reducing this recorded request by 8.7445% in
bytes; it remains unqualified for live behavior or token savings. Next product
work is a multi-step or interruption-sensitive workflow, not another synthetic
transport probe. MiniMax remains a candidate; its two latest
attempts stopped at response-format boundaries without a scored quality result.
The dated follow-ups below retain their historical scope rather than redefining
past results as current product completion.

Integrity follow-up, 2026-09-07: the bounded compatibility and immutability
repair at `5e82afe7a967e7afa2c4a3a4e2cab24b7be67d43` passed all 1,119
integration tests and independent review with no blocking findings. The
[repair audit](audits/2026-09-07-integrity-repair.md) records the source, log
digest, deferred coverage note, and interrupted-test recovery. Historical
receipts are unchanged; no new current-head or live-host certificate is claimed.

Operator-path follow-up, 2026-09-07: the [local artifact workflow](local-artifact-workflow.md)
at `82e9f52b99621731302d0e7151f13cde49c49f0e` composes inert preparation,
explicitly pinned execution, verified artifact retrieval, and same-mission replay.
All 1,131 integration tests passed; independent review's rejection-outcome finding
was resolved. The [workflow audit](audits/2026-09-07-local-artifact-workflow.md)
records the exact proof and limits. This advances the local operator path, not
live useful-task qualification or universal completion.

Recovery follow-up, 2026-09-07: bounded [process-recovery evidence](audits/2026-09-07-local-workflow-process-recovery.md)
covers real process death during uncertain dispatch and after provider completion
is persisted but before artifact publication. Fresh-process recovery makes no
observed network attempts, including credential-present replay. This is not
remote exactly-once execution, power-loss durability, or live model quality.

## what exists and what it proves

Effect-only integration follow-up, 2026-09-07: main `b4c599aa49e59061c8d926262fdfa228db47b18e`
adds a structured local-artifact effect declaration, separately pinned Godskills
routing/verifier source captures, single-attempt routing journal, versioned outer
admission/completion, and authenticated v2 host launch through the existing native
kernel. The full suite passed 1,230 tests with no failures or skips. Historical
ledger and release lineage verified 69 receipts; a fast-forward preserved the
exact tested commit and 34 focused post-integration checks passed. Evidence:
`D:\00-INDEX\operations\2026-09-07-effect-only-snapshot-smoke\godagents-b4c599a-gate-status.json`.
Full log SHA-256: `6978f7bd4d40eb355d01dcea6d339aa1065c0c361277a45807a2c9012a824111`.
See [the migration decision and checkpoints](effect-only-vessel-migration-decision.md).
This does not issue a new v2 release certificate, promote the Godskills feature
to its main branch, or establish live model-quality gains.

The original operator-path gap was concrete: the v1 provider-backed and portable
identity factories construct review/revision dependencies and cannot launch a v2
native-only policy. At that point the root SDK and local-artifact workflow had not
exposed the separate native-only facade. The subsequent explicit v2 path below
closed that seam without changing the v1 factories.

The [effect-only SDK launcher](effect-only-sdk-launch.md) now adds a separate,
explicit v2 facade over an issued provider or portable host's native port. It
preserves the v1 factories, screens credentials, rejects dependency injection,
and exercises authenticated execution/replay through a controlled portable host.
Both registered provider families also complete the authenticated path using
controlled HTTP responses: denied write intent makes zero calls, successful
native artifact publication makes one, and replay makes no additional calls.
This is offline integration coverage, not live provider/model qualification.
The local artifact workflow now prepares and executes explicit v2 manifests,
publishes only facade-issued terminal artifacts, and exercises denied authority
and uncertain-dispatch replay offline. Integration at `8b9e993` passed all 1,239
full-suite tests and 26 post-fast-forward checks; see the
[integration audit](audits/2026-09-07-effect-only-operator-integration.md).
Live useful-task qualification remains open.

The formerly proposed effect-only operator outcome above is implemented, not
the next unfinished task. As of 2026-09-08, the immediate critical path is the
[pinned Grok subscription adapter](audits/2026-09-08-grok-subscription-phase-transport.md),
bounded live transport qualification, and separately preregistered within-model
comparisons. MiniMax and subscription Grok are candidates; neither a transport
probe nor structural fixtures establish better task outcomes. Preserve v1
behavior, authority ceilings and historical receipts. Do not infer provider
selection, broaden authority, or use a paid fallback. Judge qualification and
exact resource/contrast binding remain gates before claiming improvement.

Native-phase follow-up, 2026-09-08: the [Grok live qualification and diagnostic
audit](audits/2026-09-08-grok-live-qualification-and-diagnostics.md) records a
successful production-suite native call and fresh-process reconciliation on
runtime `4cd4cfa`. The host explicitly pins reported `grok-4.6-build` separately
from requested `grok-4.6`; no model-equivalence claim follows. All 1,309 full
integration tests passed. This clears native transport compatibility, not live
review/revision, a full effect-only host launch, or task-quality improvement.
The later `61251c7` follow-up at the top closes one useful-task qualification
through the operator path. A separately registered same-model baseline remains
open. MiniMax still needs valid response-format qualification; its original
failure remains unclassified and its newer format failures are preserved.

Evaluation follow-up, 2026-09-07: [bounded diagnostic helpers](evaluation-diagnostics.md)
provide offline-tested attempt preservation, baseline dispatch/validation and
Godagent outcome accounting. They are not yet a source-gated live comparison CLI.
The prior failed live experiment remains failed and its receipts are unchanged.

Reasoning-profile follow-up, 2026-09-07: the explicit split-output profile passed
1,137 full integration tests and independent review. The subsequent live experiment
did **not** qualify the workflow: the baseline harness lost failure diagnostics,
and the Godagent stopped on a reproduced negation/ambiguity routing problem before
any model call. See [adapter and comparison evidence](audits/2026-09-07-reasoning-split-profile.md).
No broader completion or live-quality claim follows from the adapter tests.

| surface | implementation evidence | usable boundary and remaining proof |
| --- | --- | --- |
| public package | [package.json](../package.json), [SDK](../src/sdk/index.mjs) | `@eternities/godagents` 0.2.0 exports the root SDK and economics entrypoint. SDK protocol v1 self-describes as experimental and separately versions itself 0.1.0. Source availability is not verified package-registry publication. |
| modular creation | [creator CLI](../src/creator/local-cli.mjs), [creation](../src/creation), [genesis](../src/genesis), [profile](../src/agent/profile.mjs) | Catalog, preview, finalization, local genesis and capability profiles exist. A supported character-creation-to-use experience across external hosts is not yet established. |
| basic runnable vessel | [demo](../scripts/run-demo.mjs), [local host](../src/host/local-cli.mjs), [vessel](../src/runtime/vessel.mjs) | The demo uses a fixture cortex and counter Realm. The network-capable local CLI still constructs a fixture Realm. Neither is proof of useful external tools or production task performance. |
| provider-backed identity path | [CLI](../src/host/provider-backed-cli.mjs), [phase SDK](../src/host/provider-phase-host-sdk.mjs), [CLI certification](provider-backed-identity-cli-v1-certification.md) | Real policy/admission preflight and native, review, revision wiring support Anthropic Messages and OpenAI-compatible protocol families. Its receipt explicitly certifies deterministic no-network execution, not live provider quality. |
| persistent mission mechanisms | [mission program](../src/runtime/mission-program.mjs), [review kernel](../src/runtime/mission-review-kernel.mjs), [Realm](../src/realm), [forensic index](../src/runtime/mission-forensic-index.mjs) | Bounded local programs, replay, review/revision, report-only delegation, consequence/compensation interfaces, accounting, and cross-program forensic indexing exist. Hosted durability, arbitrary rollback and remote exactly-once execution do not follow from them. The forensic index was added in `11ba017`, so audit v6's proposal to build it is stale. |
| selected Godskills | [mission binder](../src/skills/mission-binder.mjs), [activation adapter](../src/skills/activation-adapter.mjs), [release verifier](../src/skills/release-verifier.mjs) | Host-pinned releases and bounded mission packages bind capability before inference without granting authority. Selection and structural checks do not establish an improvement in model outcomes. |
| external host qualification | [dossier](../src/host/external-host-qualification.mjs), [receipt](../receipts/external-host-qualification-v1.json), [certification](external-host-qualification-v1-certification.md) | Contract-only qualification records 12 focused and 1,096 full historical tests, zero provider calls and `liveQualification: false`. Codex, Claude Code, MCP and local-model host operation are not live-qualified by this dossier. Review is explicitly not independent. |
| Soul and evolution | [dormant Soul port](../src/soul/dormant-port.mjs), [architecture](architecture.md) | Soul activation and governed evolution remain excluded/dormant. No consciousness or phenomenological claim is proved. |

## release integrity findings

1. **Current-head publication could falsely imply completion.** The previous
   builder wrote `status: certified` and expected passing counts before running
   the Godagents suites. A failed or killed process left those bytes behind.
   The interrupted candidate `f14a4526ba953aff7282e1465e79094f1e02b937a1bb5055f4f5ed1e6c41a42c`
   is structurally verifiable, but its completed run was not recovered. It must
   not be promoted on that basis. Publication repair is tested in
   [current-head-publication.test.mjs](../tests/current-head-publication.test.mjs):
   six of seven cases failed before repair, including actual process
   interruption; all seven passed after repair. A separate targeted integration
   run passed all 14 tests before review. Independent review then identified
   missing Godskills worktree cleanliness and post-test checkout checks. Four
   additional failing regressions reproduced those attribution gaps; all 11
   publication tests passed after repair. These are targeted results, not a
   new full-suite claim.
2. **Historical verifier compatibility repaired, 2026-09-07.**
   Before repair, verifying the artifact stored at `b8354a3`, whose source
   is `ae46906321983a7fe67511754a731b1a06877fad`, failed with
   `SDK root export set mismatch` even with current-ref freshness disabled.
   [current-head-certificate.mjs](../src/integration/current-head-certificate.mjs)
   let pre-qualification profiles inherit the new export list and selected the
   pre-adversarial profile for the post-adversarial/pre-qualification interval.
   The repair separates the pre-external-host SDK/protocol/boundary profile
   from the current profile and selects it for the post-adversarial interval.
   [Historical regressions](../tests/current-head-historical-compatibility.test.mjs)
   verify unchanged receipts on both sides of those release boundaries.
   Newer exports/protocols and omitted historical evidence remain rejected.
   No historical receipt bytes were changed.
3. **Dossier immutability repaired, 2026-09-07.** A returned dossier's nested
   `hostDescription.authority` was mutable. A local probe changed
   `realmEffects` after verification. Re-verification rejected it, so this probe
   does not demonstrate an executed authority expansion. The repair recursively
   freezes the validated private copy, leaving caller-owned input mutable.
   Construction and verification reject post-validation authority and phase-list
   mutation. See [repair evidence](audits/2026-09-07-integrity-repair.md).
4. **Sibling certification issuance needs a separate bounded audit.**
   [the external qualification builder](../scripts/build-external-host-qualification-v1-receipt.mjs)
   also writes a preliminary certified receipt before its full suite. Historical
   builders are not widened into the current-head repair. Existing measured
   receipts remain historical records; future use of unreviewed issuers must
   not be treated as an automatically safe release workflow.
5. **Failure diagnostics and proof labels need discipline.**
   [runTests](../scripts/lib/certification-support.mjs) buffers output and reports
   only a generic failure message. Digests establish content binding, not an
   authenticated record that a test ran. Fixture, measured test, live run,
   independent review, and product evaluation are separate claims.

The publication repair preserves stored-snapshot verification at recorded
sources. The publishing command and direct current-head verifier still require
exact current refs. It uses observed summaries, verifies before publishing,
and atomically replaces only the artifact. The constant certification document
must already match the protocol. This is process-interruption protection, not
an OS-level power-loss or hostile same-user isolation guarantee.

## architecture that remains stable

- Godagent: persistent governed actor and host-owned capability policy.
- Godskill: independently usable capability guidance, with optional qualified
  routing and review mechanisms. It never grants authority.
- Keel: continuity with explicit ownership and admission boundaries.
- Realm Contract: observable state and permitted effects.
- Cortex: replaceable model interface. Model changes need qualification, not
  invented changes to actor identity.
- Optional Soul: separately governed future system, not a label conferred by
  this runtime.

Godskills does not require Godagents. Godagents must not copy skill bodies into
its runtime or make a universal skill pack dependent on its receipt machinery.

## finite critical path

```text
truthful release publication
  -> historical compatibility and dossier immutability repairs
  -> one documented usable local host path
  -> budgeted real-task qualification and interruption recovery
  -> second independent host adapter portability check
  -> experimental v1 release decision
```

The alternative is continuing to add portable contracts and certificates first.
That preserves narrow local coverage but postpones the user-visible question.
The selected path reuses existing components and tests them through one actual
workflow. Reconsider it only if that workflow reveals a necessary missing
contract; add that contract with the failing user scenario attached.

The next product milestone is **one operator can create an agent, give it a
bounded task, obtain and verify a useful artifact, interrupt it, and resume the
same mission without repeated effects**. Use one explicitly selected provider
and a disposable local repository with reversible edits. Existing interfaces
should be composed before introducing new abstractions.

Acceptance evidence must include:

- a fresh checkout walkthrough that does not require editing runtime source;
- stable identity, admitted capability envelope and host effects policy;
- native output plus optional selected review, with selection and cost visible;
- an independently checked useful output, not only a structurally valid receipt;
- cancellation, transport ambiguity and process-restart tests that preserve
  evidence and never retry an uncertain effect automatically;
- measured input/output/cache tokens where available, wall time, failures and
  explicit spending ceiling; unavailable provider data is labelled unknown;
- an unbound/native baseline on the same task and comparable budget;
- a second provider/host run before claiming portability beyond the first;
- a clear list of capabilities not qualified, rather than a universal success claim.

Live spending requires a separately bounded authorized evaluation. No live
provider work is part of this review. Distributed society, hosted multi-tenancy,
new skill families, autonomous evolution, consciousness, and Lunari integration
are explicit non-goals. Completion means meeting the named acceptance tests,
not pursuing an unlimited sequence of adjacent layers.
