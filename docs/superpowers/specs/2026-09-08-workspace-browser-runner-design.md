# Host-reviewed browser workspace test runner

Baseline: `51df9e0ee5b4fd4bd4797838ead050416e558285`.
Decision under standing Godagents development authority. This is the next concrete
executor dependency, not a completed workspace actor or a general sandbox.

## B-1: purpose and trust decision

Run independently owned behavioral tests against exact completed workspace
revisions. Preserve original files, identity boundaries and historical receipts.
The desired downstream outcome remains an actor editing a selected app, testing
it, recovering and exporting a checked diff, followed by a matched native baseline.

Select an explicit `host-reviewed-browser-local-v1` reference profile. Only
host-reviewed first-party app revisions are eligible in this initial profile.
An exact revision allowlist is supplied by the trusted host, not by a model or
app file. A new revision is not eligible merely because a model produced it or
the revision store verified its bytes. Existing actor profiles gain no permission.
Controlled implementation tests use inspected first-party broken/fixed apps;
live model-driven and arbitrary acquired-project execution remain excluded here.

Alternatives, on the same axes:

| Option | Actual behavior tests | Authority and setup | Consequence |
| --- | --- | --- | --- |
| Browser-local, host-reviewed static app (chosen first reference) | Real DOM, event and rendering observations | Existing pinned browser/driver; fresh profile; no shell commands from app or model | Narrow useful reference, with explicitly limited security claims |
| Same-user arbitrary Node/project commands | Broad project testing | Direct host filesystem/process/network authority | Too broad as the default reference; requires a distinct explicit trust profile |
| Qualified isolated process/container runner | Broad project testing with separately proven controls | No such installation is currently qualified; no installation or security-setting change authorized by this slice | Preserve as a later executor implementation, not a fake capability today |
| Existing Codex transport receipt alone | Records a response, not the tested bytes and observed app behavior | Existing transport | Insufficient proof of an edit/test outcome |

Strongest objection: this adds a web-specific dependency before general project
execution. Counterweight: it exercises a real app using the installed environment,
while the neutral input/result contract preserves replacement by other executors.
Revisit if a qualified general runner becomes available or real tasks show this
profile cannot deliver useful work. Never relabel the web reference as universal
project execution or as completed Godagents.

## B-2: authority and security boundaries

The app receives bytes in a fresh browser context, not a host filesystem path,
Node API, shell, provider credential, existing browser profile or test-module path.
The host owns approved revision digests, suite bytes, runtime pins and deadlines.
The app/model cannot alter those through a proposal. Browser temporary state is
separate from immutable revisions and original projects.

Required browser-layer controls: request the Chromium sandbox; inspect actual
launch arguments and reject known disabling flags; use a fresh temporary profile;
explicit environment allowlist; no caller-supplied flags, proxies, extensions,
downloads, permissions or existing storage; block service workers; serve only
the exact admitted in-memory routes; abort other intercepted HTTP requests;
close WebSockets without connecting; close unexpected pages; reject navigation
outside the admitted origin/routes. Use a restrictive response CSP as an additional
browser-layer control, not as a substitute for request and navigation checks.

**No DNS, comprehensive egress, OS sandbox attestation, browser-exploit resistance,
hard CPU/RAM quota, or hostile-same-user isolation claim.** Request interception
does not establish those properties. Background-browser traffic and unobserved
protocol paths remain coverage limitations. The profile is restricted to reviewed
first-party content precisely because these broader guarantees are not available.
Do not claim that a requested flag proves all subprocess security properties.

The prior probe verified a first-party click and exercised HTTP/WebSocket blocking
with sandbox requested; it did not qualify this new runner. Current read-only
verification found Edge152.0.4191.66 with SHA-256
`02aaed8823a4e4bae8f672c620c9356bddebd68651d5bfd141ed9e6576d5f03c`.
The installed Playwright package is1.62.1. These are local evidence, not portable
defaults or permission to download anything. Runtime paths/pins remain host config.
The separate primary engine `152.0.4191.66/msedge.dll` is343699272 bytes with
SHA-256 `1de5608477f40579c32c85b8478aa3d9824d9e7c85b21c23f3bc3f30fc539845`.
An executable-only pin therefore must not be described as whole-browser integrity.

