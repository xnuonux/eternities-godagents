# Godagents project update — September 25, 2026

Godagents is an experimental system for persistent AI actors. An actor's
identity, commitments, and history live outside the model that reasons for it;
an execution host supplies tools under the operator's explicit grants. The
current source is public on GitHub at version 0.2.0, but the package remains
private and there is no hosted product or general release.

## What is working

- The local creation and admission path, actor lifecycle, journals, and action
  records are implemented and covered by deterministic tests. The [local
  demo](../README.md#try-it-locally) runs without a model, API key, package
  installation, or sibling checkout.
- The native Pi coding-host adapter supports preparing an admitted actor,
  preflight, launch, resume, status, and history. Recorded live Grok trials
  exercised coding and session continuation. A compatible Pi SDK and provider
  access are still needed for a real mission; the fixture demo does not exercise
  model quality.
- Optional Godskills binding and selection are implemented. Skills supply
  methods, while the host retains authority over tools and effects. An
  interrupted or uncertain action is recorded for reconciliation rather than
  being silently replayed.
- September's integration screens truncated Pi responses before an incomplete
  tool proposal can execute. An unconfirmed local Godskills child process stays
  pending across host restart, preventing duplicate launch. Pending does not
  mean the child is known to have stopped.
- The project front page, portable quickstart, documentation map, and local demo
  were refreshed. The [implementation reference](reference/implementation-ledger.md)
  retains the detailed earlier account.

## Evidence and limits

The September 20 integration passed 88 focused checks and a four-worker local
release gate: **1,701 passed, zero failed or cancelled, and nine existing
optional skips** out of 1,710 tests. The September 23 presentation and demo
change passed 18 focused checks and a fresh-clone demo. These are dated results
for their recorded revisions, not a continuously green build badge. The
[hosted smoke run](https://github.com/xnuonux/eternities-godagents/actions/runs/35953959169)
started no jobs because of an account billing lock; hosted Linux and Windows
validation remains unverified.

The evidence is deliberately mixed. In one matched real-task comparison, the
control passed 23/23 acceptance checks and the automatic Godskills treatment
passed 21/23, although both passed 20/20 regression checks. The treatment
missed two invalid-date cases. A later model review missed those known defects
as well. Lower reported time and token use in that pair therefore did not
establish a quality gain, and model review is advisory rather than an approval
gate. See the [dated evidence](current-state.md) and [audits](audits/) for the
setup and exact boundaries.

## Next qualification

The next product milestone is an operator taking a newly created actor through
a useful coding task, checking the resulting artifact, then interrupting and
resuming the same mission without repeating completed effects. The
[roadmap](roadmap.md) then calls for recovery through the real operator flow, a
second independently qualified host, and matched comparisons against the host
baseline. Additional hosts, resident integration, Soul, autonomous evolution,
and consciousness claims are not delivered by the current runtime.

This repository has no project-wide license declaration. Public source
visibility should not be read as permission to reuse it under an assumed
open-source license.
