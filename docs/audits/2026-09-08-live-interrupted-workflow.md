# Live interrupted Godagent workflow

Runtime source: `9bfba9d2399319bcdc09244a7beca5e767e9b930`, unchanged during
this qualification. The effect-only Godskills dependency remained pinned at
`3615b355e7dafbf2efe9e6c6bb3373458eba6119` in its existing isolated checkout.
No runtime, schema, skill body, trust root or global configuration was changed.

## Verified outcome

One live subscription Grok 4.6 operation produced a correct dry-run cleanup plan
for a 22-entry synthetic file inventory. The owned Node host process was killed
after its verified native completion was persisted, before workflow artifact
publication. A fresh process then ran the normal local artifact workflow,
recovered under the same admitted identity and mission, and published the
accepted artifact. Recovery made **zero observed attempts to launch the pinned
Grok executable**. Original completion and provider-evidence bytes were unchanged.

The result correctly identified seven duplicate copies, retained fifteen entries,
and reported one conflicting hash/size group. Its exact planned reclaimable sum
was 5,200,033,561 bytes. **No real warehouse files were inspected or deleted.**
The data, hashes and paths were synthetic inputs; these numbers are not storage
savings on Dom's computer.

This qualifies one existing recovery path with a live model and an independently
checked useful task pattern. It does not demonstrate superiority over a plain
model with its own persistence wrapper, multi-step model planning, a second host,
or completion of the universal product.

## Procedure and authority

1. Freeze the task, independent evaluator, process witness, source refs, policy,
   prepared manifest and inputs. Create a fresh inert admission using existing
   fixture-derived compiled creation inputs, not a copied live identity.
2. Use the public `createGrokCliPortablePhaseHost` and admitted effect-only
   launcher. Their existing checkpoint callback pauses after
   `after-grok-cli-phase-completion-persisted`. No new production hook is added.
3. On that checkpoint, kill only the owned Node child, wait for process closure,
   and inspect the persisted completion/evidence records. Confirm that the
   workflow artifact directory does not yet exist.
4. Start a fresh child using the ordinary `runLocalWorkflow` entrypoint. The
   process witness denies launches of the pinned Grok executable through the
   observed Node APIs. Validate the recovered identity, mission, receipt, artifact
   and unchanged original record hashes.
5. Score the artifact against the frozen deterministic cleanup rules. A separate
   post-run verifier checks fifteen source/input pins, provider usage, process
   observations, artifact identity and additional hand-counted answer facts.

The native CLI used requested `grok-4.6`, explicitly pinned reported deployment
`grok-4.6-build`, low reasoning, at most 8,192 completion tokens and a 90-second
provider timeout. One local provider attempt was reserved, with no retry or paid
fallback. The standard full context presentation was used; this is not a test of
the new opt-in objective-reference profile. Oracle code was not sent to the model.

Task instructions occupy the existing bounded mission objective; the unchanged
inventory occupies `observation.summary` as a columns/rows table. Both fit the
existing 4,096-character limits. All rows and rules round-trip exactly. No runtime
ceiling was raised and no difficult case was removed to make the test fit.

## Observed resources

| Measurement | Observed |
| --- | ---: |
| Local provider dispatches | 1 |
| Initial pinned-executable launch attempts | 1 |
| Recovery pinned-executable launch attempts | 0 |
| Reported input tokens, cache included | 16,277 |
| Cached input tokens, subset of input | 128 |
| Completion tokens, reasoning included | 1,778 |
| Reasoning tokens, subset of completion | 1,549 |
| Visible output tokens | 229 |
| Whole recorded run, including auth preflight/recovery/checks | 30,382 ms |

Actual subscription charge and remote physical inference count remain unknown.
These are provider-ledger counters and local observations, not quota measurements.

## Controlled failures retained

Before the live operation, a preparation attempt exceeded the existing objective
ceiling and supplied unsorted success evidence. It stopped before any provider
operation. The complete task was then represented through the existing objective
and observation fields; the partial attempt remains preserved as `control-1`.

The first executed controlled attempt, `control-2`, exposed a harness bug: wrapping
`execFile` dropped its custom promisifier, changing a `{stdout, stderr}` result
into a string. A regression reproduced that exact behavior. The corrected witness
preserves and observes both callback and custom-promisifier paths. The original
controlled attempt and registration-matching source snapshots remain preserved.
This was not a Grok or Godagent recovery failure.

Nine targeted evaluator/witness tests passed. Fresh `control-3` then completed the
whole kill/recovery procedure using a real Node subprocess with a fixed synthetic
provider answer. Independent harness review found no remaining concrete blocker,
conditional on that successful control and freeze checks. The live operation ran
only after those conditions were satisfied. No full repository suite was rerun
for these external operational scripts and this documentation-only closeout;
the preceding runtime regression evidence retains its original scope.

## Evidence

Local root:
`D:/00-INDEX/operations/2026-09-08-grok-interrupted-workflow`.
Useful retained tools: `study.mjs`, `child.mjs`, `process-witness.mjs`,
`cleanup-oracle.mjs`, their tests, and `verify-result.mjs`. Do not rerun the closed
attempts; source/registration guards and exclusive files deliberately prevent it.

- Live registration digest:
  `62ab91d8276c262a1ff944725e6b854bf2fc896ed7367811622f6aba2386968a`.
- `live-1/result.json` SHA256:
  `9b0e1824c6160118d413240735c71c107060e1bcf8c501ae62dbd7cee6664d87`.
- Accepted artifact digest:
  `b18d50ce04d77e6620ee21ebd8e3d05e25e1848344c5c96fea188e6c8461f202`.
- Workflow receipt digest:
  `b7cb4b0d777458fdac16b581da15a9597c104e697ab8e3a1a11166e888292a62`.
- `live-1/verification.json` records the independently rechecked process,
  registration, input, record and artifact facts with exact evidence hashes.

The evidence is local, not promised to exist in a fresh public checkout.
The process witness covers selected Node launch APIs and the pinned executable
path, not hostile same-user isolation, power-loss durability, every possible
process creation mechanism, or remote exactly-once execution. The provider had
already completed before interruption; an in-flight ambiguous provider call is
not qualified by this result. No filesystem cleanup or other external effect was
executed from the generated plan.

## Next product gap

The first live post-completion interruption proof is now complete. Next priorities
are qualification through a second host/provider and making the existing creation,
configuration and recovery path usable without fixture-derived preparation.
Longer-horizon adaptation and comparative value remain separate evidence gaps.
Do not add a new orchestration layer merely to repeat the result above.
