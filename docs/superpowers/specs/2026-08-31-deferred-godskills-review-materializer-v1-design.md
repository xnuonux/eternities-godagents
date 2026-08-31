# Deferred Godskills review materializer v1

Date: 2026-08-31

Status: implementation design

## Purpose

The certified mission review kernel preserves adaptive Godskills review decisions
as body-free deferred descriptors and guarantees that native output is committed
before review execution. It deliberately has no mechanism that opens the exact
selected Godskill entrypoint and contract after that boundary.

This milestone adds that missing materialization boundary. It converts one
prepared review request plus its exact committed subject context into one
bounded, content-addressed review package. It does not call a model, choose a
reviewer, revise an artifact, or grant authority.

Godskills adaptive evaluator packages are not used here. Their current Aegis v2
receipt is a task-specific retrospective scorer and explicitly records no
Godagents activation. A deferred Godskill review instead needs the selected
Godskill's own entrypoint and capability contract.

## Invariants

1. Construction verifies the complete pinned Godskills release without reading
   any selected Godskill entrypoint or contract body.
2. Materialization accepts only a verified mission admission and a prepared
   `review` phase request under its exact executor descriptor.
3. The request must bind the admitted Godskills binding and the canonical digest
   of the supplied subject artifact.
4. Every deferred descriptor must remain `scheduled-not-executed`, correspond
   one-to-one with a review-mode activation decision, and match the selected
   capability's entrypoint and contract hashes in the verified release.
5. Only those exact deferred entrypoints and contracts are read.
6. Round one accepts a native subject and no prior review. Round two accepts a
   revision subject plus the exact first-review artifact bound by the request.
7. The package contains no filesystem path, credential, Realm hand, continuity
   writer, personal-keel writer, model route, provider configuration, or effect
   grant.
8. A host-supplied byte ceiling is enforced over the complete canonical package.
9. Changed release bytes, admission, request, descriptor, subject, prior review,
   capability body, or package bytes fail closed.
10. A caller-provided artifact cache is only an optimization surface. Preloaded
    values are not trusted, and mutation of a returned capability map cannot
    alter a later verified cache hit.

## Trust boundary

`createDeferredGodskillsReviewMaterializer` receives the same independently
pinned release object used by the Godskills mission binder. It reuses the
existing release verifier, including repository containment, real-path checks,
portable-manifest validation, activation-root verification, and exact artifact
hashes.

The returned materializer identity binds its protocol, verified release digest,
and materialized-package byte ceiling. That identity is stable and can later be
bound into a review executor descriptor.

The materializer trusts the mission review journal to supply context from its
already verified committed artifacts. It independently checks canonical artifact
digests against the prepared review request. Standalone materialization is not a
claim that an artifact was durably committed; the kernel remains the ordering
authority.

## Package contract

The closed package contains:

- protocol and schema version;
- materializer identity and exact Godskills release digest;
- mission id, admission digest, review request digest, and round;
- Godskills cycle, activation-root, and binding digests;
- sorted selected review capabilities with exact entrypoint and capability
  contract text, with the contract identity validated by parsing rather than
  duplicating its full object in the package;
- the exact subject artifact and, for round two, the exact prior-review artifact;
- an authority projection fixed to zero expansion, zero Realm effects, zero
  continuity admission, and zero personal-keel writes;
- one digest over the complete unsigned package.

The package deliberately carries the mission objective and success/stop evidence
already admitted by the kernel. It carries no transcript or unrelated task
history.

## Round semantics

Round one requires request inputs `godskills-binding` and `subject`, where the
subject is one native artifact. `priorReview` must be null.

Round two requires `godskills-binding`, `prior-review`, `revision`, and `subject`.
The revision and subject digests must be identical, the subject must be a revision
artifact, and the prior review body must hash to the bound prior-review digest.

## Acceptance requirements

- DRM-001: release verification reads no deferred skill body.
- DRM-002: exact round-one materialization reads only selected deferred bodies.
- DRM-003: exact round-two materialization binds subject and prior review.
- DRM-004: changed release, admission, request, descriptor, or context fails.
- DRM-005: stale, reordered, duplicated, disclosed, or non-review selections fail.
- DRM-006: unknown fields, oversized output, and authority-bearing context fail.
- DRM-007: package bytes and logical digest reproduce exactly.
- DRM-008: existing mission-review and Godskills integration tests remain green.
- DRM-009: forged or caller-mutated release caches cannot replace verified state.

## Proof limits

- no model or provider call;
- no review quality claim;
- no arbitrary evaluator-package execution;
- no standalone proof of durable journal commitment;
- no revision executor;
- no automatic vessel or Codex task integration;
- no Realm action, continuity admission, personal-keel write, evolution,
  Inspiration, Lunari, or Soul activation;
- no independent review while the user requires inline-only execution.
- release identity remains bound to the configured local repository root in the
  inherited v1 release verifier.
