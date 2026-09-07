# Local Artifact Workflow Implementation Plan

> **For agentic workers:** Use `executing-plans` inline. The tasks share one workflow and are not independent implementation assignments.

**Goal:** Make the existing admitted provider-backed host usable through a prepared local workspace and safe, replayable artifact export.

**Architecture:** Compose current creation/admission, pinned host construction, and run/recovery APIs in an example host. Preserve the launch CLI's closed projection and current authority boundaries. Keep prepare provider-free and require an explicit manifest digest for execution.

**Tech Stack:** Node 24+, ESM, node:test, existing repository modules only.

**Spec:** `docs/superpowers/specs/2026-09-07-local-artifact-workflow-design.md`

## Global Constraints

- No new dependencies, live provider spending, copied skill bodies, or changed release pins.
- No Soul, evolution, arbitrary repository edits, external tools, or Lunari integration.
- Preserve historical receipts, fixtures, and the untracked package-lock.json.
- Use short-lived branch `feat/local-artifact-workflow`, based on `c1e31536f6f093e30bb2a69a85ac44e8c46f33a5`.

## Task 1: checked artifact publication

Create `examples/local-artifact-workflow/artifact.mjs` and `tests/local-workflow-artifact.test.mjs`.

Interface: `writeAcceptedArtifact({ directory, artifact, expectedDigest, maximumBytes })` returns `{ path, artifactDigest, bytes, replayed }`. It accepts only a non-null digest-matching snapshot, writes one content-addressed canonical JSON file exclusively, rejects links/non-files/conflicts/oversized input, and never executes content.

- [ ] Write tests before implementation. The central assertions are:

```js
const first = await writeAcceptedArtifact(input);
assert.equal(await readFile(first.path, 'utf8'), '{"content":"checked answer","schemaVersion":1}\n');
const second = await writeAcceptedArtifact(input);
assert.equal(second.replayed, true);
await assert.rejects(writeAcceptedArtifact({ ...input, expectedDigest: 'a'.repeat(64) }));
```

- [ ] Run `node --test tests/local-workflow-artifact.test.mjs`, observe the missing behavior, then implement and rerun.
- [ ] Cover conflict preservation, symlink rejection, null acceptance, input snapshot isolation, and byte limits with literal expected content and real filesystem operations.

## Task 2: provider-free preparation and pinned run

Create `examples/local-artifact-workflow/prepare.mjs`, `run.mjs`, and `tests/local-artifact-workflow.test.mjs`.

Interfaces: `prepareLocalWorkflow({ workspace, configuration })` returns the manifest path and digest; `runLocalWorkflow({ manifestPath, expectedManifestDigest, env, createProviderPhaseHostImpl })` calls the existing launcher and exports an accepted result. The host-factory seam exists only to supply the existing SDK with a controlled network transport in tests, never as a CLI option. Configuration explicitly supplies creation/admission inputs, provider policy/family, request, release/routing pins, host policy ceilings, and materialization limits.

- [ ] Write a real preparation test with a transport that throws on any call. Assert the admission/policy/request files exist and are validated, and the returned manifest is inert.
- [ ] Write rejection cases for an occupied workspace and changed manifest/input bytes before runtime construction.
- [ ] Implement preparation using existing local admission, provider SDK descriptions, classifier, and identity policy/request validators. Publish the manifest last. Do not erase a partially prepared workspace on failure.
- [ ] Exercise run and repeat run through real host components with only controlled provider responses. Assert a verified artifact exists and replay has no additional provider execution.
- [ ] Test a pending/rejected terminal result produces no accepted artifact, and output conflicts preserve prior bytes.

## Task 3: operator entrypoint and verification

Create `examples/local-artifact-workflow/cli.mjs` and `docs/local-artifact-workflow.md`. Modify `src/host/provider-backed-cli.mjs` only if exposing its existing terminal validator is necessary; its CLI projection must remain identical.

- [ ] Add closed `prepare --config PATH --workspace PATH` and `run --manifest PATH --manifest-digest SHA256` parsing. Resolve configuration input paths against the config file's directory; never accept credentials in argv.
- [ ] Document the existing creator/finalization prerequisites, explicit provider policy and limits, inert preparation, artifact retrieval, replay, ambiguity boundaries, and unqualified live behavior.
- [ ] Run targeted example and existing provider-backed CLI tests with compact output. Request independent review of the bounded diff.
- [ ] At final integration only, run the full suite with two workers and a preserved TAP log. Reconcile upstream and merge/push only if the observed gates and review pass. Do not regenerate historical receipts.

Standing user approval covers routine in-scope implementation, tests, verified integration, and push. New paid evaluation or materially wider authority is not included.
