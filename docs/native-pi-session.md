# Native Pi session adapter v1

This experimental SDK adapter lets an admitted Godagent work inside the real Pi
coding host. It does not implement another agent loop. The qualified optional host
for this milestone is `@earendil-works/pi-coding-agent` **0.85.1**. Import
`@eternities/godagents/native-pi`; call `loadPiSdk(absoluteInstalledPackageRoot)`
explicitly. No dependency is installed or imported until the host requests it.

## Ownership

- Pi owns inference, its core coding prompt, native tools, conversation tree,
  normal context retrieval, retry behavior, and compaction.
- Godagents owns the verified actor association and exclusive actor lease,
  host-grant checks, bounded mission context and action attribution.
- The operator owns credentials, model choice, filesystem/process access,
  spending, and decisions about which project the actor may work on.
- Godskills is not automatically activated. Personal-keel content, Soul,
  Inspiration, identity evolution and Lunari remain outside this adapter.

Native read/write/edit and optional shell tools are not restricted to a source
string or replacement-file JSON schema. `process-exec` is broad OS-user shell
authority. A shell command can read, write, spawn processes or access the network;
the adapter does not pretend that parsing its command text provides confinement.
File tools likewise run with the native host's OS-user access. `cwd` binds the
working project, not an OS sandbox. Host policy must authorize that exposure.

## Host setup

Use an existing **verified local admission**, including its creator/policy pins,
genesis receipt, distribution, journal and keel backend. Do not treat an inert
identity projection or an older zero-effect receipt as permission to use tools.
The executable setup in `tests/helpers/native-host-admission.mjs` demonstrates
creation and admission; `tests/pi-native-session.test.mjs` demonstrates the full
real-SDK lifecycle with a scripted provider and no API usage.

1. Create a persisted Pi `SessionManager` for the selected project. Its native
   UUID must equal `request.task.taskId` and `grant.sessionId`.
2. Set `request.task.hostAdapterId` to `pi-sdk-v1`; provide the mission and its
   evidence/stop conditions. Compile the existing cortex binding candidate to
   obtain the verified identity and Realm Contract digests.
3. Issue a fresh host grant and independently pin its canonical SHA-256 digest.
   Never let the model supply or approve its own grant or its expected digest.
4. Open the adapter with explicit Pi runtime, model, resource home, settings,
   session manager and binding options. The host supplies `ModelRuntime` using
   its normal credential store. No fallback model or provider is selected here.
5. Call `prompt(text)`, independently verify the result, then `close()`. Reopen
   the saved native session with the same binding options and `resume: true`.

Grant fields are exact, not extensible implicitly:

```js
const grant = {
  schemaVersion: 1,
  protocolId: 'eternities-native-host-grant-v1',
  instanceId, identityDigest, realmContractDigest,
  sessionId: sessionManager.getSessionId(), cwd,
  model: {provider: model.provider, id: model.id},
  expiresAt: 'a host-selected future ISO timestamp',
  allowedTools: ['read', 'write', 'edit'], // optional shell requires process authority
  maxToolCalls: 100,
};

const host = await openPiGodagentSession({
  runtime: await loadPiSdk(piPackageRoot),
  bindingOptions: {
    admission, request, grant, expectedGrantDigest,
    stateDirectory, registryRoot, instanceRegistryRoot,
    resume: false,
  },
  agentDir, modelRuntime, model, sessionManager, settingsManager,
});
try {
  host.subscribe(event => { /* normal Pi events, potentially containing private data */ });
  await host.prompt('complete the approved change and run its tests');
  const associationAndActions = await host.inspect();
  // A settled native turn is not proof that the requested product is correct.
} finally {
  await host.close();
}
```

`stateDirectory` must be outside the working project and must not be a drive
root. Keep admission, registry, agent resource home and state host-controlled.
The host grants only known tools whose effect classes fit the constitution and
whose capabilities exist in the verified Realm. It can grant shell access with
`bash` and/or `powershell` only when `process-exec` and `process.exec` are present.
Native tool budgets and expiry are enforced. Mission prose/evidence conditions
are not a semantic correctness checker; its token/cycle budget is not yet a
certified native-provider spending ledger. Configure provider/context limits in
Pi, and do not advertise these mission fields as hard billing caps.

