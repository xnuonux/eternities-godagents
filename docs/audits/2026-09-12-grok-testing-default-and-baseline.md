# Grok testing default and baseline diagnostics

Runtime candidate: `e76af3ec36d9b4993cfc2310a4480e17e6589e84`, based on main
`cadc4b36b82d696c82e9e8d2c609c4eb561f37d3`. This is a bounded operational tooling
change, not a new agent certification or comparative quality result.

## Delivered

Project `AGENTS.md` records Dom's native Grok 4.6 subscription default for testing
and review. The existing pinned phase process enforces a disposable home/workdir,
one tool-free turn, no personal memory/subagents/web/MCP inheritance, and exact
system-prompt override. No interactive Grok settings or Codex keel changed. The
binary and bridge matched their existing September 10 SHA256 pins; browser,
driver and Node pins also verified before the new trial. No paid fallback.

The new `scripts/evaluation/grok-baseline.mjs` records verified numeric usage
before downstream answer/proposal/staging failure, reusing production accounting
and the exclusive no-retry journal. Six new tests cover strict rejection, usage
retention, real revision success/preimage failure, original preservation, evidence
collision, attempted-slot reuse and trusted-versus-forged diagnostic labels.

One sterile Grok subscription review found that known dispatch/screen categories
were being remapped. The coordinator reproduced it RED, then fixed the narrow
diagnostic fallback and verified GREEN. Review used one call and reported 15667
input and 3667 completion tokens, including 3455 reasoning tokens. The reviewer
did not independently execute tests; its findings were evaluated by the host.

## Verification

The initial three new collector tests failed before implementation. The initial
combined gate passed34 tests. After real-store/persistence tests and the review
correction, the collector/journal gate passed14, and the collector/structured-output/
policy gate passed17. The final full serial integration gate passed1505 tests,
zero failures, seven explicit browser-runtime opt-in skips,1512 total,
1198499.7197ms, exit0. Log:
`D:/00-INDEX/operations/2026-09-12-grok-baseline/integration-final.log`.
The earlier `integration.log` was interrupted for the review correction and is
not a completed gate. Historical certification receipts were not regenerated.

## Fresh comparison, still inconclusive

Operation: `D:/00-INDEX/operations/2026-09-12-grok-workspace-comparison`.
Registration digest:
`f8c81754a86ab4a9a32628b432c0ca2ad482ef5b29c7b248b9543325331fa3f3`.
Same task-list fixture, outer schema, exact source, review opportunity and browser
suite; Grok4.6, low reasoning,8192 inclusive completion tokens,90 seconds and one
dispatch per arm. Frozen random order: plain first, Godagent second.

Plain consumed one call and reached `workspace-stage-failed`. Its durable journal
retains verified usage:11368 input,0 cached,3418 completion,2947 reasoning. This
demonstrates live accounting retention through a downstream failure. A separate
non-inference inspection confirmed the store opens and its saved parent verifies.
The proposed replacement was not retained, so the precise staging rejection is
unknown. It is not evidence that the model produced incorrect application logic.

The frozen protocol requires the first arm to stage before the second; therefore
the Godagent arm was not dispatched. No retries or old-slot reuse. No browser
execution or new export occurred in this sample. The earlier September 10
Godagent success remains separate evidence, not a matched result for this trial.

Before further live comparisons, persist a screened bounded prepared replacement
and separate actual store rejection from result-publication failure. Verify that
forensic path locally before spending another model call. Do not reconstruct
missing answers or relabel failures as successes. Original app source and the
user's untracked package-lock.json remain unchanged.
