# Subprocess boundary verification

This boundary adds process-shaped outcomes to the existing durable phase engine.
It is not yet a production Grok transport or a live native-versus-Godagent result.
The Grok readiness probe remains separate evidence.

## Test-first evidence

The following are observed command summaries, not reconstructed raw test logs.
Original tool outputs remain in the task history.

1. New `tests/durable-process-phase.test.mjs`: 0/7 passed, 7 failed, 125.2949 ms.
   Existing witnesses rejected process responses; the engine required network
   callbacks and accepted mixed network/process configuration.
2. Initial implementation: 6/7 passed, 1 failed, 1274.8919 ms. Signed adoption's
   final reread omitted the process-mode discriminator. Corrected that exact
   path and inspected all sibling operation/resolution reads.
3. New and legacy HTTP/resolution tests: 48/48 passed, 4920.4501 ms.
4. Review-driven policy-mutation regression: 9/10 passed, 1 failed, 1990.142 ms.
   Mutating the caller's policy widened the response ceiling. Process policy
   and descriptors are now snapshotted/frozen and the policy digest verified.
5. Async-rejecting credential-screen regression: 0/1 passed, 1 failed,
   634.7542 ms, unhandled rejection. Promise-like guards still deny immediately,
   and their rejection is consumed instead of escaping the operation boundary.
6. New and legacy tests: 51/51 passed, 4925.3031 ms.
7. Response-snapshot regressions: 0/2 passed, 2 failed, 673.0115 ms. A checkpoint
   could change the returned body before inspection; accessor-backed results
   were accepted. Process responses are now captured as closed frozen data
   before callbacks/awaits, and accessors are rejected without invocation.
8. Latest targeted gate: **53/53 passed**, 0 failed/cancelled/skipped/todo,
   **4951.4602 ms**, exit 0:

```powershell
node --test tests/durable-process-phase.test.mjs tests/anthropic-messages-phase-transport.test.mjs tests/provider-phase-resolution-policy.test.mjs tests/openai-compatible-phase-resolution.test.mjs
```

The twelve process tests include a real local Node child, actual admitted native
dispatch/completion verification, terminal replay, uncertain-outcome no-retry,
signed exact adoption and tamper rejection, credential canaries, process-mode
pinning, response limits, mutation and malformed-result checks. The 41 legacy
tests cover HTTP transport and operator resolution behavior. No provider call or
real credential was needed for these tests.

## Independent review

Existing reviewer seat `01a07e22-93d9-7c82-981e-91ea6f493e98` reviewed the scoped
diff. Review suggestions were tested instead of accepted as proof. The response
snapshot gap was reproduced and fixed in this batch rather than deferred. Final
review and the full integration gate must be recorded before merge completion.

## Remaining proof

Full-suite integration and merged-head checks remain pending at this checkpoint.
No historical receipts have been regenerated. Production Grok source/version
binding, credential lifecycle, process controls, actual phase-port qualification,
usage interpretation and live same-provider comparisons are still future work.
This code does not claim provider-side exactly-once delivery or general sandbox
isolation, and introduces no new agent host type, Soul activation or Lunari use.
