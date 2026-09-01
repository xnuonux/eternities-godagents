# provider resolution authority outbox v1 design

## decision

Add one local crash-safe outbox around the certified authority-handoff packet
protocol. The outbox publishes one immutable signing request before returning it
to an operator, later accepts one exact signed-return envelope, and records one
terminal controller result. It never stores raw provider responses, dispatch
bodies, credentials, private keys, endpoints, model output, or callable handles.

## lifecycle

```text
absent -> awaiting-signature -> signed -> resolved
                                  \----> rejected
```

The operation key is derived from the verified host-description digest,
resolution-policy digest, phase, and dispatch digest. The immutable request
beneath that slot additionally binds the provider request digest and attempt id.
Every record is canonical, self-digested, and exclusively published. Changed
requests, signatures, responses, or operation bindings collide or fail
verification rather than overwrite.

`prepare` inspects the real controller, requires one unresolved pending attempt,
builds the certified signing request, and publishes it before returning.
`submit` verifies the stored request and signed return, reconstructs the exact
controller input, and invokes the existing controller with caller-resupplied raw
response bytes only in memory. A checkpoint after controller acceptance permits
failure injection before outbox terminal publication.

`reconcile` first verifies every stored byte and then inspects the real
controller. If the controller already accepted the exact decision, the outbox
publishes its terminal projection without reapplying the signature, requiring
the provider response, or performing provider work. If no signed return exists,
it reports `awaiting-signature`. No state permits automatic retry.

## safety

One per-operation file lock serializes publication and recovery. Unknown entries,
noncanonical files, reparse-point operation roots, malformed records, cross-family
packets, changed controller bindings, and terminal contradictions fail through a
closed integrity error before mutation. `.writing` files are inert.

The signed return remains structurally unverified until the existing provider
controller authenticates it. The outbox cannot create signatures or expand
authority. Provider truth and remote exactly-once execution remain outside proof.
