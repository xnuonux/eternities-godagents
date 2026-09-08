# Source-gated task comparison implementation plan

> **For agentic workers:** Use `executing-plans` for sequential implementation; keep the two arms isolated rather than delegating shared mutable state.

**Goal:** Run one fresh, preregistered native-versus-Godagent task comparison with independently scored artifacts and explicit physical-resource accounting.

**Architecture:** Compose the existing evaluation helpers and local v2 workflow. The host supplies approved model settings and a trusted local oracle; the runner does not select providers, create authority or dynamically execute acquired code. Preparation is inert and separate from dispatch.

**Tech Stack:** Node 24 ESM, node:test, canonical JSON, existing exclusive filesystem publication and bounded dispatch.

**Spec:** `docs/evaluation-diagnostics.md`, `docs/local-artifact-workflow.md`, and the source audit at `D:\00-INDEX\operations\2026-09-07-effect-only-snapshot-smoke\next-comparison-source-audit.md`.

## Global constraints

- No OpenRouter, paid inference, implicit retry, Soul activation or Lunari integration in implementation tests.
- Preserve old attempts and Godskills frozen source roots. The visual pilot is separate.
- Initial network profile is explicitly OpenAI-compatible reasoning-split, matching the existing bounded dispatcher. Do not label that adapter universal.
- Unknown cache detail remains null. Reserved completion budget, measured completion/reasoning/visible tokens, physical calls and elapsed time remain separate.
- Task success is separate from transport completion. Native refusal, pending, rejected and needs-decision retain their original meanings.

## 1. Inert preregistration and source gate

Create `scripts/evaluation/comparison-preparation.mjs` and `tests/evaluation-comparison-preparation.test.mjs`.

Interface: `prepareComparison({directory, preregistration, expectedDigest})`.
The preregistration binds a protocol version, one task payload, oracle source pin,
approved model/profile and resource allocations, explicit baseline request bytes,
the prepared Godagent manifest/digest, deterministic arm order, and named source
file digests. The expected digest is supplied separately by the operator; computing
it is not authorization to spend. The initial implementation accepts no dispatch
callback and reads no credential.

- [ ] Write tests asserting altered task, resource allocation, source file or workflow manifest fails before a ready record exists. Occupied directories must remain untouched.
- [ ] Verify closed fields, positive finite resource ceilings, canonical bounded regular files, exact bytes/digests and disjoint mutable output/workflow locations. Resolve aliases before comparing paths.
- [ ] Compare actual baseline task content to the Godagent mission payload under one explicit mapping. Reject additional task requirements in only one arm. Preserve host-wrapper differences as treatment, not alleged context equality.
- [ ] Exclusively publish a bounded preparation record after all checks. Persist no oracle answers in subject payloads. Prove preparation makes zero fetch/socket attempts.

## 2. Sequential two-arm execution

Create `scripts/evaluation/comparison.mjs` and `tests/evaluation-comparison.test.mjs`.

Interface: `runComparison({preparationPath, expectedPreparationDigest, host})`.
`host` is a trusted in-process implementation, not serialized configuration or a
module loaded from an acquired repository. It owns the credential-safe response
check, local oracle and network implementation. Their exact registered source
pins must match preparation; callback identity is not established by a caller's
arbitrary label or self-reported digest.

- [ ] Add controlled-response tests for correct, valid-but-wrong and malformed answers; the same oracle receives content from both arms and records quality independently of attempt status.
- [ ] Use `createBoundedDispatch` for both physical transport paths, with separately approved per-arm reservations and the same selected model/profile. Wrap the Godagent host factory rather than bypassing authenticated v2 execution.
- [ ] Reverify preparation/source bindings before dispatch; create exclusive per-arm attempt directories. Run `runBaseline` and `runGodagent` in the preregistered order, preserving failures and prohibiting reuse.
- [ ] Record transport snapshots separately from aggregate mission usage. Never double-charge measured mission tokens or refund uncertain reserved work. Record oracle errors as unscored, not incorrect model output.
- [ ] Publish a canonical comparison only from recorded outcomes. Bind task, source, preparation, artifact and oracle evidence digests. Mark incomparable runs explicitly instead of selecting a winner.

## 3. Real-runtime offline qualification and live handoff

Extend `tests/evaluation-real-workflow.test.mjs`; document `docs/evaluation-diagnostics.md`.

- [ ] Exercise an actual created/admitted v2 workflow with controlled HTTP and a separate native baseline. Include denied authority, uncertain dispatch, changed input, artifact tampering and no-credential replay checks.
- [ ] Use the existing scheduling fixture only as development coverage, not fresh held-out evidence. Before live dispatch, freeze a new task and independent oracle with all acceptance requirements in both subject payloads.
- [ ] Independently review source ownership, task equality, resource enforcement and reporting. At integration, run the required gates, preserve exact receipts and merge verified work under standing approval.
- [ ] Obtain the exact current approved endpoint/model and total spending ceiling before any live trial. No deployment, credential lookup or live invocation follows automatically from this plan.

## Completion evidence

The runner is implemented only when altered preregistration prevents dispatch,
both real paths obey their budgets, the shared oracle distinguishes correctness
from completion, uncertainty never triggers retry, and resulting reports preserve
unknown usage. Live usefulness is a later claim requiring the actual preregistered
trial; passing these development tests cannot establish superiority.
