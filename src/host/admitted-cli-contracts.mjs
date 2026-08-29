const REQUIRED = Object.freeze(['admission', 'policy', 'mission', 'request-id']);
const KEY_MAP = Object.freeze({
  admission: 'admissionRoot',
  policy: 'policyPath',
  mission: 'missionPath',
  'request-id': 'requestId',
});
const MESSAGES = Object.freeze({
  'argument-invalid': 'admitted launch CLI argument is invalid',
  'option-duplicate': 'admitted launch CLI option is duplicated',
  'option-missing': 'admitted launch CLI option is missing',
  'option-unexpected': 'admitted launch CLI option is not allowed',
  'value-invalid': 'admitted launch CLI option value is invalid',
});

export class AdmittedLaunchCliError extends Error {
  constructor(code) {
    if (!Object.hasOwn(MESSAGES, code)) throw new TypeError('admitted launch CLI error code is invalid');
    super(MESSAGES[code]);
    this.name = 'AdmittedLaunchCliError';
    this.code = code;
  }
}

function fail(code) {
  throw new AdmittedLaunchCliError(code);
}

function validateValue(name, value) {
  if (typeof value !== 'string' || value.length === 0 || /[\0\r\n]/.test(value)) fail('value-invalid');
  if (name === 'request-id' && (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
      || value === '.' || value === '..')) fail('value-invalid');
}

export function parseAdmittedLaunchCliArgs(argv) {
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
