# reasoning-split adapter and live comparison outcome

Date: 2026-09-07. Base `3cf0d2f3e77b47673054d531cbe8f759a82a300d`.

## implemented and verified

The existing OpenAI-compatible provider policy now accepts the explicit profile
`chat-completions-json-schema-reasoning-split-v1`. Only this profile adds
`reasoning_split: true` before serialization and hashing. It never disables
thinking or strips response tags. Native, review and revision use the same path.

The profile requires explicit integer reasoning usage and preserves the existing
nonnegative, inclusive completion, cache and total-token checks. The default
profile's request and response behavior remains unchanged. Policy changes require
new pins; arbitrary parameter bags and unknown profile versions remain rejected.
No HTTPS, identity, authority, Godskills release or historical receipt was changed.

Test-first evidence: the new policy/request tests initially failed because the
schema rejected the profile and the compiler omitted the field. A separate
response-accounting regression then failed because missing reasoning usage was
accepted as zero. The minimal changes made all three tests pass. See
[tests](../../tests/openai-reasoning-split-profile.test.mjs).

Full integration: **1,137 passed**, zero failed/cancelled/skipped/todo, exit 0,
915,074.7188 ms, using `node --test --test-reporter=tap --test-concurrency=2`.
Log: `D:\00-INDEX\operations\2026-09-07-godagents-reasoning-split\full-integration.tap`.
SHA-256: `61056b60249f635ae17334b844f722ae2ca33cb57bc66bdf7678f2e474fd2aa4`.

Independent reviewer Singer (`01a07c4f-2280-7d10-9287-1b4f67301430`)
reported no findings in the adapter scope and independently passed three new plus
32 legacy targeted tests. Operational comparison review also cleared after
clarifying that "unbound" means no Godagent architecture, not unsplit transport.
Both arms intentionally use the same supported output format. Review evidence is
in the same operational folder. No new certification receipt was issued.

## live comparison did not qualify the workflow

The frozen experiment used one twelve-job scheduling task, one raw same-model
baseline and one prepared synthetic Godagent identity. An independent exhaustive
oracle, separately tested, finds optimum 48. Task, oracle, runner, source hashes,
model and call/token ceilings were frozen before calls. Neither arm executed tools.

| arm | observed outcome | what it does not establish |
| --- | --- | --- |
| direct MiniMax baseline | process stopped at `baseline-dispatch`; no usable result retained; no retry | provider status, usage, answer correctness and exact failure category are unavailable; this is not evidence of poor model reasoning |
| Godagent | `needs-decision` before provider invocation, zero model calls, null artifact | no live completion, artifact quality or amplification result |

The baseline harness has a real observability defect: its catch handler suppresses
even the safe failure category. That must be corrected before any fresh comparison;
do not rerun this attempt, infer zero spend, or invent missing response evidence.
`baseline-failure-summary.json` records the limited coordinator observation and
is explicitly not a provider receipt.

The Godagent's unresolved decisions were:

```text
authority:external-read
authority:external-write
effect-authority:external-write
intent-ambiguous
unsupported-effect:external-write
```

Actual objective: "Select the maximum-total-weight compatible subset of the
supplied jobs. Produce one scheduling result, without tools or external actions."
The host correctly refused authority absent from the fixed local envelope. No
permission was granted to make the experiment pass.

Read-only diagnosis in Godskills at observed HEAD
`2ccdacf8ae04aceaff417de7c27fb3885b0bb7b7` reproduced:

- Original objective: inferred effects `external-write, local-read`; all five
  unresolved decisions above.
- Changing only "without tools or external actions" to "without external actions"
  removed the inferred external write, but external-read and intent ambiguity
  remained. This was a compiler-only diagnostic, not a changed or rerun experiment.
- `src/intent-compiler.mjs:210` recognizes explicit external actions but its
  negation exemption requires adjacent "without external actions". Coordinated
  negation is missed. Candidate scoring still selects Hephaestus 19, Beacon 18,
  Agora 13; the excluded external-action vocabulary contributes to those scores.

The exact reproduction was relayed to the Godskills task
`01a03c38-8589-79d2-a007-bf4c128304af` for bounded regression/repair and migration
coordination. Its files and the Godagents trust pins were not changed here.

## evidence and next dependency

Operational root:
`D:\00-INDEX\operations\2026-09-07-godagents-minimax-comparison`.
The initial rejected inert setup is preserved. `candidate-2` contains the frozen
registration, prepared workflow, gate, attempts, failure summary and Godagent result.
The Godagent result digest is
`7f268719ca694fcef0e8b21cd4559c7ead607ca483bdbc52bc42fad394d9b3d7`.
The baseline attempt digest is
`270f0f3b982a4ba46aa7ea722e1e65ad9621a2b1b5fb1a4f9df9b6189202310f`.

Next: repair baseline diagnostics, obtain a certified routing repair or explicit
architectural resolution, migrate its pins through the normal dependency boundary,
then preregister a fresh comparison. Do not bypass unresolved routes or treat
structural integration success as live product completion. Soul, evolution and
Lunari integration remain excluded.
