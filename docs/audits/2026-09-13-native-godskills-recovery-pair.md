# Native Godskills recovery-enabled pair, September 13, 2026

## Result and decision

Both fresh native coding attempts settled without owner intervention. The control
passed the frozen primary endpoint; the default Godskills treatment did not.
The treatment was faster and reported fewer tokens, but missed two explicit
date-validation checks. This is **not a qualified positive quality or efficiency
result**, nor evidence that Godskills generally harms coding.

| Frozen observation | Control | Default Godskills |
| --- | ---: | ---: |
| Native turn | settled | settled |
| Original independent acceptance | 20/20 | 20/20 |
| Additional preregistered edge checks | 3/3 | 1/3 |
| Unchanged focused regressions | 20/20 | 20/20 |
| Primary endpoint | pass | fail |
| Out-of-scope source changes | 0 | 0 |
| Elapsed time, milliseconds | 617,615 | 532,704 |
| Native assistant responses | 21 | 18 |
| Native tools completed | 42 | 36 |
| Tool errors handled within the attempt | 2 | 1 |
| Provider retries / failed assistant messages | 0 / 0 | 0 / 0 |
| Provider-reported input tokens | 126,909 | 65,733 |
| Provider-reported output tokens | 33,425 | 31,844 |
| Provider-reported cache-read tokens | 747,648 | 695,936 |
| Provider-reported cache-write tokens | 0 | 0 |
| Provider-reported total tokens | 907,982 | 793,513 |
| Assistant messages missing usage | 0 | 0 |

Output tokens are the provider's field, not a claim about visible prose or a
separate hidden-reasoning count. Total tokens include cache reads and repeated
context; they are not unique context size or a dollar charge. The observed
13.75% lower elapsed time and 12.61% lower total tokens are descriptive only.
The treatment did not meet the same complete quality endpoint.

## Design and source boundary

Preregistration was committed before inference at
`04401c6ed2d50ea9b6bd178560a3fac89ce83a52`:
[frozen design](../superpowers/plans/2026-09-13-native-godskills-recovery-pair.md).
The freeze was `2026-09-14T02:54:13.896Z`, September13 in America/Chicago.
The once-randomized sequential order was control, then skills.

Both subjects received identical 506-file, 3,490,002-byte Git exports from
`7959e3cef2bf81fa5cebcdc76482fe2aa90d8b44`, not the already solved current source.
Both baselines passed20 regressions and9/23 acceptance, with the same14 expected
missing-feature failures. The independently reviewed current reference passed
23/23. The first20 acceptance cases and task retained their historical bytes;
the three added checks were frozen separately before either attempt.

The executing Godagent host was
`3ec7b3d8d9ec2f628eb3cce7871eeec47d505b95`, including native response recovery.
Pi0.85.1 used xAI/grok-4.6 through the existing OAuth subscription. Both arms had
the same native core prompt, task, tools, effects, 900,000ms deadline,120-tool
ceiling and explicit `maxProviderRetries:1` per failed response. Neither needed
a provider retry; this pair does not newly demonstrate recovery effectiveness.

These were two persistent Godagent/Pi admissions, not Godagent versus plain Pi.
Only optional Godskills binding differed intentionally, besides fresh actor,
session and workspace identifiers. No personal Grok keel, owner continuation,
replacement slot, network task, dependency installation or paid fallback was
used. Native tools execute as the OS user; task restrictions are not an OS
sandbox. Source manifests show no out-of-scope source edits, not proof of an
OS-enforced isolation boundary.

## Exact treatment

The actual native session record and association verified the selected binding,
not merely the earlier routing probe:

- Binding record: `d452af746d5140800940ccab0ef5a0894d63b71507f6d78a831fd62d2e003eee`.
- Receipt digest: `3256f06bab6af7bb23b1e8ff7e0507f8e35c70102e78dc08464a7be823599393`.
- Release digest: `c72a0ce54f6c42f1542068e8fe61e046500587973b716f4c15effaac8c862f5f`.
- Stack digest: `da35b310b7ba72cd2e27ef66be77899964f5bba1a006d31df0398d2e37e03955`.
- Activation trust root: `c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7`.