Task2 local preflight update: the Edge engine has four vendor hardlink names and
was rejected by the unchanged single-link verification rule. The explicit
alternative is the already-installed Chrome153.0.8010.36, whose launcher and
engine are single-link files. All eight selected Node/driver/Chrome files passed
static preflight; see Task2 in the implementation plan for the private configuration
digest and preserved failure evidence. No security exception, installation,
vendor copy or browser launch was needed. Browser choice remains host configuration,
not a new actor permission or a claim of runtime qualification.

## B-3: neutral operation, concrete reference implementation

One host-owned runner executes one suite on one verified revision:

```text
createBrowserWorkspaceTestRunner({store, runtime, policy, suites})
  -> issued frozen handle with describe() and run({revisionDigest,testId})
```

The exported contract must stay executor-neutral where it describes revision,
suite, descriptor, outcomes and resource observations. Browser settings belong
only to this profile. No arbitrary commands, JavaScript expressions, environment
overrides or paths are accepted in `run`. Model output is never a test result.

`store` is a host-owned store configuration (root plus exact limits), resolved
internally through the existing revision-store implementation. Do not accept a
duck-typed caller replacement for the verifier. Only completed revisions pass.
Read bounded copies of selected files through the store; build an exact in-memory
route table. Never point Chromium at the original source or `file:` URLs.
Reverify the revision before returning evidence. Pending roots are never served.

The first profile supports explicitly selected static HTML/CSS/JS/JSON and passive
image/font assets with closed MIME mapping. Unselected resources and unsupported
formats reject; there is no filesystem discovery, directory server, localhost
application server, package installation or implicit remote dependency resolution.
Limits for selected file count and bytes cannot exceed the store's limits.
Initial reference ceilings are16 selected files and4MiB of app bytes; output is
at most16KiB. These are conservative implementation bounds, not performance claims.

`runtime` binds exact host-selected browser executable and named driver source
pins, their identities/versions, the runner's source descriptor, and fixed launch
policy. This first profile deliberately chooses a **named partial pin scope**,
not an installation-wide or OS-loader closure claim. It must include the worker,
Node executable, driver entry/bootstrap/core/utility bundles, browser launcher,
and explicitly selected engine files. Other system libraries and optional vendor
dependencies remain part of the trusted host environment, not attested by these
pins. The qualification report must list exactly which files were checked.
Unknown or changed declared pins reject before browser launch. The API must not
load an arbitrary caller module to discover its digest. Only host-provisioned
driver roots are eligible, with an exact configured entry and prechecked files.

The driver bootstrap reads environment variables during import. Start a fresh
Node worker with its scrubbed environment **before** loading the driver; scrubbing
only the browser child or changing process.env after import is insufficient.
The worker uses fixed system-directory PATH resolution and an explicit allowlist
of SystemRoot/WINDIR/TEMP/TMP. Do not inherit NODE_OPTIONS, PW_*, DEBUG, provider
credentials, proxy variables, user PATH or unrelated process variables. Required
fixed driver options, if discovered, must become reviewed profile constants, not
caller overrides. Node and browser environment policies are independently bound.

Actual Windows process creation restored seven omitted identity/home variables.
The fixed implementation therefore supplies neutral USERNAME/USERDOMAIN/LOGONSERVER,
system-only SYSTEMDRIVE, and HOMEDRIVE/HOMEPATH/USERPROFILE within the fresh temporary
root before creation. APPDATA and LOCALAPPDATA also point to newly created private
subdirectories there. A child-process test checks the entire resulting environment
against this closed declaration before driver import; ambient values are not
silently accepted. This completed the real Chrome launch without using the user's
normal profile or changing any system setting. The five-key sketch above is
superseded by the exact `ENV_POLICY` and `buildBrowserWorkerEnvironment` contract.

