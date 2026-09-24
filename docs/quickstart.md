# Your first Godagent run

This walkthrough exercises the local runtime with a deterministic fixture cortex.
It is the shortest way to see a mission become an authorized action and a recorded
result. No model request or credential access occurs.

## 1. Run from a checkout

Install Node.js 24 or newer and Git, then:

```sh
git clone https://github.com/xnuonux/eternities-godagents.git
cd eternities-godagents
node --version
npm run demo
```

These commands work in PowerShell and ordinary Unix shells. No `npm install` is
needed for this built-in demo: it uses Node's standard library and repository
source. The package is marked private and is not offered here as an npm release.

## 2. Read the result

The JSON output identifies the actor, fixture cortex, committed decision, action,
expected counter value, observed counter value, and journal path. A successful
run reports `expectedCounter: 1`, `observedCounter: 1`, and
`discrepancyClass: "none"`.

Each invocation creates a fresh `artifacts/demo-runtime/run-*/` directory:

```text
run-<unique suffix>/
  distribution/     compiled identity, prompt artifact, Realm contract, manifest
  events.jsonl      recorded lifecycle events
  snapshot.json    saved runtime state
```

Open the exact `journalPath` printed by your run. Each line is a JSON event. The
sequence ends with `cycle.completed`; an `action.receipt` records the observed
result. Existing runs are preserved. Repeating the command creates a new fixture
run; it is not a continuation of the previous one.

The fixture counter exists in memory. The saved journal is evidence of this run,
not a persistent external service or a live-model quality result. The demo uses
the runtime's explicit **unbound Godskills mode**, while retaining normal
constitution, authority, distribution, and receipt checks.

## 3. Verify the portable path

```sh
node --test tests/demo.test.mjs
```

The regression runs the actual script from a copied checkout, without prebuilt
distribution files, and restricts the child's filesystem access to that checkout.
It checks the result, journal, and preservation of prior runs. It does not certify
an arbitrary model host or a production sandbox.

## 4. Choose a real workflow

| Goal | Next guide | Extra requirements |
| --- | --- | --- |
| Understand actor and host responsibilities | [Concepts](concepts.md) | None |
| Create and admit an actor | [Creator/admission walkthrough](superpowers/specs/2026-08-29-local-creation-admission-shell.md) | Explicit creation and admission inputs |
| Run coding missions | [Native Pi operator](native-pi-operator.md) | Admitted actor, compatible installed Pi SDK, configured provider access, host-issued tool grant |
| Work with saved artifacts | [Local artifact workflow](local-artifact-workflow.md) | Pinned provider and operator policy for live runs |
| Add optional skills | [Native Godskills consumer](native-godskills-consumer.md) | Compatible separately configured Godskills checkout and selected stack |

Follow each guide's own preflight before inference. Provider availability,
credentials, spending limits, and tool authority are operator inputs. The current
native qualification records name Pi 0.85.1; a newer SDK is not automatically
qualified by those historical trials.

## Troubleshooting

- **Node is older than 24:** use a supported Node version before running the commands.
- **Permission denied when writing artifacts:** run from a writable checkout. The
  demo writes only its new run directory beneath `artifacts/demo-runtime`.
- **A distribution or schema check fails:** preserve the error and compare your
  checkout with the revision you intended to run. Do not disable integrity checks.
- **Looking for a chat interface:** this demo is a local runtime example. Use the
  native operator guide for the existing coding-host path.
