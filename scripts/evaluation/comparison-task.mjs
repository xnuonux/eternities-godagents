import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text } from '../../src/core/digest.mjs';

const text = value => typeof value === 'string' && value.trim().length > 0;
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

function checkJson(root) {
  let nodes = 0;
  let bytes = 0;
  const visit = (value, depth) => {
    if (++nodes > 4096 || depth > 32) throw new Error('comparison task structure exceeds bound');
    if (typeof value === 'string') bytes += Buffer.byteLength(value);
    if (bytes > 65_536) throw new Error('comparison task exceeds bound');
    if (value === null || ['string', 'boolean'].includes(typeof value)) return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (!value || typeof value !== 'object'
        || (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) {
      throw new Error('comparison task requires plain JSON values');
    }
    if (Object.hasOwn(value, '__proto__')) throw new Error('comparison task contains an unsupported JSON key');
    if (Array.isArray(value) && (Object.keys(value).length !== value.length
        || Object.keys(value).some((key, index) => key !== String(index)))) {
      throw new Error('comparison task array must be dense with index keys only');
    }
    for (const key of Object.keys(value)) {
      bytes += Buffer.byteLength(key);
      visit(value[key], depth + 1);
    }
  };
  visit(root, 0);
}

// Binds task wording only, not equivalence of host instructions, tools or memory.
// This pure helper neither qualifies an oracle nor permits model dispatch.
export function bindComparisonTask({ task, baselineSubject, godagentObjective } = {}) {
  if (!task || Array.isArray(task) || typeof task !== 'object'
      || Object.keys(task).sort().join(',') !== 'input,objective,outputFormat,requirements'
      || !text(task.objective) || !text(task.outputFormat)
      || !Array.isArray(task.requirements) || task.requirements.length < 1 || task.requirements.length > 32
      || task.requirements.some(item => !text(item))
      || new Set(task.requirements).size !== task.requirements.length) throw new Error('comparison task is invalid');
  let subjectText;
  checkJson(task);
  try { subjectText = canonicalJson(task); }
  catch { throw new Error('comparison task must be canonical JSON'); }
  if (Buffer.byteLength(subjectText) > 65_536) throw new Error('comparison task exceeds bound');
  if (baselineSubject !== subjectText || godagentObjective !== subjectText) {
    throw new Error('comparison subject differs between arms or from the task');
  }
  return freeze({ task: JSON.parse(subjectText), subjectText, taskDigest: sha256Text(subjectText) });
}
