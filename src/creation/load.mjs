import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { assertSchema } from '../core/schema-validator.mjs';
import {
  byteCompare,
  deepFreeze,
  expressionRef,
  moduleRef,
  parseModuleRef,
  validateModuleContract,
} from './contracts.mjs';
import { loadCreationPolicy } from './policy.mjs';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function childPath(directory, name) {
  return directory instanceof URL ? new URL(name, directory) : join(directory, name);
}

function readonlyMap(source) {
  const map = new Map(source);
  const reject = () => { throw new TypeError('creation module map is read-only'); };
  Object.defineProperties(map, {
    set: { value: reject },
    delete: { value: reject },
    clear: { value: reject },
  });
  return Object.freeze(map);
}

export async function loadCreationSources({
  candidatePath,
  policyPath,
  expressionPath,
  moduleDirectory,
}) {
  const [{ policy, policyDigest }, candidateInput, expressionInput, moduleFiles] = await Promise.all([
    loadCreationPolicy(policyPath),
    readJson(candidatePath),
    readJson(expressionPath),
    readdir(moduleDirectory),
  ]);

  const candidate = deepFreeze(structuredClone(assertSchema('creation-candidate', candidateInput)));
  const expression = deepFreeze(structuredClone(assertSchema('expression-overlay', expressionInput)));
  if (candidate.expressionRef !== expressionRef(expression)) {
    throw new TypeError('expression reference mismatch');
  }

  const allModules = new Map();
  for (const file of moduleFiles.filter((name) => name.endsWith('.json')).sort(byteCompare)) {
    const input = await readJson(childPath(moduleDirectory, file));
    const module = validateModuleContract(input, policy);
    const ref = moduleRef(module);
    if (allModules.has(ref)) throw new TypeError(`duplicate module ref ${ref}`);
    allModules.set(ref, module);
  }

  const selected = new Map();
  for (const kind of Object.keys(candidate.moduleRefs).sort(byteCompare)) {
    const ref = candidate.moduleRefs[kind];
    const parsed = parseModuleRef(ref);
    if (parsed.kind !== kind) throw new TypeError(`module kind mismatch for ${kind}`);
    const module = allModules.get(ref);
    if (!module) throw new TypeError(`selected module not found for ${kind}`);
    if (module.moduleKind !== kind) throw new TypeError(`module kind mismatch for ${kind}`);
    selected.set(ref, module);
  }

  if (selected.size !== 9) throw new TypeError('creation must select exactly nine module kinds');
  return Object.freeze({ candidate, policy, policyDigest, expression, modulesByRef: readonlyMap(selected) });
}
