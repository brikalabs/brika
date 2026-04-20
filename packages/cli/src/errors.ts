/**
 * Thrown by commands to indicate a user-facing error.
 * The CLI runner catches this and prints the message without a stack trace.
 */
export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}
