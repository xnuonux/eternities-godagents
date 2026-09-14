# Native Godagent operator

This local operator launches the **existing native Pi SDK**, not a new coding
loop. A real admitted actor, an operator-issued configuration and a native Pi
session stay associated across explicit `resume` calls. It does not require a
new script for each mission. The current optional host is Pi **0.85.1**.

## What is available

- `preflight`: check the admitted source, tool/effect ceiling, installed SDK,
  selected model and OAuth subscription without a model inference.
- `launch`: reserve a fresh session directory and execute the first user prompt.
- `resume`: reopen the exact stored actor, mission, grant and native transcript
  for another user prompt. No implicit identity/model/permission migration.
- `status`: read the saved action/turn counters offline. This is a recorded
  snapshot, not permission to resume or independent product acceptance.
- `history`: list the mission's saved runs, including failures and incomplete
  attempts, with aggregate provider-reported usage. No model or credential load.
  Optional `--only`, `--after` and `--limit` filter the report without changing
  the pinned configuration or loading credentials.
- `--help`: show the command interface without configuration or credentials.

Native Pi owns source retrieval, file/edit/shell tools, context, inference and
automatic compaction. Its core prompt remains intact. Godagents supplies the
admitted actor/mission context and validates its native action association.

## Configure once

Use the existing creation and local admission workflow to create a verified
actor. This command does **not** invent an actor, forge a receipt or upgrade an
old read-only admission into shell authority. See [native admission and host
ownership](native-pi-session.md).

Save a JSON configuration outside the coding project. Supply actual absolute
paths and the independently verified creation/policy pins:

```json
{
  "schemaVersion": 1,
  "protocolId": "eternities-native-pi-operator-v1",
  "piPackageRoot": "C:/operator/pi-coding-agent",
  "authPath": "C:/operator/private/pi-auth.json",
  "cwd": "C:/projects/example",
  "sessionRoot": "D:/agent-sessions/example-mission",
  "admission": {
    "receiptPath": "D:/actors/example/admission/transaction/genesis-receipt.json",
    "creationDir": "D:/actors/example/admission/creation",
    "distributionDir": "D:/actors/example/admission/distribution",
    "expectedPolicyDigest": "the verified 64-character policy digest",
    "expectedCreationBuildId": "the verified 64-character creation build id",
    "instanceId": "your-admitted-instance-id",
    "creatorRef": "creator:you",
    "transactionDir": "D:/actors/example/admission/transaction",
    "journalPath": "D:/actors/example/admission/vessel/journal.jsonl",
    "keelRoot": "D:/actors/example/admission/keels"
  },
  "mission": {
    "missionId": "example-mission",
    "objective": "Implement the approved change in the project, using its source and tests.",
    "successEvidence": ["independently verified changed behavior"],
    "stopConditions": ["revoked authority", "unresolved native action"],
    "budget": {"maxCycles": 100, "maxCompletionTokens": 65536},
    "observation": {
      "observationId": "project-baseline",
      "summary": "Source and tests are available on disk, not embedded in this objective.",
      "evidenceDigests": []
    }
  },
  "model": {"provider": "xai", "id": "grok-4.6", "maxTokens": 16384},
  "grant": {
    "allowedTools": ["read", "write", "edit", "grep", "find", "ls", "powershell"],
    "maxToolCalls": 160,
    "expiresAt": "2026-09-14T00:00:00.000Z"
  },
  "limits": {"maxRunMs": 900000, "maxProviderRetries": 1}
}
```

The example pins and paths are explanatory, not usable credentials or admission
evidence. Set an actual future expiry. Use Pi's normal subscription login to
populate its credential store; no inline secret belongs in this configuration.
An API key cannot silently replace the OAuth subscription.

Review the configuration as the host operator, then compute its canonical pin:

```powershell
node --input-type=module -e "import {readFile} from 'node:fs/promises'; import {sha256Value} from './src/core/digest.mjs'; console.log(sha256Value(JSON.parse(await readFile(process.argv[1],'utf8'))));" 'D:/operator/config.json'
```

