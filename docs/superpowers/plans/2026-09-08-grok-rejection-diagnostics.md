# Grok rejection diagnostics implementation plan

> Execute inline with test-driven-development and executing-plans under standing approval.

Goal: make a rejected live adapter response diagnosable without saving provider
text, hidden reasoning, credentials, or weakening acceptance.

Evidence: live qualification 1 on runtime `5d3d0ba` returned `response-invalid`
in 7,170 ms. Native auth was fresh; binary/bridge pins unchanged. The preserved
failure binds response SHA256 `a8b75d3e13f706d8de6106c9ee60e3bdb983c7fb6c65b156bb6e1f8e15318587`
but no acceptance stage or field-presence evidence. No retry has occurred and
the exact cause is unknown. Do not guess a model failure or relax the codec.

Design: the codec attaches one closed rejection-stage enum. A provider-specific
diagnostic projector produces only known field types, bounded numeric counters,
presence/count facts, and bindings to policy, dispatch, request and response.
The Grok suite saves this in the non-authoritative sibling namespace
`grok-rejection-diagnostics-v1/<phase>-<dispatchDigest>.json` outside the strict
operation slot, before rethrowing the unchanged rejection. Use
exclusive creation and exact idempotent comparison, refuse junctions/symlinks,
and never follow an arbitrary provider-supplied path. Diagnostic persistence
cannot turn a rejection into success or initiate another provider call. Existing
failure receipts and recovery protocols remain unchanged.

- [x] Write red codec/diagnostic tests for missing ledger, malformed text and
  secret-bearing unknown fields. Assert fixed stage, numeric provenance and
  absence of arbitrary strings, hidden reasoning and output text.
- [x] Implement `src/transports/grok-cli-rejection-diagnostic.mjs` and closed
  stage propagation in `grok-cli-phase-protocol.mjs`; run targeted tests.
- [x] Write a red suite test: a synthetic real child omits a required ledger
  field; rejection leaves bound safe diagnostics and unchanged terminal replay.
- [x] Add synchronous, bounded, provider-specific persistence in the suite.
  Test existing-file conflicts and symlink refusal without provider redispatch.
- [x] Independent review, targeted verification, commit. Only then consider a
  separately recorded diagnostic live attempt with a new explicit purpose and
  bounded envelope. Preserve qualification 1 permanently. Do not merge unverified
  behavior or claim the live deployment qualified.

Non-goals: no full provider-output capture, new acceptance profile, generic
telemetry framework, automatic retry, billing assumption, pilot, Soul or Lunari.

## Evidence-driven follow-up: explicit reported deployment pin

Diagnostic 2 on `23b4bbe` isolated usage-accounting rejection: one model row
existed, but not under the requested `grok-4.6` name. Diagnostic 3 used a
separately reviewed one-shot observation script, the same durable engine and
unchanged acceptance codec. It observed the exact row `grok-4.6-build`, complete
additive counters, one reported model call, and a correct synthetic arithmetic
artifact. These are deployment observations, not proof of model equivalence.

The bounded follow-up is an optional `provider.reportedModelId` policy pin,
restricted to `grok-4.6` or the observed `grok-4.6-build`. Omission preserves the
old exact-name policy. The request still selects `grok-4.6`; the receipt preserves
the actual ledger key and separately records the reported name when different.
The suite binds replay verification to the host policy, never to a receipt's
claimed expected name. Changing the pin changes the complete policy digest.

- [x] Red tests: explicit deployment policy admission and old-pin rejection;
  explicit-name-only codec acceptance, receipt tamper/default rejection;
  all-three-phase completion and auth-free replay under the new host pin.
- [x] Implement in `grok-cli-phase-policy.mjs`, `grok-cli-phase-protocol.mjs`,
  and the policy-bound verifier closure in `grok-cli-phase-transport.mjs`.
  Thirty adapter tests pass; original receipt representation remains unchanged.
- [ ] Independent actual-diff review and commit, then one newly recorded native
  compatibility qualification using production suite and exact new source pin.
- [ ] Final integration gate before merge/push. Preserve all failed attempts.

No inferred alias table, fallback, arbitrary new model acceptance, billing
claim, public model-equivalence assertion, quality pilot or architecture change.
