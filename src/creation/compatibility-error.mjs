const MESSAGES = Object.freeze({
  'module-ref-integrity-failed': 'module-ref integrity failed',
  'module-inheritance-unsupported': 'base module inheritance is not supported',
  'compatibility-tag-unavailable': 'compatibility tag is unavailable',
  'authority-effect-exceeds-policy': 'effect exceeds creation policy',
  'prompt-adapter-exceeds-policy': 'Prompt OS adapter exceeds creation policy',
  'module-capability-exceeds-policy': 'module capability exceeds creation policy',
  'cortex-adapter-exceeds-policy': 'cortex adapter exceeds creation policy',
  'cortex-capability-exceeds-policy': 'cortex capability exceeds creation policy',
  'godskills-contract-exceeds-policy': 'Godskills contract exceeds creation policy',
  'godskills-entrypoint-exceeds-policy': 'Godskill entrypoint exceeds creation policy',
  'realm-capability-exceeds-policy': 'Realm capability exceeds creation policy',
  'godskills-composition-exceeds-policy': 'Godskills composition exceeds creation policy',
  'lineage-archetype-incompatible': 'archetype tag is incompatible with lineage',
  'lineage-organ-missing': 'organ loadout omits a lineage default',
  'archetype-organ-missing': 'organ loadout omits an archetype organ',
  'lineage-godskill-missing': 'Godskill entrypoint omits a lineage default',
  'archetype-godskill-missing': 'Godskill entrypoint omits an archetype requirement',
  'capability-family-unavailable': 'capability family is unavailable',
  'embodiment-realm-unavailable': 'Realm capability required by embodiment is unavailable',
  'attribute-bounds-invalid': 'derived attribute bounds are invalid',
  'evolution-not-frozen': 'evolution must remain frozen',
  'soul-port-not-dormant': 'Soul port must remain dormant',
});

export const CREATION_COMPATIBILITY_CODES = Object.freeze(Object.keys(MESSAGES).sort());

export class CreationCompatibilityError extends TypeError {
  constructor(code) {
    if (!Object.hasOwn(MESSAGES, code)) throw new TypeError('unknown creation compatibility code');
    super(MESSAGES[code]);
    this.name = 'CreationCompatibilityError';
    this.code = code;
  }
}

export function compatibilityFailure(code) {
  throw new CreationCompatibilityError(code);
}

