import { assertSchema } from '../core/schema-validator.mjs';
import { applyCreatorCommand } from './draft.mjs';
import { validateCreatorChoice } from './contracts.mjs';

const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/;

export function replayCreatorPreset({ draft, preset }) {
  let choices;
  try {
    assertSchema('creator-preset', preset);
    if (!IDENTIFIER.test(preset.id) || !IDENTIFIER.test(preset.version)) throw new TypeError();
    choices = preset.choices.map((choice) => validateCreatorChoice(choice));
    if (choices.length === 0) throw new TypeError();
  } catch {
    throw new TypeError('creator preset is invalid');
  }

  let current = draft;
  for (const choice of choices) {
    current = applyCreatorCommand({
      draft: current,
      command: {
        schemaVersion: 1,
        ...choice,
        expectedDraftDigest: current.draftDigest,
      },
    });
  }
  return current;
}

