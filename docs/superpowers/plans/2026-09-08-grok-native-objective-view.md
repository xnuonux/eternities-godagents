# Grok native objective view implementation plan

> **For agentic workers:** Use `executing-plans` inline. These steps share one compiler boundary.

**Goal:** Remove one exact duplicated objective without changing host semantics.

**Architecture:** An opt-in Grok compiler view wraps the verified native input,
replaces one objective with a fixed reference, and verifies lossless reconstruction.
Existing policy and final request digests bind selection and bytes.

**Tech Stack:** Node >=24, ESM, node:test, existing canonical JSON/SHA256.

**Spec:** `docs/superpowers/specs/2026-09-08-grok-native-objective-view.md`

## Global constraints

- Node >=24; no new dependencies.
- Default request bytes, original dispatch/package/receipts and other phases stay unchanged.
- No credentials, live inference, global configuration, Godskills or identity mutation in this implementation batch.
- Preserve user-owned untracked package-lock.json and all historical evidence.

## Task 1: Pinned, lossless native wire profile

Files: create `src/transports/grok-native-objective-view.mjs` and
`tests/grok-native-objective-view.test.mjs`; modify
`src/transports/grok-cli-phase-policy.mjs`,
`src/transports/grok-cli-phase-protocol.mjs`,
`tests/grok-cli-phase-protocol.test.mjs`, and
`tests/grok-cli-phase-policy.test.mjs`.

Interfaces: `buildGrokNativeObjectiveView(input, {maximumBytes})` returns the
deep-frozen closed wrapper. `restoreGrokNativeObjectiveView(view,
{expectedInputDigest, maximumBytes})` returns the exact frozen original input or
throws a closed `view-invalid` error. It never obtains trust from the view alone.

- [ ] Add failing compiler and pin tests before production edits. Core assertions:

```js
const full = compileGrokCliPhaseRequest({phase, dispatch, descriptor, policy});
const compact = compileGrokCliPhaseRequest({phase, dispatch, descriptor,
  policy: {...policy, provider: {...policy.provider,
    nativeContextProfile: 'objective-reference-v1'}}});
assert.notEqual(compact.requestDigest, full.requestDigest);
const view = JSON.parse(JSON.parse(compact.body).messages[1].content);
assert.deepEqual(view.input.missionPackage.mission.objective,
  {$ref:'/modelProjection/mission/objective'});
```

- [ ] Run `node --test tests/grok-cli-phase-policy.test.mjs tests/grok-cli-phase-protocol.test.mjs` and preserve intended failures.
- [ ] Add codec tests for round-trip, detached freezing, byte ceilings, Unicode and escaping, mismatch, changed metadata, and rehashed tampering against an external expected digest. Implement only fixed reference reconstruction:

```js
const restored = structuredClone(view.input);
restored.missionPackage.mission.objective = restored.modelProjection.mission.objective;
if (sha256Value(restored) !== expectedInputDigest) fail();
```

- [ ] Load the optional field only under exact policy validation; compiler rejects unknown values and invokes the codec only for native. Keep original output schema, response and receipt machinery.
- [ ] Run the three targeted test files plus `tests/grok-cli-phase-transport.test.mjs`; retain closed failure evidence and green result. Independently reconstruct the saved live request in a new offline output, never overwriting the historical profile.
- [ ] Review full diff independently. Resolve confirmed defects test-first. Commit exact owned paths only.

## Task 2: Integration and honest handoff

- [ ] At final integration gate, run the full suite with bounded console output and a durable TAP log; fetch/reconcile upstream, merge verified branch and rerun affected merged gates before push.
- [ ] Record exact source, commands, counts, hashes, offline byte delta and limits in an audit. Keep profile opt-in and unqualified for live model behavior. No claim of quality, token, billing, or latency gain from offline bytes.
- [ ] Update current-state and README with a concise capability/limit link. Push verified main under standing approval. Next product work remains a multi-step/interruption-sensitive user workflow, not another evaluation platform.
