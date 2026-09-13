# Multi-file export inspector: useful delivery, bounded agent result

Base: `02290554df678cf3824edb9ae3369429fe06888c`.
Test-first admission seed: `b1849bad6c0b3d877c04fb34a44170decc6fc181`.
Delivered example: `73212bb1744ea4a3669e92d7eee346a210995718`.

## Delivered capability

`examples/workspace-export-inspector/` is a three-file local browser tool for
the actual `src/workspace/revision-export.mjs` bundle. It shows a file sidebar,
before/after panes and verified text hashes. It rejects malformed fields, hashes,
paths and text, handles UTF-8/BOM/empty files, and prevents old asynchronous hash
work from restoring cleared or changed views. It has no provider, personal keel,
network API, approval, execution or apply capability. Its README supplies a
loopback-only static-server command and names the1MiB/64-file limits.

Text hashes do not authenticate provenance, identity, release signatures,
revision ancestry or execution safety. The UI says this explicitly. An actual
revision-store/export round-trip test verifies compatibility without an adapter.

## Real Grok trial

First preparation:
`D:/00-INDEX/operations/2026-09-12-grok-export-inspector`.
It stopped before provider dispatch. A pure reconstruction of the owner's
request reproduced:
`identity-bound-mission-vessel-request /mission/objective maxLength4096`, with
4837 characters. No provider-phase files or model call were created there.

The compact equivalent brief used a fresh operation:
`D:/00-INDEX/operations/2026-09-12-grok-export-inspector-compact`.
Frozen registration:
`84afb8862652d33b6b0e97f8874e47fc1f27a8c15d0a6d3d844b0a63741e62b1`.
Only the Godagent arm was dispatched; the reused preparation's plain template
remained inert. This was not a matched quality experiment.

One native Grok4.6 CLI subscription call, low reasoning,8192 completion-token
ceiling,90 seconds, no tools, personal memory, subagents, MCP or Grok keel.
Inference and staging took86164ms. Verified reported usage:17497 input,0 cached,
6179 completion,1526 reasoning,4653 visible tokens. Actual subscription charge
and internal physical call count are not independently known.

The host accepted the three-file proposal into revision
`401ff5cf4982401ddcba73ecac1c3643bf9a019ec0ddc56b000c31562577b06e`.
The untouched parent is
`d5471149398029e7377137d2a5975dedc52f85249a7e6453b44503e39a526a5f`.
That proves proposal acceptance, not usable code. `node --check` found an
unterminated quote at viewer.js:67. No approval, passing browser receipt or
checked export was issued for the raw candidate. Its source and receipts remain
unchanged in the operation's revision store.

## Host corrections and verification

The coordinator read the full generated source before execution, corrected the
quoting defect in the repo copy, then ran the independently written tests.
Further checks reproduced an accepted unpaired-surrogate path and incorrectly
positioned desktop panes. Both were fixed with failing-then-passing checks.
Redundant NUL checks were simplified and UI labels made explicit. No runtime
authority or model-routing code changed.

Two separate stateless Grok review assignments, one for raw source and one for
the corrected source, produced no usable verdict. Neither was retried in place.
The final review stopped at usage-accounting validation; accounting is unknown,
not zero. There is no independent-review approval claim. Final delivery rests
on coordinator code review and reproducible direct verification, not a model's
assertion that it is correct.

The seed failed both the parser success test and real browser path before
implementation. The final focused release gate passed27 tests, zero failures
or skips,3895.6653ms. It includes all8 new inspector tests, the8-case restricted
browser suite, actual exporter compatibility, delayed real-WebCrypto races for
clear/edit/new inspection, desktop/mobile geometry, and existing revision store
and export regressions. Tests live in `tests/export-inspector*.test.mjs` and
`tests/helpers/export-inspector-cases.mjs`. Browser tests are opt-in through the
existing pinned runtime environment variable. Desktop/mobile screenshots were
inspected; there was no horizontal overflow or page error. Evidence is in
`release-checks.log`, `visual-result.json`, `inspector-desktop.png` and
`inspector-mobile.png` under the compact operation.

No full runtime certification was regenerated for this example-only change.
The original app seed in each operation and user package-lock.json were
preserved. No paid API fallback, interactive Grok settings, Soul or Lunari change.

## Next critical path

`src/host/workspace-owner.mjs` packs all file text into mission.objective, while
`schemas/identity-bound-mission-vessel-request.schema.json:28` caps it at4096
characters. The generated implementation itself is larger than that budget, so
shrinking this initial brief does not qualify its next repair cycle. Before a
larger coding trial, design and test an explicit bounded source-context path
that keeps purpose separate from file content and binds both to the request,
authority and context budget. Do not silently increase global/model context,
add receipt layers unrelated to this failure, or claim general coding readiness.

The useful inspector is delivered. Autonomous multi-file agent reliability,
independent review completion and broad product qualification remain open.
