# provider-backed identity cli v1 certification

- status: certified
- source commit: `3ffbc6f6a919a83498a4127ebac62bf466482322`
- receipt digest: `0a4ec8eee92ef20c5571837ddb4c152300ce88a7c6038ca76ecf0798909a9d88`
- fixture digest: `717b2352597de38e6a0c632d9430ccc96512c3847ebb5f773be8cdae9c816133`
- focused tests: 11
- full tests: 887
- release tests: 12

This certifies the bounded provider-backed identity CLI operator surface for both registered provider families. It includes real admission and identity-policy preflight, SDK-issued host construction, deterministic no-network execution, closed output and failure behavior, and source-bound evidence. It does not certify live provider quality or add authority to the existing identity-bound launcher.
