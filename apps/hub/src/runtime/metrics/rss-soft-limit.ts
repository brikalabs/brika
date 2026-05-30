/**
 * RssSoftLimitMonitor — sustained RSS breach detector.
 *
 * Tracks consecutive over-limit RSS samples for a single plugin process and
 * reports a breach only once a configurable number of consecutive samples
 * exceed the limit. Requiring N consecutive samples (rather than a single
 * spike) avoids flapping on transient allocation peaks.
 *
 * A limit of `0` disables the monitor entirely — `record` is always a no-op
 * and never reports a breach. After a breach is reported the monitor latches
 * (`#breached`) so a single sustained breach maps to exactly one restart
 * request; the caller is expected to discard the process afterwards.
 */
export class RssSoftLimitMonitor {
  readonly #limitBytes: number;
  readonly #consecutiveSamples: number;
  #breachStreak = 0;
  #breached = false;

  /**
   * @param limitBytes Per-plugin RSS soft-limit in bytes. `0` disables.
   * @param consecutiveSamples Number of consecutive over-limit samples
   *   required before a breach is reported. Must be >= 1.
   */
  constructor(limitBytes: number, consecutiveSamples: number) {
    this.#limitBytes = limitBytes;
    this.#consecutiveSamples = Math.max(1, consecutiveSamples);
  }

  get enabled(): boolean {
    return this.#limitBytes > 0;
  }

  /**
   * Feed one RSS sample (bytes). Returns `true` exactly once — on the sample
   * that completes a sustained breach. Subsequent calls return `false` until
   * a new monitor is created (the process is expected to be restarted).
   */
  record(rssBytes: number): boolean {
    if (!this.enabled || this.#breached) {
      return false;
    }

    if (rssBytes <= this.#limitBytes) {
      this.#breachStreak = 0;
      return false;
    }

    this.#breachStreak++;
    if (this.#breachStreak >= this.#consecutiveSamples) {
      this.#breached = true;
      return true;
    }
    return false;
  }
}
