# Grok structured output profile

An optional host-pinned `provider.structuredOutputProfile: "json-schema-v1"` forwards the existing provider-neutral phase output schema as `outputSchema` in the serialized process request. The pinned process translates that exact schema through the already reviewed Perseus bridge into the native CLI `--json-schema` argument. Native, review and revision all use their own existing schemas.

Without the field, request bytes and invocation arguments retain their previous shape. Unknown or null profiles reject. Adding the profile changes the policy, request and transport descriptor bindings; existing admissions or failed attempts must not be relabeled or retried. Create a new admission/policy binding or use the existing explicit dependency migration workflow. There is no global configuration change.

The profile does not grant tools, authority or retries. Process argument verification, credential isolation, completion budgets, strict `JSON.parse` of the response text, phase schema checks, usage/model accounting and durable reconciliation remain in force. A provider claim of structured output is not a valid artifact by itself. No fenced-code extraction, repair parser, alternate structured-output field or permissive fallback was added.

The raw `createGrokCliPhaseProcess` is a trusted host primitive, not a model tool or phase-admission authority. Like its existing arbitrary two-message prompt input, it accepts a host-supplied closed output schema for uses such as an unbound baseline. Exact Godagent phase-schema selection belongs to the issued phase port: `native.execute(dispatch)` validates the dispatch and compiles its schema internally; callers cannot supply a schema override there. The process verifies that the bridge receives exactly the schema in that digest-bound compiled request. Neither a raw process result nor a schema is an issued agent completion.

## Evidence and scope

The installed pinned Grok CLI's help documents `--json-schema`; its existing bridge implements `response_format` to that argument. Godagents previously supplied a schema only as natural-language prompt text. That omission is confirmed; the exact syntax of the prior malformed live answer was not retained and is not reconstructed.

One bounded native subscription probe in `D:/00-INDEX/operations/2026-09-10-grok-json-schema` passed the exact requested schema and produced matching valid JSON in `text` in 5391 ms. Requested model Grok4.6, low reasoning, max1024 inclusive completion, max1 dispatch, 90-second ceiling, no retries or paid fallback. The diagnostic records numeric usage and field shapes only; raw answer and hidden reasoning were not stored. This is structured-output compatibility evidence, not coding quality evidence.

Five focused tests were observed failing before implementation. After the narrow fix, 21 compiler/policy/structured-output tests passed in 5877.8191 ms; 47 existing process, durable transport, diagnostic, local artifact, guidance and workspace-owner checks passed in 13971.8317 ms. The new tests exercise actual pinned bridge argument construction and real child-process responses, all three phase artifacts, pin changes, default request preservation, malformed output refusal and credential-free durable replay. A live coding comparison is a separate gate.

Review prompted an additional boundary regression and explicit raw-host-versus-issued-phase documentation. The final focused file passed six tests in 2598.7217 ms, including rejection of an injected schema on the issued port, a stale phase descriptor, and a bridge-substituted schema before inference. No extra runtime capability was added for these checks.
