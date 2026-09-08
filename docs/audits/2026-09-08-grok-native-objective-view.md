# Opt-in Grok native objective view

Runtime source: `bb5a0ab091019117dd96a98d2925b7885d85cf3b`.
Parent: `5303cf94a6368569fae823cd91e0537def8ebbef`.

## Outcome and boundary

The compiler can now present an exactly duplicated native mission objective once,
with a fixed reference. It retains all identity, authority, capability, causal,
continuity and digest fields. Original dispatches, packages, admissions and
completion identities are unchanged. This is not a new agent architecture,
skill body, generic compression framework or authority layer.

The default remains the complete original request. Opt-in uses the externally
pinned Grok provider policy field:

```json
"nativeContextProfile": "objective-reference-v1"
```

Selecting it changes the policy digest and therefore operational transport
descriptors. Prepare a new pinned mission; do not edit an already-admitted policy
or reinterpret a historical journal. Preserve old policies for old work. Omitting
the field in a new policy restores the baseline. Review, revision and non-Grok
providers do not use this presentation profile.

## Exact offline result

`D:/00-INDEX/operations/2026-09-08-grok-objective-view/offline-compare.mjs`
reconstructs the previously completed matched-development mission using the real
candidate and native dispatch compilers with a memory-only capture transport.
It performs no credential read, real transport construction, provider call,
journal write or identity mutation.

| Measurement | Result |
| --- | ---: |
| Original full request | 14,592 bytes |
| Opt-in request, including explanatory text and digest wrapper | 13,316 bytes |
| Difference | 1,276 bytes, 8.7445% smaller |
| Exact original input reconstructed | yes |
| Default request matches previously recorded digest | yes |

The unchanged default digest is
`40e3bd7dfa9b19f5a882035bcea9af662d031c6dfcb94349b34ad58884fefda7`.
The compact request digest is
`67da35e5ce8d65be47632990d6f512825408e2af2bb8a76e69b1f5bc31fc3ba4`.
The exact original candidate and dispatch digests also match the completed run.
`offline-result.json` records the source hashes, script hash and proof scope.

This comparison deliberately holds the original descriptor constant to isolate
compiler bytes. A real operational policy migration derives new descriptors and
admission pins, as required above. The compact profile has not been run against a
live model. Bytes are not tokens; no measured billing, subscription quota,
latency, answer-quality or general efficiency gain follows. Short objectives can
make the wrapper larger than the original. No automatic selection or promotion
is warranted from this one measurement.

## Verification

Three new compiler/policy regressions failed before production implementation:
unsupported policy field, unchanged wire despite the opt-in, and unknown profile
silently accepted. The first targeted codec/policy/protocol/transport run passed
25 tests. A further controlled child-boundary test exercises the transmitted view
and credential-free durable replay; all seven transport tests then passed.

The codec tests cover exact Unicode/escaping reconstruction, detached immutability,
explicit byte bounds, mismatched objectives, unsupported versions/references,
and rehashed metadata tampering against an independently held source digest.
Compiler checks cover unchanged review/revision bytes and unchanged completion
identities. The default-path offline comparison above additionally tests against
historical request bytes rather than a newly generated expectation.

Independent architecture and implementation review by the same dedicated
reviewer found no concrete blocker, conditional on the integration gate. The
review was not a live model-quality assessment.

The full `node --test --test-reporter=tap` run passed **1,321 tests** with zero
failures, cancellations, skips or todos, exit 0, in 650,034.4807 ms. Main then
fast-forwarded to the exact tested runtime `bb5a0ab`. Affected merged-head codec,
policy, protocol, transport and local-artifact-workflow gates passed **33 tests**,
exit 0, in 7,389.0389 ms. Production/test sources did not change during either
gate; this documentation closeout is separate from the runtime commit.

Logs are `bb5a0ab-full-suite.log` and `bb5a0ab-post-merge.log` under the operation
root above. `integration-closeout.json` records their hashes and exact commands.
Historical certificates were not rewritten or upgraded. Passing this suite is
regression evidence, not a new universal or live-model certificate.

## Next useful proof

Keep the profile opt-in. A later separately frozen, within-model comparison must
test both task behavior and actual reported usage before claiming improvement.
Do not use this small wire change to postpone the larger product milestone:
one interruption-sensitive, useful workflow with stable identity, saved work,
independent output checks, and no duplicate completed effects after restart.