Selection was `eternities-forge` and `eternities-mnemosyne`, both **guardrail**.
There were no method bodies, explicit method requests or deferred reviews.
The control association had no Godskills binding. Godskills source main/origin
was `d0781a91a82898cc808e7fc681f145fdd972dade`. Exact selected entrypoint and
contract hashes are retained in `paired-observation.json` and the native binding.
No skill body, activation evidence, trust root or routing policy was changed.
Binding and delivery do not prove the model followed every guardrail.

## Diagnosed failure, not a provider conclusion

The treatment's reader `src/host/native-run-history.mjs:16` and parser
`src/host/native-pi-operator-config.mjs:31` call `toISOString()` on a date without
first checking whether its parsed value is finite. A regex-shaped month13 value
such as `2026-13-01T00:00:00.000Z` therefore throws `RangeError: Invalid time value`.
The reader should return `native-run-history:query`; the parser should return
`native-operator:flag-value`. `skills/edges-result.log` reproduces both interfaces.
This is one validation failure pattern at two public boundaries. Some other
impossible dates normalize rather than throw; February30 is not the throwing
example. Primitive status validation passed in both candidates.

The current canonical implementation already contains the finite-date checks
and regression proof from [history-query adoption](2026-09-13-native-history-query-adoption.md).
Neither trial candidate was repaired or copied over that newer implementation.
Both changed exactly five allowed existing files and added two tests. Every
candidate file still matched its complete post-attempt manifest after scoring.

Independent Codex reviewer Aristotle reviewed both candidates and the result
interpretation. It confirmed the treatment's date errors and found no additional
material treatment/control behavior difference in the reviewed scope. An initial
category-allowlist objection was withdrawn after checking the actual producer:
the established screening contract is a bounded namespace-plus-slug grammar,
not a finite category enum. Pre-existing filesystem-race error normalization and
the operator's state-snapshot prerequisite are not changes introduced by either
candidate. These remain background limitations, not evidence of skill uplift.

## Evidence and preservation

Private root: `D:/00-INDEX/operations/2026-09-13-native-godskills-recovery-pair`.
Raw transcripts, subject code and operator configurations remain private.

| Evidence | SHA-256 |
| --- | --- |
| `frozen.json` | `80f6790b25757e54c8083d3ac046ac852b2edab5b9971458ef2d8d299a47df26` |
| `control/score.json` | `71bacb37f2938bbdc4ad95ec2ba5effdb0a98e4ae644fbafd3037bad1ae9cef1` |
| `skills/score.json` | `25e2fe1af5a126d7da2677d99501caac317bb3af5073da96b7f812d287eda812` |
| `paired-observation.json` | `371b685c6e70eca7147ee0861151ee41526fe7520b9b74b886d533b347f2e853` |
| Control post-attempt manifest digest | `adff41cdaeea71adfbe841912b98bdc507c8e0d79b43cbe2b3bd2e566308fc23` |
| Treatment post-attempt manifest digest | `81ce1e7742bb93db8cee83d66a738920c279237764cc2b1a88505db1ba3f775b` |

`score.mjs` ran once per untouched output. `inspect-results.mjs` is a post-hoc
observation summary, not an endpoint change. The post-scoring read-only
`verify-results.mjs` checks all8 frozen files,6 host pins,5 installed SDK pins,
both config digests and all508 final files per subject. It also checks canonical
runtime/source/tests against the pinned host revision. No production code or
historical receipt changed in this documentation-only study batch. The earlier
1,623-pass full-regression result remains evidence for that unchanged runtime,
not a newly rerun suite or a new quality certificate.

## Next bounded product milestone

Keep automatic skills optional and retain these results, including the failures.
Do not promote activation evidence, force method mode, or tune this same task
until it passes and call that an independent success. One unblinded, unreplicated
pair cannot identify a causal effect or generalize across tasks; ordering,
nondeterminism and provider/cache conditions remain confounds.

The next useful gap is **actual bounded post-attempt review on the native path**,
not more prompt volume or another replacement coding harness. Reuse the existing
operator and governed contracts: after the first attempt, capture its immutable
output, run a genuinely read-only reviewer within the remaining authorized
budget, and expose findings without granting the reviewer mutation authority.
Any separately authorized repair must keep before/after evidence and rerun real
acceptance. Start with one concrete task and test disabled-review compatibility,
review timeout/failure, exact-source attribution, budget exhaustion, and resume
without replaying completed tools. A scheduled review is not an executed review.
No implementation of that next milestone, new skill qualification, broader Realm
certification, Soul/Inspiration or Lunari integration is claimed here.
