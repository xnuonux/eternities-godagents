# Baseline response-shape diagnostics

## Reason for the change

Two closed MiniMax-M3 attempts did not produce a scored model-quality result.
The first stopped at `answer-envelope` after recording usage. The second received
HTTP 200 but stopped at `response-envelope`; its saved observation established
only that the expected first-message content was absent. The raw outer envelope
was not retained. These records do not identify the provider-side cause, show
model inferiority, or establish an outage or insufficient credit.

Historical records remain unchanged under:

- `D:/00-INDEX/operations/2026-09-08-godagents-minimax-effect-task-v2`
- `D:/00-INDEX/operations/2026-09-08-godagents-minimax-answer-diagnostic`

Their two one-call allocations, each reserving 8,192 completion tokens, are
closed. This repair makes no provider call and does not renew that allowance.

## Narrow implementation

[`runBaseline`](../../scripts/evaluation/baseline.mjs) now writes an exclusive
`response-shape.json` sidecar after the existing bounded response read, credential
safety gate, media-type check and JSON parse, but before response acceptance.
The numbered attempt journal and strict model, envelope, usage and answer checks
are unchanged. A sidecar write failure stops the attempt; it cannot overwrite
existing evidence, publish an answer or enable a retry.

The [closed projection](../../scripts/evaluation/response-shape.mjs) records:

- root, choices, message, usage and error-field types;
- model-match and first-choice-index checks, with no arbitrary model name;
- choice count and allowlisted role/finish-reason categories;
- content type/byte length, JSON parseability, root type and field count;
- outer `content` type and a fence-presence flag.

It does not copy answer text, hidden reasoning, provider error codes/messages,
unknown field names, tool names or arbitrary enum values. It is explicitly
non-authoritative: it proves neither response acceptance nor execution, attribution,
quality, cost or the cause of a provider failure. Provider-specific errors are not
decoded. Non-JSON, wrong-media-type, unsafe and oversized bodies retain their
existing stop categories without a sidecar. New experiments must pin the new
projection module alongside the runner; historical frozen scripts are not rerun.

## Verification and limits

The [baseline tests](../../tests/evaluation-baseline.test.mjs) first failed for the
missing sidecar in five new cases. A separate valid-response collision regression
failed because the old implementation accepted the answer despite existing
evidence. After implementation, all 20 baseline and controlled-comparison tests
passed. Tests exercise the actual runner, journal and filesystem with controlled
responses, not a live provider.

Independent read-only review found no critical or important defect and cleared
this narrow change subject to full-suite success. The integration log and final
source/evidence pins belong under
`D:/00-INDEX/operations/2026-09-08-baseline-response-shape`.

The fresh full suite passed **1,328 tests**, with zero failures, cancellations,
skips or todos, in 615,955.3049 ms (exit 0). The full log SHA-256 is
`225994a261a1f6b3ed8a15b840004957c7ef34703ada70191239e4cc60d4bb3d`.
This is a regression gate, not a new live-provider or product certificate.

This is improved evaluation evidence, not MiniMax qualification, a new provider
adapter, a Godskills activation change or universal Godagent product completion.
The next live attempt needs fresh registration and an authorized bounded allowance.
