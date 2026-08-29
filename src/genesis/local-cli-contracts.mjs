const REQUIRED = Object.freeze([
  'creation-dir',
  'policy-digest',
  'expected-creation-build-id',
  'prompt-os-artifact',
  'realm-contract',
  'workspace',
  'instance-id',
  'creator',
  'checkpoint-purpose',
]);
const KEY_MAP = Object.freeze({
  'creation-dir': 'creationDir',
  'policy-digest': 'expectedPolicyDigest',
  'expected-creation-build-id': 'expectedCreationBuildId',
  'prompt-os-artifact': 'promptArtifactPath',
  'realm-contract': 'realmContractPath',
  workspace: 'workspace',
  'instance-id': 'instanceId',
  creator: 'creatorRef',
  'checkpoint-purpose': 'checkpointPurpose',
});
const MESSAGES = Object.freeze({
  'argument-invalid': 'local admission CLI argument is invalid',
  'option-duplicate': 'local admission CLI option is duplicated',
  'option-missing': 'local admission CLI option is missing',
  'option-unexpected': 'local admission CLI option is not allowed',
  'value-invalid': 'local admission CLI option value is invalid',
});
const DIGEST = /^[a-f0-9]{64}$/;
const INSTANCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CREATOR_REF = /^[a-z0-9][a-z0-9:._-]{0,127}$/;

export class LocalAdmissionCliError extends Error {
  constructor(code) {
    if (!Object.hasOwn(MESSAGES, code)) throw new TypeError('local admission CLI error code is invalid');
    super(MESSAGES[code]);
    this.name = 'LocalAdmissionCliError';
    this.code = code;
  }
}

function fail(code) {
  throw new LocalAdmissionCliError(code);
}

function validateValue(name, value) {
  if (typeof value !== 'string' || value.length === 0 || /[\0\r\n]/.test(value)) fail('value-invalid');
  if ((name === 'policy-digest' || name === 'expected-creation-build-id') && !DIGEST.test(value)) {
    fail('value-invalid');
  }
  if (name === 'instance-id' && (!INSTANCE_ID.test(value) || value === '.' || value === '..'
      || value.includes('/') || value.includes('\\'))) {
    fail('value-invalid');
  }
  if (name === 'creator' && !CREATOR_REF.test(value)) fail('value-invalid');
}

export function parseLocalAdmissionCliArgs(argv) {
  if (!Array.isArray(argv) || argv.some((value) => typeof value !== 'string')) fail('argument-invalid');
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/.test(token)) fail('argument-invalid');
    const name = token.slice(2);
    if (!REQUIRED.includes(name)) fail('option-unexpected');
    if (values.has(name)) fail('option-duplicate');
    if (value === undefined || value.startsWith('--')) fail('option-missing');
    validateValue(name, value);
    values.set(name, value);
  }
  if (values.size !== REQUIRED.length || REQUIRED.some((name) => !values.has(name))) fail('option-missing');
  return Object.freeze(Object.fromEntries(REQUIRED.map((name) => [KEY_MAP[name], values.get(name)])));
}
