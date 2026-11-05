/** Wird bei regelwidrigen Aktionen geworfen. Die Meldung ist für Spieler lesbar. */
export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}
