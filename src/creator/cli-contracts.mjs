const COMMON = Object.freeze(['policy', 'policy-digest', 'modules', 'expressions', 'presets']);
const COMMAND_OPTIONS = Object.freeze({
  catalog: COMMON,
  'preview-preset': Object.freeze([...COMMON, 'preset', 'creator']),
  'finalize-preset': Object.freeze([
    ...COMMON,
    'preset',
    'creator',
    'expected-preview-digest',
    'source-dir',
    'output-dir',
  ]),
});
const MESSAGES = Object.freeze({
  'argument-invalid': 'creator CLI argument is invalid',
  'command-invalid': 'creator CLI command is invalid',
  'option-duplicate': 'creator CLI option is duplicated',
  'option-missing': 'creator CLI option is missing',
  'option-unexpected': 'creator CLI option is not allowed',
  'value-invalid': 'creator CLI option value is invalid',
});
const DIGEST = /^[a-f0-9]{64}$/;
const PRESET_REF = /^preset:[a-z0-9][a-z0-9._-]{0,127}@[a-z0-9][a-z0-9._-]{0,127}$/;
const CREATOR_REF = /^[a-z0-9][a-z0-9:._-]{0,127}$/;
const KEY_MAP = Object.freeze({
  policy: 'policy',
  'policy-digest': 'policyDigest',
  modules: 'modules',
  expressions: 'expressions',
  presets: 'presets',
  preset: 'preset',
  creator: 'creator',
  'expected-preview-digest': 'expectedPreviewDigest',
  'source-dir': 'sourceDir',
  'output-dir': 'outputDir',
});

export class CreatorCliError extends Error {
  constructor(code) {
    if (!Object.hasOwn(MESSAGES, code)) throw new TypeError('creator CLI error code is invalid');
    super(MESSAGES[code]);
    this.name = 'CreatorCliError';
    this.code = code;
  }
}

function fail(code) {
  throw new CreatorCliError(code);
}

function validateValue(name, value) {
  if (typeof value !== 'string' || value.length === 0 || /[\0\r\n]/.test(value)) fail('value-invalid');
  if ((name === 'policy-digest' || name === 'expected-preview-digest') && !DIGEST.test(value)) {
    fail('value-invalid');
  }
  if (name === 'preset' && !PRESET_REF.test(value)) fail('value-invalid');
  if (name === 'creator' && !CREATOR_REF.test(value)) fail('value-invalid');
}

export function parseCreatorCliArgs(argv) {
  if (!Array.isArray(argv) || argv.some((value) => typeof value !== 'string')) fail('argument-invalid');
  const command = argv[0];
  const required = COMMAND_OPTIONS[command];
  if (!required) fail('command-invalid');
  const allowed = new Set(required);
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (typeof token !== 'string' || !/^--[a-z][a-z-]*$/.test(token)) fail('argument-invalid');
    const name = token.slice(2);
    if (!allowed.has(name)) fail('option-unexpected');
    if (values.has(name)) fail('option-duplicate');
    if (value === undefined || value.startsWith('--')) fail('option-missing');
    validateValue(name, value);
    values.set(name, value);
  }
  if (values.size !== required.length || required.some((name) => !values.has(name))) fail('option-missing');
  const options = Object.fromEntries(required.map((name) => [KEY_MAP[name], values.get(name)]));
  return Object.freeze({ command, options: Object.freeze(options) });
}
