# Operating guidance delivery implementation plan

> **For agentic workers:** Use `executing-plans` inline; the independent Prompt OS exporter is delegated with disjoint ownership.

**Goal:** Deliver host-selected, exact first-party operating guidance through actual native/review/revision senders without changing actor identity or unselected requests.

**Architecture:** Embed one optional `operatingGuidance` package in the existing externally pinned transport policy. Existing policy-derived transport descriptors and durable request digests bind the dependency selection and its migration. Share validation/composition across Grok CLI, OpenAI-compatible and Anthropic Messages. Do not change mission/Godskills/identity schemas or create another journal.

**Tech Stack:** Existing Node standard library and closed policy validators; Python standard library exporter in the separate Prompt OS repository.

**Spec:** `docs/audits/2026-09-09-astra-prompt-integration.md`.

## Global constraints

- Preserve the existing workspace-admission branch and user package-lock.json. No provider credentials, live calls, mutable policy pins or Soul activation in this slice.
- No guidance selection must preserve exact existing requests. An explicit null/unknown protocol/malformed package rejects.
- The package is host-authored configuration, never a field accepted from model output. The source URL is provenance, not authenticity proof.
- `schemaVersion:1`, `protocolId:eternities-operating-guidance-v1`, exact first-party `sourceRepository`, 40-character lowercase `sourceCommit`, nonempty ordered unique phase subset, 1..3 unique sections. Each section has id/path/sha256/text and a supported `prompts/modules/<id>.md` path. Package digest is SHA256 of canonical unsigned JSON. Unsigned UTF-8 package limit is 16384 bytes.
- Prompt OS exporter owns normalized source reading. Consumer validates exact bytes/hashes and host policy pins. No arbitrary quarry load, implicit runtime capability or claimed cryptographic source origin.
- Whole serialized request and completion limits remain enforced by the sender. Package bytes are not token counts.

## Task 1: selected guidance at all sender boundaries

Files: new `src/transports/operating-guidance.mjs`; three phase-policy and three phase-protocol modules; two JSON policy schemas; new `tests/operating-guidance.test.mjs`; test helper for synthetic first-party-shaped package.

- [x] Add tests through real request compilers: selected text enters system conduct, phase input/identity unchanged, excluded phase unchanged, altered bytes/overflow reject.
- [x] Observe RED against the current implementation which ignores selection.
- [x] Implement `validateOperatingGuidance(package)` and `phaseSystemPrompt({phase,base,policy})`; load-time and compile-time validation share the closed package contract.
- [x] Add optional top-level package to each existing pinned policy. Its bytes change the policy digest and descriptor automatically; removal under the old pin rejects. No new identity mutation path.
- [x] Run focused existing protocol/policy tests and new tests. Retain stable no-selection behavior.

## Task 2: actual process, recovery and exporter compatibility

Files: new `tests/operating-guidance-transport.test.mjs`; extend existing Grok process fixture only to expose request input at its already replaced inference boundary. Exporter files are owned by the Prompt OS worker.

- [x] Load a pinned policy with selected guidance and fresh real admission via `nativeDispatch`; execute through actual local process bridge. Assert exact selected text reaches the prompt file, then replay from a fresh transport with zero duplicate calls.
- [x] Check uncertain completion remains pending, stale policy/guidance cannot resume under another descriptor, and invalid package fails before child launch.
- [x] Build a package from the actual reviewed Prompt OS modules and verify it with the JS consumer. No production policy is edited.
- [x] Obtain independent review, focused integration gates, and preserve exact proof/remaining scope before committing.

## Delivery evidence and limits

The initial six compiler tests failed before implementation because selection was ignored. The initial five durable transport tests then failed because policies did not admit the new field. Both stages passed after their production changes. Expanded coverage now includes all three phases, exact Godskills/user input preservation, byte ceilings, policy migration, real process dispatch from fresh admission, intercepted HTTP sender dispatch, credential-free completed replay and uncertain-dispatch refusal.

- `node --test tests/operating-guidance.test.mjs tests/operating-guidance-transport.test.mjs`: 16 passed, zero failed/skipped, 1943.2509 ms.
- Focused existing phase protocol/policy and provider-neutral protocol certification gate: 35 passed, zero failed/skipped, 3268.0642 ms.
- Existing OpenAI-compatible, Anthropic and Grok durable sender/recovery tests plus OpenAI/Anthropic historical transport certifications: 54 passed, zero failed/skipped, 5675.2605 ms.
- Prompt OS `python -m unittest discover -s tests -q`: 55 tests, zero failures, one Windows symlink-privilege skip, 1.901 s. Missing/empty-content tests are separate and not skipped.
- Independent read-only review by Faraday (`01a08959-0329-7ce1-a10b-68d584a2f150`) found no remaining implementation blocker. The checklist and user lockfile scope findings are resolved here; pre-existing untracked `package-lock.json` remains untouched and excluded.

Actual normalized `continuity` and `tool-use` modules at Prompt OS commit `0e615a09f331a4f7cca7086f75c1ead1ddb86620` exported for native/revision passed the JS consumer. Their module files were independently checked unchanged against that commit before export. Package digest: `d4145db783a81af0406374e4c27e7d77dbab51655dd61532c3bdfea19fc5a119`. Continuity is 1222 UTF-8 bytes, SHA256 `5bdad19b3280e831bc26147081e8bd104147155d079faa3b9cf0c6cbd4799a09`; tool-use is 1765 bytes, SHA256 `27417163b8cc1ba7188246242ab17ab6e4f6d676f913c6e350c7005e5bb39382`.

This proves exporter/consumer compatibility and exact delivery/recovery using synthetic responses at the inference boundary. It does not authenticate third-party Astra provenance, prove live model quality, complete the coding loop, activate an actor, alter a deployed transport policy, or certify the unreleased workspace branch. The source URL/commit labels require host verification; hashes alone are not origin authentication. Existing historical receipts remain unchanged.

## Following dependent milestone

This plan completes guidance delivery, not the entire coding-loop promise. Continue the existing workspace-owner design to bind actual admitted proposal, revision, independent review/test, feedback, interruption and checked diff. Use the existing runner/mission recovery. The same-model live comparison follows the working loop with equal host opportunities and explicit current provider authority; do not substitute guidance fixtures for that outcome.
