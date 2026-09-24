# September 23: presentation and portable onboarding

## Question and scope

Godagents needs a comprehensible GitHub entrypoint and a working first run from a
fresh checkout. Useful warehouse evidence demonstrates a short product statement,
an immediately runnable example, and progressive disclosure of advanced setup.

Base: local main `763fe08`, which already contains the September 20 runtime fixes.
The remote main inspected at task start was `5bcdcec`; those three existing fixes
were already locally integrated, with the earlier 1,701-test record retained.

## Changes

- Replaced the long README with purpose, quickstart, architecture diagram,
  maturity table, and routes into the documentation.
- Preserved its historical content in `docs/reference/implementation-ledger.md`,
  rebasing relative Markdown links to its new location.
- Added concepts, quickstart, documentation map, roadmap, contributor guidance,
  and focused issue/PR templates.
- Repaired `npm run demo`: removed its workstation-specific Godskills path and
  obsolete transport argument, selected the existing explicit unbound mode,
  compiled fixtures automatically, and retained each run in its own directory.
- Added a portable regression and a small Linux/Windows GitHub Actions job.
  This job is a smoke check, not the external-host/full release gate.
- Clarified the integration chronology in the current-state entrypoint without
  rewriting the original historical audit conclusions.

No core runtime policy, model default, credential, dependency, project license,
historical receipt, or sibling checkout is changed by this refinement.

## Warehouse sources

All sources were read as research data. No upstream code, artwork, installer, or
prompt was copied or executed. Dependencies added: none. Attribution is retained
here; no copied-code notice obligations were introduced.

| Repository and local revision | Exact files read | License evidence | Extraction and decision |
| --- | --- | --- | --- |
| `openai/codex`, `da4c8ca57d40b074bdc1b5b1218851100150c56b` | `README.md`, `LICENSE` under `D:/03-ARSENAL/warehouse/catalog-c/agents/codex` | Apache-2.0, local LICENSE | Pattern only: concise product definition, quickstart, separate documentation routes. |
| `huggingface/smolagents`, `30bb1161095dbae2271e6bc3cc4c219cc3897a57` | opening and quick-demo sections of `README.md`, `LICENSE` under `D:/03-ARSENAL/warehouse/hunt/raven/huggingface__smolagents` | Apache-2.0, local LICENSE | Pattern only: a small executable example before advanced provider options. |
| `NousResearch/hermes-agent`, `d1af7e16cbe311570623e4e2e7bbb6489a4346b9` | opening/install sections of `README.md`, `LICENSE` under `D:/03-ARSENAL/warehouse/catalog-c/agents/hermes-agent` | MIT, local LICENSE | Studied presentation, deferred runtime reuse: installation, gateways, and learning machinery are unnecessary for this onboarding repair. |

These are local snapshots, not claims about the newest upstream behavior. A new
host or runtime extraction should name a concrete missing capability and review
its source, imports, tests, lifecycle, and license separately. No bulk framework
import is justified by this refinement.

## Verification

The demo regression first failed because the child attempted to read
`C:/dev/eternities-godskills` outside its permitted copied checkout. After repair,
the same regression passes without a prebuilt distribution. It verifies the
observed counter, a single action receipt, completed journal, and preservation of
old evidence through a second run.

Local Windows check with Node 24.18.0:

```sh
node --test --test-concurrency=4 tests/demo.test.mjs tests/foundry.test.mjs tests/journal-recovery.test.mjs tests/scheduler-arbiter.test.mjs
npm run demo
```

Result: **18 tests passed, zero failures/skips**; the actual demo reports expected
and observed counter 1 with no discrepancy. Full release and live-model quality
tests are outside this presentation/demo change's validation scope. CI results
must be read from the exact GitHub run; defining a workflow alone is not a pass.

The filesystem restriction in the demo regression is a portability check for
this script. It is not a production-host sandbox qualification.

## Remaining decisions

The repository currently has no declared project-wide license. This change
documents that fact and does not select one. Broader creator usability, host
portability, recovery, and quality evaluation remain the [roadmap](../roadmap.md).