Keep that digest as an independent host input. A model cannot grant itself
authority by changing configuration and suggesting a replacement digest.

```powershell
npm run native:pi -- preflight --config 'D:/operator/config.json' --pin <reviewed-digest>
npm run native:pi -- launch --config 'D:/operator/config.json' --pin <reviewed-digest> --prompt-file 'D:/operator/first-task.md'
npm run native:pi -- status --config 'D:/operator/config.json' --pin <reviewed-digest>
npm run native:pi -- history --config 'D:/operator/config.json' --pin <reviewed-digest>
npm run native:pi -- history --config 'D:/operator/config.json' --pin <reviewed-digest> --only failed
npm run native:pi -- history --config 'D:/operator/config.json' --pin <reviewed-digest> --only settled --after 2026-09-13T18:00:00.000Z --limit 20
npm run native:pi -- resume --config 'D:/operator/config.json' --pin <reviewed-digest> --prompt-file 'D:/operator/continue-task.md'
```

### History query and aggregates

`history` remains an offline observation. Query flags do not load credentials,
create a model runtime, mutate the session, or change existing configuration pins.
`--only`, `--after` and `--limit` are history-only; other commands reject them.
`--only` is exactly `settled`, `failed` or `incomplete`. `settled` selects stored
`native-turn-settled` records. `--after` is a real UTC timestamp in
`YYYY-MM-DDTHH:mm:ss.sssZ` and keeps runs whose `startedAt` is strictly later.
`--limit` is a canonical decimal integer `1` through `1000` (not `+1`, `01`,
fractions, exponents or surrounding whitespace) and keeps the latest matching
runs after the `only`/`after` filters. Returned rows stay in ascending
`startedAt`/`runId` order.

Every stored run is validated before filtering. A wrong binding, malformed result,
unsafe path or invalid usage still fails even when that run would be excluded.
Omitted query flags preserve the unfiltered report shape: `entries`, `counts` and
`usage` over every valid run, with no `selection` object.

A nonempty query adds `selection: { totalRuns, matchedRuns, returnedRuns, hasMore }`.
`totalRuns` is all valid runs, `matchedRuns` is the `only`/`after` set before
`limit`, `returnedRuns` is the page actually listed, and `hasMore` is
`matchedRuns > returnedRuns`. `counts` and `usage` describe **returned rows only**.
Unknown usage stays `null` per field. Any incomplete returned row nulls all usage
totals. An empty match has zero counts and zero totals, not unknown. The report
never echoes raw result fields, transcripts or filesystem paths.

`sessionRoot` must not exist before launch; its parent must exist. Repeating
launch cannot overwrite it. A failed setup leaves evidence in place rather than
deleting and silently retrying. If setup fails before a native association exists,
`status` returns a screened `setup-failed` diagnostic. Preserve that directory,
correct the underlying setup and explicitly choose a new `sessionRoot` and
reviewed configuration pin. A resumed prompt stays within the admitted
mission. Expired grants, changed mission/model/configuration, altered native
history and unresolved effects need explicit reconciliation or a separately
authorized new association, not an automatic retry or edited checksum.

## Results and recovery

Each invocation records `runs/<id>/started.json`, `result.json` and private
`response.md`. `operator.json` binds the native session and pinned configuration;
`native-state/session.json` records hashed native actions. Pi's transcript is
under `pi-sessions`. Keep the entire directory private: native transcripts and
responses contain ordinary project data even though console summaries do not.

