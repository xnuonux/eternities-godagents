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
