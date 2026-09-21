# Native output truncation: source mining and bounded correction

Base: `5bcdcec72170fc07c416bd3887c6f91c4d5521f8`.
Local branch: `fix/native-truncation-outcome-20260920`; unmerged candidate.

## Mining question and choice

Godagents' native operator needs to distinguish a provider-limited unfinished
response from a normally ended turn, without replacing Pi's loop or losing actor
continuity. Useful source evidence must establish the host protocol, an actual
adapter mismatch, and a repeatable before/after observation.

The ranked shortlist is:

1. **Native truncation outcome**, selected and implemented here. Pi's real
   `length` stop was missing from usage classification and final outcome handling.
2. **Bounded post-kill process observation**, deferred. The local Godskills
   transport asks a timed-out child to stop but awaits `close` without a second
   bound. Any correction must preserve unresolved termination and forbid duplicate
   dispatch; merely returning a timeout cannot prove the child stopped.
3. **Branch-specific receipt lookup**, deferred until an actual audit consumer
   requires it. Pi's persistent custom entries supply a candidate metadata
   mechanism, but the existing native history checks and journal already provide
   broad persistence. No archive, compactor, or metadata subsystem is added here.

The previous compaction experiment and the separate explicit revocation-epoch
candidate remain separate and unmerged. No new repository collection or Jev call
was needed. Two Luna Max workers audited source candidates and the external
Godskills receipt failure; the lead checked the selected source and implemented
the correction.

## Sources and extraction

| Source | Exact source files inspected | License and extraction |
| --- | --- | --- |
| `earendil-works/pi` at `c1d4c801114545f47c440921d8b3e04aeb1e565d` | `packages/agent/src/agent-loop.ts`, `packages/ai/src/types.ts`, `packages/coding-agent/src/core/session-manager.ts`, root `LICENSE` | MIT; interoperability contract and pattern only, no copied source |
| `NousResearch/hermes-agent` at `d1af7e16cbe311570623e4e2e7bbb6489a4346b9` | `agent/memory_manager.py` shutdown/drain implementation; root `LICENSE` | MIT; bounded-observation pattern only; its direct provider shutdown is not time-bounded |
| Installed qualified Pi `0.85.1` | `node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js` | Existing dependency unchanged; actual native integration exercised |

Canonical quarry locations are `D:/03-ARSENAL/warehouse/catalog-c/agents/pi`
and `D:/03-ARSENAL/warehouse/catalog-c/agents/hermes-agent`. No third-party
installation, acquired test suite, memory backend, dependency, or provider
fallback was added. No copied code means no new redistributed license notice.

Pi rejects every tool proposal in a `length` response because arguments may be
truncated, then may continue its own loop. The Godagents adapter previously
recognized only `error` and `aborted` as failure; plain terminal `length` therefore
returned `native-turn-settled`. The usage collector included `max_tokens` but not
the actual Pi value `length`.

## Resulting behavior

- Terminal `length`: the public operator records `failed`, category
  `native-pi:response-truncated`; partial response and usage remain available.
- Deliberate continuation: the same actor/session can resume after normal
  authority and history checks. No automatic retry or new authority is introduced.
- Recovered truncated tool proposal: Pi keeps responsibility for rejecting the
  incomplete call and continuing; a later normal response settles with the
  `native-response-truncated` warning. No incomplete tool is executed.
- Review: a truncated review is recorded as failed, and offline recovery returns
  that same result without authentication or another model invocation.
- Usage: `length` remains identifiable; existing counters, known/unknown usage,
  reasoning semantics and old records are unchanged.

Only `src/host/pi-native-session.mjs` and `src/host/native-session-report.mjs`
change runtime behavior. The existing public failure/category and warning fields
carry the new outcome. No new configuration or result schema is required.

## Verification

The initial native baseline passed 45 tests. Four new tests failed against the
unchanged implementation: final output was settled, the stop reason became
unknown, and recovered truncation lacked its warning. Those four then passed
after the minimal runtime correction. The broader focused gate passed 93 tests
with zero failures, cancellations or skips and actual Pi SDK loading enabled.
This includes one further review/offline-recovery regression.

Provider responses in these checks are scripted. They exercise the real Pi
session, tools, native Godagent admission, persisted results and resume paths.
No live LLM call is required to determine the semantics of a frozen stop reason.
No quality, speed, token savings or billing improvement is inferred.

The final broad-suite result and independent review disposition are preserved
with the task output report. Runtime source and tests are frozen before that
suite; no overlapping behavior edits are planned during verification.

## Godskills receipt diagnosis

The existing specialist receipt pins Godskills
`3a63c07322808b6958593bd765c0fb32023a2da5`. Its builder intentionally requires
the current external checkout to equal its local `origin/main`, with the pinned
commit as an ancestor. The canonical Godskills folder is being used on feature
branch `feat/infrastructure-evidence-candidate`, HEAD `4241cdb9...`, while local
main/origin-main are `f3966698...`. Its specialist artifacts are unchanged; the
feature checkout and its untracked work must be preserved.

A direct reproduction against the existing clean `infrastructure-baseline`
worktree clears the ref check but fails `cross-repository specialist preference
fixture is stale`. Fresh comparison isolates seven digest changes: the release
verifier hashes the whole pin, including `repositoryRoot`; that release digest
feeds source-envelope and package digests. The canonical active root still
generates the frozen fixture exactly. Simply adding a root override cannot
reproduce the historical receipt unchanged.

Therefore no checkout switch, path substitution, source-pin change, bypass, or
historical receipt rewrite is made. The complete root comparison is saved beside
the diagnostic. Local remote-tracking refs were inspected without fetching;
this is not a new live-remote certification. A clean release gate requires a
coordinated restoration of the canonical checkout or a separately designed
portable reproduction path that preserves the historical evidence.

## Final gate and review

The frozen-source full run completed with **1,690 passed, one failed, nine
optional skips and zero cancellations**, 1,700 total. The sole failure is the
existing specialist receipt checkout check explained above. No new failure was
observed. The run took 699,980 ms with the required four-worker scheduling and
installed Pi SDK enabled. This is not a completely green release gate.

The bounded Luna Max reviews found no confirmed runtime regression. A possible
zero-usage accounting edge was raised and explicitly qualified as unproven;
the selected change preserves prior `length` usage interpretation. Reported
usage remains an observation, not proof of complete billing. Reviewers read
the source and tests; the lead performed the 93-test focused run and full run.
