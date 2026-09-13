# Workspace export inspector

A local, read-only viewer for bundles emitted by
`src/workspace/revision-export.mjs`. It lists changed files, displays before and
after text, and verifies each text's SHA-256 hash with WebCrypto. No agent,
subscription, backend, network API, dependency install or personal keel is needed.

From the repository root, serve only this directory on loopback:

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory examples/workspace-export-inspector
```

Open `http://127.0.0.1:8765`, paste an export's JSON and choose **Inspect**.
Select a file to compare its texts. **Clear** removes the input and view.
Stop the server with Ctrl+C. Any equivalent local static server works. Serve over
loopback HTTP or HTTPS, not `file://`, because the page uses an ES module and
WebCrypto. The Python command requires Python to already be installed.

## What it does not establish

Anyone can construct text with matching hashes. This viewer does **not** validate
a release signature, actor identity, revision ancestry, original files on disk,
review approval, or execution safety. The parent/child hashes are only
shape-checked because the viewer does not receive their manifests. There are no
apply, approve, execute or upload actions. Pasted markup stays text.

Input is limited to 1 MiB of UTF-8 and 64 changed files. This deliberately does
not promise support for every larger export the runtime could emit. Clear, edits
and newer inspections supersede earlier asynchronous hash work.

## Checks

```powershell
node --test tests/export-inspector.test.mjs
$env:GODAGENTS_WORKSPACE_BROWSER_RUNTIME = 'C:/absolute/path/to/pinned-runtime.json'
node --test tests/export-inspector.test.mjs tests/export-inspector-ui.test.mjs
```

The browser configuration uses the existing Godagents named browser/driver/Node
pin format. Browser cases are explicitly skipped when it is absent. Tests cover
both hashes, UTF-8/BOM/empty texts, invalid fields/paths, duplicate paths, input
bounds, eight real-browser behaviors, desktop/mobile layout and stale async
clear/edit/new-inspection races. No model call is made by these tests.

This example was bootstrapped by an admitted Grok Godagent, then corrected and
verified by the host. See the dated project audit for the original failed
candidate and the exact distinction between model output and delivered code.
