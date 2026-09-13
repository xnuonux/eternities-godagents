# Grok subscription testing

The project default is native `grok-4.6` CLI subscription inference, not an
OpenRouter/API fallback and not a persistent Grok engineering session. See
`../AGENTS.md`. The pinned process verifies the disposable home/workdir, disables
memory, subagents, web and MCP inheritance, checks exact tool-free one-turn args
and replaces the system prompt. The bridge and binary matched the September 10
pins on September 12. Interactive Grok and Codex keel settings remain untouched.

## Baseline collector

`scripts/evaluation/grok-baseline.mjs` reuses the existing production Grok usage
verifier and exclusive evaluation journal. It has no credentials, network client
or retries of its own. Supply the pinned process invocation as `dispatch`, its
credential-reflection check as `assertResponseSafe` (throw on rejection), strict
workspace proposal validation/conversion as `prepareAnswer`, and actual store
revision as `stageAnswer`. Use `persistPrepared` to save the screened, bounded
proposal before revision, and `publishResult` to save the returned revision and
accounting afterward. These optional hooks preserve existing callers; new live
comparisons must supply both. Their errors are classified separately as
`workspace-evidence-failed` and `workspace-publication-failed`. Neither raw provider
envelopes nor arbitrary errors belong in those files. A completed collector means
these callbacks completed, not that browser tests passed or the Godagent defeated
its baseline.

Verified numeric usage is persisted before decoding the answer, parsing the inner
proposal, validating it or staging files. Malformed outer answer, rejected proposal
and failed staging have separate bounded categories. Known diagnostic tokens from
the dispatch/screen gates retain their classification; arbitrary provider error
properties and raw error messages do not. Failed evidence persistence blocks
acceptance. Existing attempt slots, including torn slots, are never reused.

For a known credential-reflection rejection, the callback should throw the
journal-owned token, not a generic `Error('credential-reflection')`:

```js
import { diagnosticFailure } from './attempt.mjs';
const assertResponseSafe = text => {
  if (!processHost.process.assertCredentialAbsent({ text, credential })) {
    throw diagnosticFailure('credential-reflection');
  }
};
```

A generic thrown error still blocks acceptance but is conservatively classified
as `response-safety-check-failed`. Never classify it by trusting error text.

Use a new frozen registration for each live comparison. The September 10 failed
baseline remains inconclusive; this collector does not reconstruct its answer.
Local tests exercise actual revision preimage rejection, successful revision with
source preservation, evidence collision, strict accounting, malformed answers and
zero retry. They are not a live model-quality study.

## Review

A bounded Grok 4.6 subscription review at
`D:/00-INDEX/operations/2026-09-12-grok-baseline` identified loss of trusted
dispatch/screen categories. The coordinator reproduced that finding with a
failing regression and added a WeakMap-backed diagnostic fallback. Forged error
labels still cannot become trusted categories. The reviewer received only the
selected source and requirements, not personal keel or task history. Its report
is advisory evidence; passing checks and integration remain host decisions.
