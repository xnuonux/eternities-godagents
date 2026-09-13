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
  "limits": {"maxRunMs": 900000}
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
npm run native:pi -- resume --config 'D:/operator/config.json' --pin <reviewed-digest> --prompt-file 'D:/operator/continue-task.md'
```

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
no automatic retry, alternate model or paid fallback. Ctrl+C and timeout revoke
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
node --test tests/native-pi-operator-config.test.mjs tests/native-session-report.test.mjs tests/native-pi-operator.test.mjs tests/native-run-history.test.mjs tests/native-pi-operator-history.test.mjs tests/native-host-binding.test.mjs tests/pi-native-session.test.mjs
```

The real-SDK mechanics tests use a scripted provider and no paid inference.
Skipping the optional SDK tests is not a successful native qualification.