Console output has a screened outcome, action counts, usage and the private
result path. Tool progress shows only its known name and error flag. Provider
error strings, raw arguments, responses and credentials are not printed.
`native-turn-settled` means the native turn ended normally, **not** that its code
passed independent tests. Failed and interrupted runs remain failures. There is
no automatic retry by default, alternate model or paid fallback. A fresh,
operator-pinned configuration may set `limits.maxProviderRetries` to `1` or `2`
to use Pi's native transient-response recovery. Omission or `0` preserves the
original single-attempt behavior, including historical experiment configurations.
This is the retry count per failed response, not a new allowance for tool calls
or a spending guarantee. The original run deadline, tool ceiling, actor, model
and authority checks remain in force. Completed tools are not replayed; calls
from an incomplete error response are not executed. Recovery is reported as
`provider-retry` progress and `native-provider-recovered` in the run warnings;
failed response events remain in the session and missing usage stays unknown.
Billing/quota and authentication errors do not gain a fallback. A changed
recovery allowance changes the configuration pin and cannot silently alter an
existing session. Ctrl+C and timeout revoke
subsequent dispatch; they cannot undo already executed tools or child processes.

Usage is measured from provider-reported assistant events, with input, output,
cache read, cache write and total preserved separately. Missing fields remain
unknown (`null`). Counters do not add cache fields to an already reported total,
infer money, or pretend that hidden reasoning is separately observable when it
isn't. The collector stores counters rather than retaining private message
bodies. Failed or aborted responses containing only zero/absent SDK counters
make cumulative usage unknown: placeholder zeros do not prove a free call.
Nonzero reported failure usage is retained as reported, not certified complete
billing. Historical run records are not rewritten by this correction.
Mission token fields are **not certified spending caps**; the configured
per-response ceiling, tool-call ceiling, expiry and run deadline are distinct.

Each new settled or failed run also records `completionBreakdown` beside `usage`,
not inside it. Its version1 fields are `schemaVersion`, `messageCount`,
`knownMessages`, `unknownMessages`, `reasoningTokens` and
`nonReasoningOutputTokens`. Launch and resume each report only that invocation's
assistant `message_end` events. Positive SDK-reported reasoning is treated as a
subset of output and is never added again to output, total or cache. The remainder
can include tool arguments; it is not a measure of visible prose alone.

A zero or omitted reasoning counter with positive output stays unknown because
the SDK can default missing reasoning to zero. Empty successful output with
absent/null/zero reasoning is a known `(0, 0)` split. Failed or aborted zero output
does not establish an empty split, even when input/cache usage was reported.
Positive reported reasoning on a failed response is retained as an observation,
not complete billing. Invalid or missing splits null both aggregate split totals;
known/unknown message counts continue. Unsafe integer sum overflow also nulls
both totals without reclassifying individually valid messages.

The collector keeps counters, not message bodies. Setup failures with no run
omit this field. Offline `history` keeps its existing `usage` aggregate and does
not aggregate the additive breakdown. Old saved records, configuration pins,
review protocols and SDK exports are unchanged. This measurement is not an
automatic conversion into a Godskills review contract or a billing guarantee.

## Native post-attempt host review

`review` is a separate, opt-in host review, not a deferred Godskills selection.
Create a fresh admitted review actor/config with a read-only constitution and
`grant.allowedTools: ["read"]`. Do not alter the original coding session's pin,
mission, identity or grant. This first version records findings; it does not
approve changes, execute tests, repair code or launch a second review round.

Capture an explicit set of text files after a completed native run:

```js
import { captureNativeReviewSnapshot } from '@eternities/godagents/native-pi';
const snapshot = await captureNativeReviewSnapshot({
  sourceRoot: sourceWorkspace,
  files: ['src/example.mjs', 'tests/example.test.mjs', 'TASK.md'],
  sourceRun: { sessionRoot: sourceSessionRoot, sessionId, configDigest, runId },
  destinationPath: snapshotPath,
});
```

Paths are absolute except `files`, which contains unique portable relative paths.
Capture accepts at most100 files and2MiB of UTF-8 text, rejects links and unsafe
paths, and never overwrites an existing snapshot. It validates the completed run
reference and hashes the captured content/result. This is an owner-selected
post-attempt snapshot, not proof the source model authored every captured byte.
Keep snapshot/config/session files private and outside the model workspace.

