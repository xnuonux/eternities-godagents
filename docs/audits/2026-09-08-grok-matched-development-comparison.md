# Grok matched development comparison

## Result

Both the plain Grok arm and the Godagent arm returned the **same optimal answer**
on one 16-job weighted-interval-scheduling problem. The independently checked
schedule selected jobs 02, 03, 06, 09 and 11, with total weight 134.

| Observed metric | Plain Grok | Godagent through Grok |
| --- | ---: | ---: |
| Correctness | optimal | optimal |
| Input tokens, including cache | 11,193 | 15,379 |
| Cached input tokens | 0 | 128 |
| Completion tokens | 1,760 | 1,600 |
| Reasoning tokens, within completion | 1,718 | 1,558 |
| Visible-output tokens, within completion | 42 | 42 |
| Input + completion tokens | 12,953 | 16,979 |
| Observed arm time | 27,895 ms | 27,152 ms |

The Godagent arm used 4,186 more input tokens, **37.40%** above the baseline.
Reported input-plus-completion tokens were **31.08% higher**. Completion tokens
were 9.09% lower and elapsed time 2.66% lower, but one sample cannot establish a
completion-efficiency or latency advantage. Actual subscription charges and
remote physical inference counts are unknown. Nominal CLI cost fields are not
proof of billed charges or subscription-quota consumption.

**No answer-quality improvement was demonstrated.** This is not a failure of the
governed workflow: both arms completed correctly. It is evidence against claiming
that the extra architecture inherently improves a routine one-shot answer.
Reliability, authority and continuity benefits need their own tests. Do not
attribute all 15,379 input tokens to Godagents; the plain native CLI invocation
already reported 11,193.

## Exact comparison and boundaries

- Runtime and main at dispatch: `66ef6ce63ff446a918f1c7ccac559e91236f821a`.
  No production source was changed for this comparison.
- Frozen Godskills effect-only worktree:
  `3615b355e7dafbf2efe9e6c6bb3373458eba6119`. No skill body was injected into either
  arm. The Godagent used its ordinary native-only effect-bound mission package.
- Same pinned native subscription CLI/bridge, requested `grok-4.6`, reported
  deployment `grok-4.6-build`, low reasoning, one local dispatch per arm,
  8,192 completion tokens per arm, 90-second provider timeout, disabled tools and
  one reported model turn. Two local dispatches maximum, zero retries or fallback.
- Both received the exact same canonical task. Weights and job IDs were changed
  before dispatch from the earlier development case. This is a previously seen
  task family, not independent held-out qualification.
- The plain arm received a direct scheduling instruction, native output schema
  and task. It had no Godagent admission, identity projection, mission wrapper or
  Godskills package. Both arms used the existing restricted native CLI process;
  its internal shared instructions are not independently known.
- The normal Godagent system prompt and governed package are part of the whole
  architecture treatment. This is not an ablation isolating one individual field.
- A random byte froze arm order before outputs: plain first, Godagent second.
  A single ordered pair cannot separate cache, order, load or serving variation.
- Transport/format failure would stop the remaining arm without retry. A valid
  but suboptimal answer would still allow the other arm. Both completed.
- First-party creation inputs were reused to create a fresh admission identity,
  not copied from the earlier agent's admission. Scope was synthetic task data
  and local artifact output only; Soul and external effects remained excluded.

## Evidence

Immutable operational root:
`D:/00-INDEX/operations/2026-09-08-grok-matched-comparison`.

| Evidence | SHA256 / digest |
| --- | --- |
| `registration.json` file | `9f5a161ef42ecb7a80b11d07789c57c475a1d298af1d2bb8f9b388bcd5731d38` |
| registration canonical-value digest | `472163fcdd92ad3abe953e67d67cf53154bd943e73d6379a38af9aaacd49b767` |
| `freeze.json` file | `c29c07c100c62a74a846489003c0facb6c38fa5dfeff27f80457bf5c5e403528` |
| `result.json` file | `9827ae2b2b546d5a2a6363c2dd36ae1c825c3f0004e930a6fb51627b544af9a0` |

The registration binds exact script, reader, oracle, configuration, policy,
prepared workflow and baseline request hashes. Those pins and both repositories'
clean source states were checked before execution and before each arm. Each
attempt and result was written exclusively. No prior failed attempt was changed.

`baseline-reader.test.mjs` was red before implementation, then passed four tests
in 82.9188 ms. It checks successful accounting, malformed-answer usage retention,
missing/contradictory/over-budget/wrong-deployment ledger rejection and invalid
process/answer rejection. The operational reader constructs an untrusted usage
candidate and passes it to the existing production Grok evidence verifier. It
does not manufacture an agent completion receipt. The pinned process screens
credential reflection before the reader; raw provider responses and separate
hidden reasoning are not saved.

Independent read-only preflight reviewer Banach
`01a07e22-93d9-7c82-981e-91ea6f493e98` reviewed the whole comparison and reader,
finding no important safety or fairness defect for this bounded sample. Review
did not certify general model quality. The earlier 1,314-test runtime gate and
45 post-merge checks remain historical evidence for unchanged production code,
not newly executed tests on this documentation update.

## Next evidence-backed work

1. Profile the exact model-facing package and distinguish necessary semantic
   context from duplicated evidence, hashes or host-only material. Do not weaken
   authority, continuity or receipt verification to make the token count smaller.
2. Test an actual multi-step or interruption-sensitive user workflow, with a
   comparable baseline and explicit success/recovery criteria. A repeated easy
   one-shot task cannot establish the purpose of a persistent governed actor.
3. Keep the Godskills native-versus-skill refinement study separate. It measures
   the incremental skill contribution, which this native-only pair did not test.
4. Keep MiniMax as an unqualified candidate until its response-format compatibility
   is established in a new bounded attempt. Its preserved failures do not measure
   reasoning quality.

This completes one matched development comparison, not the universal Godagents
product, long-horizon live qualification, broad provider support or consciousness.
