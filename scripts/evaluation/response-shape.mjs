// Diagnostic projection of already bounded, safety-screened JSON only.
// No arbitrary provider strings, field names, answer bodies or reasoning are retained.
// A shape is not proof of validity, attribution, quality, cost or provider success.
const type = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const classify = (value, known) => value === undefined ? 'missing'
  : known.includes(value) ? value : 'other';

export function responseShape(envelope, expectedModel) {
  const choices = envelope?.choices;
  const choice = Array.isArray(choices) ? choices[0] : undefined;
  const message = choice?.message;
  const content = message?.content;
  const isText = typeof content === 'string';
  let parsed;
  let jsonParseable = false;
  if (isText) {
    try { parsed = JSON.parse(content); jsonParseable = true; }
    catch { /* Shape diagnostics do not repair or accept an answer. */ }
  }
  return {
    schemaVersion: 1, nonAuthoritative: true,
    rootType: type(envelope), modelMatches: envelope?.model === expectedModel,
    errorType: type(envelope?.error), usageType: type(envelope?.usage),
    choicesType: type(choices), choiceCount: Array.isArray(choices) ? choices.length : null,
    firstIndexIsZero: choice?.index === 0,
    finishReason: classify(choice?.finish_reason, ['stop', 'length', 'tool_calls', 'content_filter', 'function_call']),
    messageType: type(message), messageRole: classify(message?.role, ['assistant', 'user', 'system', 'tool', 'function']),
    toolCallsType: type(message?.tool_calls), contentType: type(content),
    contentBytes: isText ? Buffer.byteLength(content, 'utf8') : null,
    answer: {
      jsonParseable, jsonRootType: jsonParseable ? type(parsed) : null,
      rootFieldCount: jsonParseable && type(parsed) === 'object' ? Object.keys(parsed).length : null,
      outerContentType: jsonParseable ? type(parsed?.content) : null,
      startsWithFence: isText ? content.trimStart().startsWith('```') : null,
    },
  };
}