## Execution and recovery

Native provider tool-call IDs are opaque correlation strings, not actor IDs.
The binding preserves them byte-for-byte, including Responses composite IDs
containing `|`, for duplicate detection, result matching and saved history.
They must be non-empty strings, at most 1,024 UTF-8 bytes, without whitespace
or control characters. Actor/session identifier rules and authority checks are
unchanged. The existing 8MB state-record ceiling remains a practical upper bound
for long sessions; a 10,000-call grant is not a guarantee that all such calls fit.

For xAI subscription use, select Pi's native OAuth login rather than an API key.
After loading `ModelRuntime`, perform its normal availability refresh before
using `isUsingSubscription`: `refreshOnCreate: false` leaves that snapshot cold
even when `checkAuth` can find stored OAuth credentials. The host still must
verify the actual auth type and selected provider; never silently fall back to
a paid credential. See the [live qualification record](audits/2026-09-13-native-pi-live-qualification.md).

The SDK owner uses Pi's public Agent stream and before/after-tool hooks. It does
not rely on `before_agent_start` or `before_provider_request` throwing, because
Pi logs some extension exceptions and continues. A failed pre-inference check
returns Pi's native error-stream protocol without calling the provider. The
same public stream is passed by Pi to compaction. Actual automatic compaction
and summary-provider failure recovery are covered by real-SDK scripted-provider
tests. Large-session stress and provider-specific behavior still need live
qualification. State counts native and compaction inference attempts separately;
these counters are not token usage or successful-inference certificates.

Only `prompt()` starts a user turn. Automatic compaction remains inside Pi's
turn/idle lifecycle and is awaited before settlement. A failed summary is
returned as `warnings: ['native-compaction-failed']`, with the completed native
turn preserved and the binding still usable. Provider faults do not become
authority denials. Manual compaction, steering/follow-up queues, branch changes
and arbitrary transcript edits are not exposed by this v1 owner. Event listeners
are ordinary trusted host callbacks, not an additional model-facing control API.
Native retry success is judged from the final assistant outcome, not an earlier
failed attempt. Exhausted retries reject the prompt without revoking the actor;
any further attempt must come through normal Pi behavior or a new operator call.

The first profile disables discovered extensions, skills, context files and
personal histories while retaining Pi's core prompt and built-in tools. It
does not expose the mutable raw session, `/reload`, model replacement or session
branch switching. Supporting those later requires an explicit migration, not
silently reinstalling hooks or changing the actor's native history.

Before a tool executes, a pending record binds its name, effect, argument hash
and current lease receipt. After it returns, the native result hash and error
flag are recorded. Raw inputs/results are **not** copied into these Godagent
records. Pi's normal transcript **does** contain normal messages and tool data;
protect that directory as private session data.

Clean settlement pins the native transcript bytes and session-tree state.
Changed history, missing state, a different actor/session/model, expired or
revoked grants, source changes, corrupt records and unresolved actions fail
closed. Startup does not count as a completed mission turn. New bindings cannot
silently adopt an existing personal conversation. An interrupted pending tool
is uncertain, not automatically replayable or safely rolled back. Inspect its
real effects before any separately authorized recovery.

This is a trusted-host integration, not protection against malicious code with
the same Windows account, malicious SDK replacements, a hostile provider
adapter, or hostile host extensions. Revocation stops subsequent dispatch but
cannot undo effects already executed by a native tool or its child processes.

## Verify

```powershell
$env:GODAGENTS_PI_PACKAGE_ROOT = 'absolute installed pi-coding-agent package root'
node --test tests/native-host-binding.test.mjs tests/pi-native-session.test.mjs
```

The Pi tests intentionally skip when the optional SDK path is absent. A skipped
suite is **not** native-host qualification. No live Grok quality claim follows
from the scripted-provider tests. Ordinary unbound Pi/Codex operation and old
Godagent runtime paths/certification receipts remain unchanged.
