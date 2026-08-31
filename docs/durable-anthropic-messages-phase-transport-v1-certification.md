# Durable Anthropic Messages Phase Transport v1 Certification

- status: certified
- source commit: `5db28e50c178603470dcc79e7436e39f398158f0`
- receipt digest: `61fcab0d249a331de62bb754eb9abe71ca960ee93d1aabc093ccda465606c09d`
- fixture digest: `ebe14bbdd13f2a6a66d950c385c5a2628f54d1ac3aa64371110f40f2bd11bead`
- focused tests: 27
- full tests: 778
- release tests: 11
- unresolved inline-review defects: 0 critical, 0 important

This certifies local at-most-once Anthropic Messages execution, exact durable replay, separate completion-bound cache evidence, and closed credential and failure boundaries under deterministic fake-provider responses. It does not certify live provider quality or remote exactly-once execution.
