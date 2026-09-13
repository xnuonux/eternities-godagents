# Native Pi session binding v1

Approved direction: `docs/native-coding-host-direction.md`. Implementation owner:
Codex. No live API spend, global settings changes, or changes to old receipts.

Deliver one supported Pi SDK integration, not a new agent loop. Pi owns its
native read/edit/write/shell tools, model runtime, compaction and session tree.

1. Test and implement a host-pinned native grant using the existing verified
   creation/admission/cortex binding and exclusive actor lease. Bind actor,
   mission, native session, cwd and model. A fresh native grant is distinct from
   old inert or zero-effect receipts. Tool effects cannot exceed the actor's
   constitution or declared Realm capabilities. Shell access is explicit broad
   `process-exec` authority, not a parsed safe-command claim.
2. Persist the association and pending/completed native calls outside the
   working project. Reject changed grants, revocation, expiry, duplicate calls,
   missing/tampered state and unresolved interruption. Store hashes, not tool
   bodies or secrets. Clean native-session resume must preserve actor identity.
3. Wire Pi's native tool hooks plus a pre-inference SDK guard. Pi 0.85.1 catches
   errors in `before_agent_start` and `before_provider_request`, so those hooks
   alone cannot enforce fail-closed inference. Guard the public Agent stream
   function in the SDK owner; append bounded actor context while preserving
   native instructions. Do not advertise an equivalent standalone CLI extension
   until its stop semantics are proven.
4. Exercise the real installed Pi SDK, native tool execution, and persisted
   sessions with a deterministic provider stream. Prove actual file mutation,
   forbidden tools not executing, pre-inference denial, effect receipts, clean
   resume and interrupted-action refusal. This is host integration evidence,
   not live model-quality evidence. Native Grok-through-Pi requires Pi login.
5. Review, targeted regression checks, merge and publish the bounded result.

Non-goals: OS sandboxing, hostile same-user or hostile extension isolation,
atomic shell rollback, takeover of uncertain in-flight tools, new model routes,
automatic Godskills activation, personal-keel content writes, Lunari or Soul.
Trusted host code and later extensions can alter native execution. The supported
SDK profile owns extension loading and cannot promise OS-level confinement.