The new review configuration adds:

```json
"review": {
  "snapshotPath": "D:/reviews/example/snapshot.json",
  "snapshotDigest": "the returned snapshotDigest",
  "maxCompletionTokens": 262144
}
```

`snapshotDigest` must be the actual64-hex digest, not the explanatory string
above. The reservation ceiling must cover at least one configured
`model.maxTokens` response and cannot exceed the admitted mission's completion
budget. Pin the complete review config using `sha256Value` as for other commands.
Do not combine `review` and `godskills` in this v1 host profile.

```powershell
node src/host/native-pi-cli.mjs preflight --config D:/reviews/example/config.json --pin <config-value-digest>
node src/host/native-pi-cli.mjs review --config D:/reviews/example/config.json --pin <config-value-digest> --prompt-file D:/reviews/example/request.md
```

The real Pi `read` tool retrieves paginated text from verified in-memory snapshot
bytes. There is no write/edit/shell tool or arbitrary filesystem read backend.
Changes to live project files after capture cannot change the bytes reviewed.
This narrows the model's tool capability, not the Windows process's OS privileges.

The dispatcher stores `<sessionRoot>.review.json` before launch and locks that
identity. Repeating the exact command returns its verified recorded result
without authentication or inference. A different prompt/config cannot reuse the
dispatch. A pending record reconciles an exact completed native run; otherwise
`review-uncertain` (CLI exit2) requires operator investigation, never automatic redispatch.
Public `launch`/`resume` are forbidden for review configs. Preserve all records.

The deadline begins before review setup and never resets after authentication or
retries. Non-cancellable SDK setup may delay return, but the expired/aborted
signal and pre-inference guard prevent a later model dispatch. Reserve the full
configured response maximum before each inference, including retry/compaction,
and pass it explicitly in the native request options. Check terminal SDK-reported
output: an overrun or successful response with unknown output usage fails the
review before later tools/inference or successful settlement. Original response
and usage evidence remain available. A provider can exceed a requested cap before
the host learns of it, so this is reservation plus observed-usage enforcement,
not a provider billing or latency guarantee. Never release reservations based on
guessed splits. The aggregate retains Pi input/output/cache/total and unknowns;
additional raw counters such as reasoning remain in the private native transcript.
Reasoning may be a subset of output and must not be added a second time.

Successful native settlement means a review was returned, not that its findings
are correct. Review quality and any subsequent repair need independent checks.

## Deliberate boundaries

Native tools have the Windows user's filesystem/process authority. `cwd` is a
working-project association, **not an OS sandbox**. Host state/config/credentials
must be outside that project, including through resolved directory links; this
separation is not protection from malicious code running as the same OS user.
Admission's Realm schema is still the existing test-only profile. This operator
does not claim production Realm, portable billing, soul, inspiration, automatic
Godskills or arbitrary shell rollback qualification.

There is no personal Grok keel discovery or global model/settings change.
An explicit host-pinned [Godskills option](native-godskills-consumer.md) now binds
one selected stack to a native mission; omission remains the default. It cannot
be enabled, removed or repinned silently on an existing association.
Compatible model/provider support depends on the installed native host, an
explicit OAuth subscription and independent qualification; only the recorded
Grok trial is live evidence. Do not infer all-provider quality from Node tests.

## Verify

```powershell
$env:GODAGENTS_PI_PACKAGE_ROOT = 'absolute installed pi-coding-agent package root'
node --test tests/native-pi-operator-config.test.mjs tests/native-session-report.test.mjs tests/native-pi-operator.test.mjs tests/native-run-history.test.mjs tests/native-run-history-query.test.mjs tests/native-pi-operator-history.test.mjs tests/native-pi-operator-history-query.test.mjs tests/native-host-binding.test.mjs tests/pi-native-session.test.mjs
```

The real-SDK mechanics tests use a scripted provider and no paid inference.
Skipping the optional SDK tests is not a successful native qualification.
