# provider resolution authority handoff v1 design

## decision

Add one canonical authority-neutral handoff protocol between the certified
provider-resolution decision preparer and an external signing authority. The
handoff has two immutable artifacts:

1. an awaiting-signature request containing the exact canonical decision bytes
   and enough verified metadata to identify the host, policies, operation,
   response witness, and authority;
2. a signed-return envelope binding one canonical 64-byte Ed25519 signature to
   that exact request and decision.

The handoff does not sign, verify cryptographic authority, call a provider,
retry an operation, persist raw response bytes, or resolve durable state. The
existing family controller remains the sole component that verifies the real
public key and applies the decision.

## signing request

The builder accepts the same closed input as the certified decision preparer.
It first invokes that preparer, then emits:

- family and exact host-description digest;
- transport and resolution policy digests;
- authority key id;
- exact pending operation projection;
- family-native unsigned decision and response witness or `null`;
- exact canonical signing payload and its SHA-256 digest;
- explicit UTF-8 payload encoding and Ed25519 signature algorithm;
- one self-digest over the complete request.

No provider response body, request body, dispatch body, credential, endpoint,
model output, path, private key, signature, function, or mutable handle enters
the request. Adoption carries only the already certified response witness.

## signed return

The return binder accepts a verified request and one canonical base64 encoding
of exactly 64 bytes. It emits the unchanged decision inside the existing
`{ decision, signature }` controller shape, the unchanged response witness,
the request digest, and a self-digest. This is structural binding, not signature
authentication. The envelope therefore carries `cryptographicStatus:
unverified`; only successful acceptance by the existing resolution controller
authenticates it. The external signer and controller retain all cryptographic
authority.

## verification

Verification repeats host-description validation and requires exact controller
metadata plus the same pending operation. It validates both self-digests, the
canonical signing payload, family protocol identities, witness self-digest,
decision self-digest, disposition and witness-field semantics, and every host,
policy, authority, and operation binding. Cross-family substitution remains
invalid even after outer rehash.

## proof limits

This protocol proves deterministic portable byte exchange and structural
binding. It does not prove that a signature is authentic, that an external
authority reviewed provider evidence, that response bytes are truthful, that
the provider performed an operation exactly once, or that any durable ceremony
has published or consumed the artifacts. Those require the existing controller
and a later certified durable outbox.