Chromium's source treats an unknown default-data-directory determination as a
remote-debugging refusal, not only a positively identified default directory:
[remote-debugging gate](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/devtools/remote_debugging_server.cc).
Its Windows default directory depends on local app data:
[Windows path implementation](https://chromium.googlesource.com/chromium/src/+/main/chrome/common/chrome_paths_win.cc).
This motivated the private app-data hypothesis, which the local broken/fixed
execution then verified as resolving this host's launch failure. It is not an
instruction to bypass Chrome's restriction or reuse a logged-in profile.

The public descriptor has a closed shape:

```text
{schemaVersion, protocolId, profile, runnerSourceDigest, workerSourceDigest,
 nodeVersion, nodeExecutableDigest, driverVersion, driverFiles,
 browserVersion, browserExecutable, browserEngineFiles, runtimePinScope,
 nodeEnvironmentPolicyDigest, browserEnvironmentPolicyDigest, launchPolicyDigest,
 suiteCatalogDigest, storePolicyDigest, reviewedRevisionsDigest, limits,
 descriptorDigest}
```

Each named file row is `{path,bytes,sha256}` with a canonical installation-relative path;
private absolute installation roots stay in host configuration, not requests or
model-visible receipts. `runtimePinScope` is exactly `named-driver-and-engine-files`.
The descriptor digest covers the canonical unsigned record. Unknown fields or a
claim of full-engine/OS closure fail rather than silently upgrading this profile.
Static named-file verification accepts at most32 files, at most1GiB per file,
using streaming hash buffers rather than engine-sized allocations.
Bind both executable and engine rows: changing one cannot reuse a prior descriptor.
Pinning is consistency within the trusted host, not protection from a malicious
operator who controls the allowlist, binaries and pins together.

`policy` contains the profile ID, exact approved revision digest set, resource
ceilings and fixed browser-layer control declaration. It cannot be widened by the
run request. These are host capabilities, not self-authenticating model fields.
Later actor/Realm admission must independently issue the corresponding owner.

## B-4: independently owned suites and bounded observations

Use a small closed declarative suite, not executable test code supplied by the
model: test ID, entry path, named cases and bounded steps. Initial step kinds are
click, fill, press, assert-text, assert-visible and assert-count. Selectors and
expected values belong to the host's pinned suite. No evaluate, arbitrary module,
script text, custom selector engine, shell or dynamically fetched test definition.
This is a browser interaction contract, not a general workflow language.

At most8 cases and128 total steps; each selector at most512 UTF-8 bytes, input or
expected text at most4096 bytes, whole canonical suite at most64KiB. Each case
starts with fresh browser-context state. The host may choose lower limits.
Step deadlines at most5000ms, launch at most10000ms, run at most60000ms plus at
most10000ms for cleanup. These bound requested work/deadlines, not hard OS resource
isolation. The implementation must prove owned-browser cleanup on timeout paths.

Completed evidence binds revision digest, suite digest/test ID, runner descriptor,
browser/driver pins, control observations, case/step results, elapsed time and
an evidence/receipt digest. A completed run has outcome passed, failed,
policy-violation or infrastructure-error. A test failure is not a transport error;
an observed policy violation cannot be hidden behind otherwise passing assertions.
Only independently observed assertions can produce passed.

The result verifier receives the verified host suite and descriptor, not only
their digest strings. It requires every case and step in exact suite order.
Execution stops on the first failed step or run-level stop; `not-run` is only
the remaining global suffix. There is no implicit independent-case continuation.
Completed records use this closed shape:

```text
{schemaVersion, revisionDigest, testId, testSuiteDigest, descriptorDigest,
 outcome, reason, policyEvents, elapsedMs, cleanup:{confirmed,elapsedMs}, controls,
 cases:[{caseId,steps:[{stepIndex,kind,outcome,reason,observation,elapsedMs}]}],
 receiptDigest}
```

`receiptDigest` hashes the complete unsigned record; it is consistency evidence,
not authentication. The runner/owner boundary must establish its source.
Step outcomes are passed, failed or not-run. Action observations are null;
assert-count observes a safe nonnegative integer, assert-visible a boolean, and
assert-text `{sample,textDigest,textBytes}`. Text samples are <=512 UTF-8 bytes;
only the full text digest and byte length determine exact-text equality, retaining
the semantics of expected strings up to4096 bytes. If text is <=512 bytes the
sample must be the full observed text, and its digest must match. Larger observed
text is streamed/bounded by the worker's observation implementation, not copied
wholesale into the receipt. No claim of authenticated observation follows from
a caller rehashing a record.

Passed steps have reason null; failed steps use assertion-mismatch, step-timeout,
run-timeout or driver-error; not-run steps use prior-stop and have null observation/zero time.
The run reason is null for passed, assertion-mismatch/step-timeout for failed,
blocked-request/unexpected-navigation/unexpected-page for policy-violation, or
launch-error/driver-error/run-timeout for infrastructure-error. A failed step
without an observation is allowed only for timeout or driver error.
The first failed step determines the run failure class and reason, except for
the explicit policy-violation override. An assertion mismatch or step timeout
cannot be relabeled as a launch/driver error. A step-level driver error requires
the matching infrastructure-error/driver-error run outcome. A step interrupted
by the overall deadline retains run-timeout and requires the matching
infrastructure-error/run-timeout outcome and elapsed time at least that deadline.
It cannot replace an already observed assertion mismatch with a timeout.

`policyEvents` is a deduplicated array of at most six fixed observations, in first
observed order: csp-blocked, http-aborted, websocket-closed, unexpected-page,
navigation-denied, download-cancelled. A nonempty array requires policy-violation;
its first event determines the reason. An empty array cannot certify a policy
violation. CSP is observed through Chromium's native Audits.issueAdded event,
not an application-callable callback. HTTP abort, socket closure and download
cancellation are recorded after their driver acknowledgement. This records
browser/application-layer observations, not complete network or DNS isolation.
These fields refine the unreleased v1 branch; earlier branch receipts remain
historical evidence and are not silently converted to the revised contract.

Controls are closed boolean observations: sandboxRequested,
sandboxArgumentsChecked, freshContexts, nodeEnvironmentScrubbed,
browserEnvironmentScrubbed, serviceWorkersBlocked, downloadsDisabled,
permissionsEmpty, routeInterception and webSocketInterception. All are required
before an observed step is accepted. These are declarations checked at the
worker boundary, not comprehensive network/OS attestation. Run-level policy
violations override otherwise passing/failed steps. The exact descriptor binds
runtime pins without duplicating them in each result. All completed outcomes
require confirmed cleanup; uncertainty is returned outside this completed-record
contract. Actual elapsed observations may exceed requested deadlines when an
infrastructure timeout is reported; deadlines are not claimed as hard OS quotas.

Return bounded diagnostics rather than raw HTML, full browser errors or unlimited
console logs. Case/step IDs and fixed failure classes are mandatory; any captured
app text is limited and belongs only to the admitted app. Never include environment,
credentials, arbitrary URLs or browser-profile paths. No screenshot requirement
or performance/quality claim is introduced by this version.

The runner owns only one physical invocation. It does not add a journal or retry
an uncertain run. If completion or browser cleanup cannot be confirmed, return
uncertainty rather than a successful receipt. Later authenticated workspace-owner
integration must persist dispatch intent before invoking and decide recovery from
durable evidence. An absent response never proves that no test ran.

## B-5: implementation gates and scope

1. Pin/validate neutral contracts and the concrete host profile before any launch.
   Cover unapproved revisions, tampered suites, mismatched runtimes, unknown flags,
   invalid routes, excess inputs and counterfeit completion with deterministic
   negative tests. Passing these alone does not qualify execution.
2. Resolve the declared named runtime file set from the installed dependency and
   define host configuration. Report partial-pin exclusions explicitly. If the
   declared files or required controls cannot be established, stop qualification;
   no arbitrary driver import or automatic installation.
3. Implement the smallest real browser runner. Demonstrate an actual failing
   independent assertion on an inspected first-party broken app, followed by a
   passing assertion on its separately reviewed fixed revision. Verify original,
   parent, suite and source bytes remain unchanged. This is conformance evidence,
   not a fresh live model-quality comparison.
4. Exercise network/navigation refusal, environment isolation at the launch
   boundary, timeout/cleanup, unexpected pages, changed pins and changed revisions.
   Record what was observed and what remains outside coverage.
5. Independent review and exact source-bound integration proof before merge.
   Preserve all existing actor/Realm/SDK/receipt behavior. No historical receipt
   regeneration or provider call as a shortcut to proving a filesystem outcome.

Remaining downstream work: Workspace Realm/admission, authenticated owner and
operation source, mission-loop connection, durable interruption recovery, checked
diff export and matched fresh quality evidence. This runner grants none of those
permissions by itself. Soul, Lunari, paid API calls, credentials, security-setting
changes, arbitrary project execution and global configuration remain excluded.
