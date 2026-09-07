# explicit reasoning-output profile and bounded live comparison

Base: `3cf0d2f3e77b47673054d531cbe8f759a82a300d`.
Standing authority: Dom approved implementation, verified integration and a small
MiniMax comparison. No OpenRouter, live service changes, Soul or Lunari integration.

Use `executing-plans` and `test-driven-development`. The observed MiniMax default
response mixes thinking into visible content. The prior split probe returned pure
JSON while keeping reasoning enabled. See the immutable earlier
[preflight](../../audits/2026-09-07-minimax-provider-preflight.md).

## implementation

- Allow one versioned named profile in the existing closed provider policy schema:
  `chat-completions-json-schema-reasoning-split-v1`.
- Only that profile adds `reasoning_split: true` before request serialization and
  hashing. Existing request fields, profile behavior, HTTPS and authority stay fixed.
- Require explicit measured reasoning usage for the new profile; do not report
  unavailable reasoning as zero. Preserve the historical default profile's semantics.
- Test policy loading/pinning/rejection, all three phase requests, measured response
  mapping and malformed/over-budget rejection. Run red tests before implementation.
- Independent source review, full integration gate, then bounded live evidence.
  No historical receipt regeneration or claim of new universal certification.

## live comparison

One twelve-job weighted-interval scheduling problem, one trial per arm, same model,
task text and native completion allowance. Baseline first, then one synthetic
Godagent identity through the real local workflow and provider SDK. Review/revision
overhead is measured rather than hidden. This is not enough trials for a general
quality or latency claim. Neither arm executes model code or external actions.

Independent scoring exhaustively enumerates all 4,096 subsets, verifies IDs,
uniqueness, compatibility, totals and optimality. The oracle has positive and
negative tests. Freeze task, oracle, runner, model, source hashes, budgets and
success conditions before calls. Refuse execution until the full integration
gate matches the source hashes. No automatic retries or outcome-driven changes.

Limits: baseline one call / 8,192 inclusive completion tokens; Godagent at most
four calls / 24,576 reserved inclusive completion tokens, including review/revision.
Each request at most 64 KiB, response 256 KiB, each arm at most 240 seconds for
network dispatch, with per-call deadlines. Credentials are process-only. The
existing transport handles persistent uncertain state; no re-dispatch bypass.

Operational scripts and pre-registered evidence live under
`D:\00-INDEX\operations\2026-09-07-godagents-minimax-comparison`.
The first inert preparation was preserved after the host rejected unsorted success
evidence; `candidate-2` uses sorted configuration and is prepared without calls.
No acceptance rule, task, oracle, model or budget changed in response to model output.

## completion report

Distinguish implemented adapter, measured full/targeted tests, independent review,
live compatibility, live task scores, and any blocked/rejected mission. Report
token categories, calls, wall time, exact commits and preserved evidence. A routing
stop or format rejection is not automatically a model reasoning failure.
