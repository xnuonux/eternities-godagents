# MiniMax provider compatibility preflight

Date: 2026-09-07. Godagents production base:
`1b71135b00fe5d9f98004f22b45a1b0fdd1534d9`.

Dom excluded OpenRouter and authorized the existing Grok route and MiniMax M3
credential for a small live test. Only the selected MiniMax credential was loaded
inside a local process from the existing Perseus credential source. No key,
provider response body, private project content or reasoning text is retained in
the safe reports or this repository. No services, live identities, routing, or
Railway configuration changed.

## routing discovery

Perseus source configures MiniMax's direct HTTPS Chat Completions endpoint.
Its lower-case logical model name is configuration evidence, not live model
validation. The [official MiniMax documentation](https://platform.minimax.io/docs/api-reference/text-openai-api)
names `MiniMax-M3`, recommends `max_completion_tokens`, and documents
`reasoning_split: true` as separating thinking from visible content without
disabling thinking.

Perseus separately confirmed its inspected Clovapi Grok profile points to the
xAI API, not a verified subscription-funded route. Its verified Grok subscription
transport is the native Grok CLI. The current Godagents policy requires HTTPS;
Clovapi's local HTTP endpoint is not silently admitted or redirected through an
unapproved substitute. OpenRouter was not used.

## two live synthetic probes

Endpoint: `https://api.minimax.io/v1/chat/completions`. Model: `MiniMax-M3`.
Each probe asks only for the English answer to two plus two in a one-field JSON
object. Each has a single-call exclusive attempt record, no retry, an 8,192-token
inclusive completion ceiling, a 90-second timeout, a 4 KiB request ceiling, and
a 256 KiB response ceiling. These are compatibility probes, not the planned
matched useful-task comparison or a Godagent mission.

| observed field | default request | documented reasoning split |
| --- | --- | --- |
| HTTP status, exact model echo | 200, matched | 200, matched |
| elapsed time | 3,090 ms | 2,517 ms |
| input / cached input | 205 / 128 | 205 / 128 |
| inclusive completion / reasoning | 58 / 49 | 86 / 80 |
| total tokens | 263 | 291 |
| pure JSON in visible content | no, embedded thinking | yes |
| exact requested answer schema | no | yes |
| independently checked answer | unscored due to envelope format | correct |

Total observed token usage is **554**, including **144** completion tokens.
Both responses finished normally and stayed under their requested completion
ceilings. This small sample is not latency benchmarking, structured-output
guarantees, a price receipt, a hallucination-rate measurement, or model ranking.

The default probe's `answerIsFour: false` field means the strict JSON parse did
not produce an answer object; it must not be interpreted as an arithmetic error.
The original probe source is preserved separately. The split probe uses a
nullable correctness field to avoid that ambiguity. The default response remains
immutable. No reasoning tags were stripped or response bytes repaired to pass.

## evidence locations

Local operational folder:
`D:\00-INDEX\operations\2026-09-07-godagents-minimax-preflight`.

- `probe-original.mjs`: SHA-256 `3ea59921a45608d8d697cf22f72cc0df95289f712e04ae3cfcbb115606386629`.
- `result.json`: SHA-256 `c23baaf0ac129a1b8c0b3058e2e47adc117a5574f70c95cdfc43c7a3bb21e4aa`.
- `split-result.json`: SHA-256 `b6f3e52abc332464ef3e1868d1bbe9cd3384f022a129361ee5315c7f7b50c219`.
- `attempt.json` and `split-attempt.json` prevent accidental repetition of either
  completed probe. `probe.mjs` is the current explicit probe tool.

The safe receipts retain request and response digests, numeric usage, timing,
format booleans and known model/endpoint metadata. Hashes bind bytes; without
retained raw responses they are not standalone reproducible provider evidence.

## next bounded implementation

The current [request compiler](../../src/transports/openai-compatible-phase-protocol.mjs)
does not emit `reasoning_split`. Its exact-JSON response check correctly rejects
default MiniMax thinking embedded in content. Therefore direct connectivity is
verified, but the existing Godagent workflow is **not yet live-qualified** on M3.

Add only an explicit, policy-pinned reasoning-output compatibility option after
test-first design. Do not disable reasoning, strip tags, silently mutate requests
inside fetch, loosen HTTPS, or weaken response/authority checks. Acceptance needs:

1. Existing default requests and historical policy behavior remain byte-identical.
2. The explicit option binds to the policy/request digests; unknown options reject.
3. Native, review and revision share the same bounded behavior and inclusive token
   accounting, with malformed or over-budget responses still rejected.
4. Independent review and the full integration gate for the production change.
5. A preregistered useful-task comparison against an unbound same-model baseline,
   with independent deterministic scoring, bounded calls/tokens/time, and no
   automatic retries. One clean toy response cannot substitute for this proof.

No new provider family, arbitrary request-parameter bag, model ranking claim,
Godskills duplication, Soul, or Lunari integration belongs in that milestone.
