# provider resolution decision preparer v1 design

## decision

Add one pure host-layer compiler that converts a verified provider phase host
description, exact controller metadata, and one inspected pending operation into
the provider family's exact unsigned resolution decision. Adoption also produces
the exact response witness named by the verified resolution profile.

The compiler returns immutable data and canonical signing text. It never accepts
a private key, signs a decision, calls a provider, retries an operation, chooses
a provider family ambiently, loads policy files, or mutates durable state.

## input and output

The closed input contains:

- `hostDescription`, verified by the existing host-description verifier;
- `controller`, containing only `policyDigest` and `authorityKeyId`;
- `inspected`, containing one `pending` operation with exact phase, dispatch,
  request, and attempt digests;
- an explicit `disposition`;
- one raw provider response only for `adopt-response`;
- exact issue and expiry instants;
- one bounded nonce.

The output contains the family-native `decision`, the family-native
`responseWitness` or `null`, and `signingPayload`, which is exactly the canonical
JSON text an external Ed25519 authority signs. The decision digest covers every
unsigned decision field. Deep freezing prevents mutation after preparation.

## profile-driven differences

The compiler uses only a resolution profile nested inside a verified host
description. It takes the decision and response-witness protocol identifiers
from that profile and places the witness digest in its declared family field:

- OpenAI-compatible uses `responseDigest`;
- provider-neutral Anthropic uses `responseWitnessDigest`.

No protocol translation occurs. A profile cannot be supplied independently,
and a cross-family profile substitution remains invalid even if an attacker
recomputes the outer description digest.

## trust boundary

The preparer proves deterministic byte construction, not authority. The caller
must load the real signed-resolution controller separately, compare its public
`policyDigest` and `authorityKeyId`, send `signingPayload` to an external signing
boundary, and pass the resulting `{ decision, signature }` unchanged to the
existing controller.

The preparer rejects unknown fields, invalid digests, invalid phases, non-pending
inspection state, malformed response bytes, unsupported dispositions, non-exact
ISO timestamps, non-increasing lifetimes, and malformed nonces. Policy-specific
maximum decision lifetime remains enforced by the signed controller because the
credential-free host description intentionally does not disclose policy files.

## proof limits

This layer does not prove possession of an authority key, signature validity,
policy lifetime compliance, provider availability, live response authenticity,
or exactly-once external execution. Integration tests prove that externally
signed prepared decisions are accepted by both existing family controllers with
zero additional provider calls.

