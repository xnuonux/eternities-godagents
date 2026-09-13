const MAX_INPUT_BYTES = 1048576;
const MAX_CHANGES = 64;
const MAX_PATH_BYTES = 1024;
const HEX64 = /^[0-9a-f]{64}$/;
const BUNDLE_KEYS = ["parentDigest", "revisionDigest", "changes"];
const CHANGE_KEYS = ["path", "beforeSha256", "afterSha256", "beforeText", "afterText"];

function fail(message) {
  throw new Error(message);
}

function utf8Bytes(text) {
  return new TextEncoder().encode(text);
}

function hasUnpairedSurrogate(text) {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = text.charCodeAt(i + 1);
      if (!(n >= 0xdc00 && n <= 0xdfff)) return true;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertExactKeys(value, keys, label) {
  assertPlainObject(value, label);
  const actual = Object.keys(value);
  if (actual.length !== keys.length) fail(`${label} has unknown or missing fields`);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail(`${label} missing field ${key}`);
    }
  }
}

function assertDigest(value, label) {
  if (typeof value !== "string" || !HEX64.test(value)) {
    fail(`${label} must be lowercase 64-hex`);
  }
}

function assertText(value, label) {
  if (typeof value !== "string") fail(`${label} must be a string`);
  if (value.includes("\0")) fail(`${label} contains NUL`);
  if (hasUnpairedSurrogate(value)) fail(`${label} has unpaired UTF-16`);
}

function assertPath(path) {
  if (typeof path !== "string" || path.length === 0) fail("empty path");
  if (hasUnpairedSurrogate(path)) fail("path has unpaired UTF-16");
  if (path !== path.normalize("NFC")) fail("path is not NFC");
  if (utf8Bytes(path).length > MAX_PATH_BYTES) fail("path exceeds 1024 bytes");
  if (path.startsWith("/")) fail("absolute path");
  if (path.includes(":")) fail("colon in path");
  if (path.includes("\\")) fail("backslash in path");
  for (let i = 0; i < path.length; i++) {
    const c = path.charCodeAt(i);
    if (c < 32 || c === 127) fail("control character in path");
  }
  const segments = path.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") {
      fail("empty or dot path segment");
    }
  }
}

async function sha256Hex(text) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) fail("crypto.subtle is required");
  const digest = await subtle.digest("SHA-256", utf8Bytes(text));
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export async function inspectBundle(text) {
  if (typeof text !== "string") fail("input must be a string");
  if (hasUnpairedSurrogate(text)) fail("input has unpaired UTF-16");
  if (utf8Bytes(text).length > MAX_INPUT_BYTES) fail("input exceeds 1048576 bytes");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("invalid JSON");
  }
  assertExactKeys(parsed, BUNDLE_KEYS, "bundle");
  assertDigest(parsed.parentDigest, "parentDigest");
  assertDigest(parsed.revisionDigest, "revisionDigest");
  if (!Array.isArray(parsed.changes)) fail("changes must be an array");
  if (parsed.changes.length > MAX_CHANGES) fail("too many changes");
  const seen = new Set();
  for (let i = 0; i < parsed.changes.length; i++) {
    const change = parsed.changes[i];
    assertExactKeys(change, CHANGE_KEYS, `change[${i}]`);
    assertPath(change.path);
    const folded = change.path.toLowerCase();
    if (seen.has(folded)) fail("duplicate path");
    seen.add(folded);
    assertDigest(change.beforeSha256, "beforeSha256");
    assertDigest(change.afterSha256, "afterSha256");
    assertText(change.beforeText, "beforeText");
    assertText(change.afterText, "afterText");
    const beforeHash = await sha256Hex(change.beforeText);
    const afterHash = await sha256Hex(change.afterText);
    if (beforeHash !== change.beforeSha256) fail("beforeSha256 mismatch");
    if (afterHash !== change.afterSha256) fail("afterSha256 mismatch");
  }
  return parsed;
}

function bindUi(documentRef) {
  const input = documentRef.getElementById("bundle-input");
  const inspectBtn = documentRef.getElementById("inspect");
  const clearBtn = documentRef.getElementById("clear");
  const status = documentRef.getElementById("status");
  const filesNav = documentRef.getElementById("files");
  const selectedPath = documentRef.getElementById("selected-path");
  const beforePre = documentRef.getElementById("before");
  const afterPre = documentRef.getElementById("after");
  if (!input || !inspectBtn || !clearBtn || !status || !filesNav || !selectedPath || !beforePre || !afterPre) {
    return;
  }

  let generation = 0;

  function setStatus(state, message) {
    status.setAttribute("data-state", state);
    status.textContent = message;
  }

  function clearPanes() {
    filesNav.replaceChildren();
    selectedPath.textContent = "";
    beforePre.textContent = "";
    afterPre.textContent = "";
  }

  function showChange(change) {
    selectedPath.textContent = change.path;
    beforePre.textContent = change.beforeText;
    afterPre.textContent = change.afterText;
    for (const button of filesNav.querySelectorAll("button[data-path]")) {
      if (button.getAttribute("data-path") === change.path) {
        button.setAttribute("aria-current", "true");
      } else {
        button.removeAttribute("aria-current");
      }
    }
  }

  function renderValid(bundle) {
    clearPanes();
    for (const change of bundle.changes) {
      const button = documentRef.createElement("button");
      button.type = "button";
      button.setAttribute("data-path", change.path);
      button.textContent = change.path;
      button.addEventListener("click", () => {
        showChange(change);
      });
      filesNav.append(button);
    }
    if (bundle.changes.length > 0) {
      showChange(bundle.changes[0]);
    }
    setStatus("valid", bundle.changes.length === 0 ? "Text hashes match. No changed files." : `Text hashes match for ${bundle.changes.length} changed file(s).`);
  }

  inspectBtn.addEventListener("click", async () => {
    const token = ++generation;
    clearPanes();
    setStatus("checking", "Checking text hashes…");
    try {
      const bundle = await inspectBundle(input.value);
      if (token !== generation) return;
      renderValid(bundle);
    } catch (error) {
      if (token !== generation) return;
      clearPanes();
      setStatus("invalid", error instanceof Error ? error.message : "Invalid bundle");
    }
  });

  clearBtn.addEventListener("click", () => {
    generation += 1;
    input.value = "";
    clearPanes();
    setStatus("idle", "Paste an export to inspect its changes.");
  });

  input.addEventListener("input", () => {
    generation += 1;
    clearPanes();
    if (status.getAttribute("data-state") === "idle" && input.value === "") {
      setStatus("idle", "Paste an export to inspect its changes.");
      return;
    }
    setStatus("idle", "Input changed. Inspect again to check this version.");
  });
}

if (typeof document !== "undefined") {
  bindUi(document);
}
