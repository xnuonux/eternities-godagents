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
- [ ] Independent review, targeted verification, commit. Only then consider a
  separately recorded diagnostic live attempt with a new explicit purpose and
  bounded envelope. Preserve qualification 1 permanently. Do not merge unverified
  behavior or claim the live deployment qualified.

Non-goals: no full provider-output capture, new acceptance profile, generic
telemetry framework, automatic retry, billing assumption, pilot, Soul or Lunari.
