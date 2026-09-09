# Host-reviewed workspace browser runner

This internal executor tests selected immutable workspace revisions in a real
browser against an independently owned declarative suite. It does not grant an
agent permission to execute code. It is not yet exposed by the public SDK or
connected to the persistent actor's mission coordinator.

The initial profile is `host-reviewed-browser-local-v1`. Its current host
qualification uses Windows, Node24.18.0, Playwright Core1.62.1 and Chrome153.0.8010.36.
The input/result protocol is provider-neutral; this concrete implementation uses
Chromium-specific controls and must not be called a qualified cross-browser host.

## Host ownership

The host independently chooses and pins the runtime, approved revision digests,
suite catalog, and resource limits. A model cannot select executable paths,
launch arguments, environment variables, arbitrary tests or approval flags.
Reviewing a parent revision does not approve its modified children.

```js
import { createBrowserWorkspaceTestRunner } from '../src/workspace/browser-test-runner.mjs';
import { compileBrowserTestSuite } from '../src/workspace/browser-test-contracts.mjs';

const suite = compileBrowserTestSuite({
  schemaVersion: 1, testId: 'tasks.initial', entryPath: 'index.html',
  cases: [{ caseId: 'initial', steps: [
    { kind: 'assert-count', selector: '.task', count: 2 },
  ] }],
});
const runner = await createBrowserWorkspaceTestRunner({
  store: existingStoreConfig,
  runtime: verifiedPrivateRuntimeConfig,
  policy: {
    schemaVersion: 1, profile: 'host-reviewed-browser-local-v1',
    approvedRevisionDigests: [independentlyReviewedRevisionDigest],
    limits: {
      maxFiles: 4, maxAppBytes: 131072, maxResultBytes: 16384,
      stepTimeoutMs: 3000, launchTimeoutMs: 10000,
      runTimeoutMs: 30000, cleanupTimeoutMs: 10000,
    },
  },
  suites: [suite],
});
const descriptor = runner.describe();
const result = await runner.run({
  revisionDigest: independentlyReviewedRevisionDigest, testId: suite.testId,
});
```

The named variables are explicit host inputs, not discovery mechanisms. Store
configuration uses the [workspace revisions API](workspace-revisions.md).
The runner clones its inputs and refuses concurrent execution on the same handle.
It verifies runtime pins, descriptor and revision bytes again before dispatch.

Suites permit only click, fill, press, assert-count, assert-visible and assert-text.
There is no evaluation/script step, npm install, shell, server process or arbitrary
project test command. At most8 cases/128 total steps belong to one suite; each
case starts with a fresh browser context. The catalog holds at most16 suites.
The host may set lower ceilings. See the [closed contracts](superpowers/specs/2026-09-08-workspace-browser-runner-design.md#b-4-independently-owned-suites-and-bounded-observations).

## Runtime and execution boundary

`scripts/prepare-browser-test-runtime.mjs` takes an explicit selection and creates
a new private runtime configuration. It never installs or discovers software.
Named files are streamed and checked for canonical paths, regular single-link
identity, lengths and hashes before the driver is imported. The descriptor binds
the Node executable, driver entry/bootstrap/core/utility/package files, browser
launcher and named engine files. Scope is `named-driver-and-engine-files`, not
the full installation, operating system or transitive dependency closure.

The parent starts a fixed worker with bounded copied app bytes over stdin. The
worker independently validates the request, actual runtime, source digest and
scrubbed environment before importing the driver. Both worker and browser use
fixed neutral identity values, system-only PATH and fresh private app-data paths.
No provider credentials or normal user browser profile are needed.

App resources are fulfilled from the admitted byte map at a synthetic origin.
Other HTTP requests are aborted and WebSockets are closed without connecting to
an upstream server. Enforced CSP issues, request aborts, socket closures, extra
pages, navigation denials and download cancellation become fixed policy events.
Service workers are blocked, permission grants are empty, downloads disabled,
and Chromium sandbox operation is requested with disabling flags rejected.

These are browser/application-layer controls for reviewed local content. They
are not comprehensive DNS, WebRTC, background-browser or OS egress isolation,
exploit resistance, hard CPU/RAM quotas or sandbox attestation. Arbitrary hostile
code is outside this profile. Browser launch failure or an unresponsive worker
can leave cleanup uncertain; never infer the absence of an orphaned process
from a termination request alone.

## Results and recovery

Completed outcomes are `passed`, `failed`, `policy-violation` and
`infrastructure-error`. All require confirmed owned-browser cleanup. Records
bind the revision, suite, descriptor, controls, ordered steps, bounded observations,
elapsed times, fixed policy events and a digest. A policy violation dominates
otherwise passing assertions. Step timeouts and overall run timeouts remain
distinct; an observed assertion failure cannot be relabeled as an infrastructure
error. Text assertions compare the full text digest and byte length; diagnostic
samples are limited to512 UTF-8 bytes.

An uncertain execution returns an uncertainty marker rather than a completed
receipt. The parent does not retry. Its future mission owner must preserve that
uncertainty and reconcile the original operation before another dispatch.
Digest verification proves consistency, not authorship or actual execution by
itself; the issuing host must retain that source boundary.

Private diagnostic roots are retained for uncertain, policy and infrastructure
outcomes. Confirmed ordinary pass/fail temporary roots are cleaned up. Raw browser
errors are excluded from completed results. Completed records remain <=16KiB.
The IPC request is bounded at6MiB; the app-byte ceiling is separately host-pinned.

## Qualification and remaining work

Run `scripts/check-browser-workspace-runner.mjs` or
`scripts/check-browser-workspace-controls.mjs` with explicit `--runtime` and
`--output-root` arguments to create fresh, preserved qualification evidence.
These scripts execute only their inspected first-party fixtures. They do not
use a model or prove live model quality.

The [qualification record](audits/2026-09-08-workspace-browser-runner-closeout.md)
separates actual browser results from structural tests and release status.
The next product slice must bind this executor and revision store to an explicit
Workspace Realm, host-issued actor authority, mission persistence/recovery and
checked diff export. Existing artifact-only Realm contracts must not be widened
implicitly. Godskills trust ownership, identity, Soul and Lunari are unchanged.
