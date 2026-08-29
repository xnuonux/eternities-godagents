export class SchemaError extends Error {
  constructor(schemaName, pointer, rule) {
    super(`${schemaName} rejected ${pointer}: ${rule}`);
    this.name = 'SchemaError';
    this.schemaName = schemaName;
    this.pointer = pointer;
    this.rule = rule;
  }
}

export class IntegrityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IntegrityError';
  }
}

export class AuthorityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorityError';
  }
}

export class DecisionRequiredError extends Error {
  constructor(categories) {
    super(`decision required: ${[...categories].sort().join(', ')}`);
    this.name = 'DecisionRequiredError';
    this.categories = [...categories].sort();
  }
}

export class UncertainEffectError extends Error {
  constructor(idempotencyKey) {
    super('realm effect occurred but transport confirmation was interrupted');
    this.name = 'UncertainEffectError';
    this.idempotencyKey = idempotencyKey;
  }
}
