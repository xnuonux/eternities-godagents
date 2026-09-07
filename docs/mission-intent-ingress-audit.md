# Mission intent ingress: evidence and migration boundary

Status: architectural recommendation, not an implemented protocol or certified
release. Inspected Godagents `b0957727023e8e40a2f01f07a43f19d42a84fc63`
and Godskills `2ccdacf8ae04aceaff417de7c27fb3885b0bb7b7` on 2026-09-07.

## What exists

| Boundary | Evidence | Consequence |
| --- | --- | --- |
| Mission ingress | `schemas/identity-bound-mission-vessel-request.schema.json`; `src/runtime/identity-bound-mission-vessel-contracts.mjs:176-193` | Closed v1 request includes objective, requestedAuthority, explicitMethodRequests, and hostCeiling. No explicit requested-effect declaration or interpretation proposal. |
| Host authorization | `src/host/admitted-sealed-identity-launch.mjs:83-116` | Requested authority must fit policy; the request ceiling must equal pinned host context; budgets remain bounded. |
| Skill binding input | `src/runtime/identity-bound-mission-vessel.mjs:90-108` | Mission text, authority, methods, observation and ceilings cross the adapter. There is no semantic proposal field. |
| Routing transport | `src/skills/godskills-adapter.mjs:267-286` | Constructs a new v1 natural request with text and context only. Merely attaching an extra property upstream cannot carry it through this boundary. |
| Source identity | `src/skills/mission-binder.mjs:193-221` | Source envelope binds text, observation, genome, authority, Realm, release and applicable activation/preference roots. A future interpretation needs an explicit binding here and on recovery. |
| Existing semantic hook | Godskills `src/intent-contracts.mjs:75-132`; `src/intent-compiler.mjs:367-375,414-429` | Natural requests already accept a semantic proposal. Effects are unioned with lexical inference, not granted as authority. Candidate IDs still require lexical support. |

The existing proposal is not a general effect-declaration interface: it requires
nonempty candidate IDs, required capabilities and effects. It cannot honestly
represent a known native task with no skill candidate, or an explicit unknown
effect assessment. Creating an irrelevant candidate merely to fill that schema
would reproduce the semantic failure in a different field.

The adapter can already carry a valid receipt-backed no-qualified-route result
into native execution. The vessel tests distinguish it from needs-decision and
verify recovery without another inference. This is transport/runtime evidence,
not evidence that the current compiler can reliably produce that classification.

## Alternatives

1. **Pass the existing proposal through unchanged.** Least code, but it retains
   mandatory candidates, lexical rejection and inferred false positives. Useful
   only within its existing narrow contract; not the general solution.
2. **Version a mission interpretation boundary.** Separate effect assessment
   from capability selection. Permit a source-bound host declaration for a known
   structured task and a bounded semantic proposal for natural-language input.
   Require host validation and independent execution-time controls. Recommended.
3. **Clarify every unsupported sentence.** Safe fallback, but not a useful default
   for ordinary autonomous work. Retain it for genuine ambiguity, not as a
   substitute for proving the interpreter works.

## Recommended invariants

- Intended effects, permitted effects, and actual executed effects are different
  objects. None may be substituted for another.
- Distinguish known effect sets from unknown or conflicting assessments. An empty
  candidate list does not mean an empty effect set, nor does unknown mean read-only.
- Keep host declarations separate from model suggestions. A digest proves source
  binding, not semantic correctness or authorization. Never let a proposer label
  itself host-approved.
- Bind an assessment to the exact mission, observation/source epoch, interpreter
  version or host declaration provenance, and applicable protocol version.
  Recovery rejects changed assessments, source state and unsupported versions.
- A known native task may have no useful skill. A contradictory or unknown task
  still requires resolution. Skill eligibility cannot silently resolve effects.
- Do not silently drop an intended effect that exceeds the host ceiling. Surface
  the conflict without inference that assumes authorization.
- A proposal cannot expand credentials, tools, identity, constitution, budgets,
  evolution, Realm hands or personal-keel ownership. Actual tools and artifact
  publishers remain constrained independently of intent interpretation.
- Preserve v1 behavior and historical receipts. Any extension is explicit,
  negotiated and receipt-bound; it is not a silent field added to closed v1.
- Do not make users author schemas for normal conversation. Structured hosts can
  supply declarations; free-form requests need a qualified interpretation path.
  Count its cost and latency in evaluation rather than hiding preprocessing.

## Next bounded implementation milestone

First reconcile this recommendation with the Godskills owner's protocol analysis.
Then freeze a shared contract and implement the smallest end-to-end vertical
slice: legitimate host ingress, source-bound interpretation, adapter transport,
verified selection/no-selection, and replay. No new agent identity subsystem,
model service, permission system, or general semantic framework.

Acceptance evidence must include:

1. Known local artifact intent without a useful skill reaches the permitted
   native workflow with its declared write requirement preserved.
2. The same intent without write permission stops, rather than dropping write.
3. Unknown/conflicting intent remains unresolved even with ample permissions.
4. Forged provenance, stale mission/observation binding, unsupported versions,
   mutated assessments on recovery and attempted authority expansion fail.
5. Ordinary v1 requests and old receipt verification remain unchanged.
6. Fresh natural-language cases, frozen before evaluation, measure omissions,
   false positives, useful no-selection, selected-task quality, overhead and
   unnecessary abstention. The already exposed heldout set is regression evidence
   only, never fresh qualification.
7. Live comparisons include interpretation overhead in the assisted arm and use
   the same task information and outcome oracle for the unbound baseline. A
   structured-host comparison must not be presented as general language quality.

No release pin adoption, paid inference, Soul activation or Lunari integration is
authorized by this document. Those remain separate existing authority boundaries.

## Producer boundary refinement

`examples/local-artifact-workflow/run.mjs:22-69` already requires an externally
supplied expected manifest digest, verifies the prepared mission/policy/provider
hashes, and forwards the verified mission snapshot to launch. Reuse this trust
boundary. Hashes inside an otherwise attacker-controlled document do not by
themselves authenticate a producer.

The proposed first producer is a structured workflow adapter that knows its
configured operation, such as publishing a local artifact. It must not guess
effects from prose, borrow a card, or manufacture an assessment from expected
benchmark answers. Bind its descriptor through trusted host policy and bind its
assessment to the canonical original mission request, including observation,
source epoch and host ceiling. Exclude the assessment itself from its subject
digest to avoid a circular hash; the outer request/manifest binds both together.

Proposed minimum assessment fields for protocol coordination are protocol ID,
subject digest, known/unknown/conflicting state, requested effects, unresolved
decisions, and producer descriptor digest. These are not a frozen wire schema.
The consumer treats the assessment as intent data, not as authority. A producer
descriptor digest is checked against host policy, never trusted from its label.

The Godskills comparison at `c613f1a` recommends a known-capability-only pilot.
That pilot is insufficient for this milestone: the already verified nonempty
candidate constraint prevents the required understood-but-uncovered task.
Preserve the existing hook for supported cases, but do not require a new pilot
to demonstrate this same structural limitation again. The next contract must
represent effect knowledge independently from capability selection.
