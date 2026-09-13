# Native operator run history

`history` is an offline, read-only view of recorded native operator runs. It does
not create a model runtime, load credentials, or prove that a session is safe to
resume.

## Command

```
node src/host/native-pi-cli.mjs history --config <absolute-config.json> --pin <sha256-hex>
```

`--help` prints the command surface and exits 0 without reading config or
credentials.

`history` uses the same independently pinned config file as `preflight`,
`launch`, `resume`, and `status`. It does not accept `--prompt-file`.

After the pin and existing session metadata/state checks used by `status`, the
CLI reads `sessionRoot/runs/<uuid>/started.json` and optional `result.json`.

## Output

JSON with `status: "recorded-history"`, per-run `entries`, `counts` of
`settled` / `failed` / `incomplete`, and aggregated `usage`. Failed and
incomplete attempts stay in the report. Missing usage stays `null`; an
incomplete run nulls all usage totals. Private prompt, response, tool, and
error bodies are not included.

This is an observation of files on disk, not a certificate of product
correctness.

## Authority

Native tools run as the OS user. This operator is not a sandbox and does not
guarantee a billing cap. `resume` still revalidates actor, lease, expiry, and
native history.
