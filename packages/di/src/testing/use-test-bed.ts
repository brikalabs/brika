/**
 * Hook-style TestBed helper with auto lifecycle management.
 * Auto-stubbing enabled by default.
 *
 * @example
 * useTestBed(() => {
 *   stub(ConfigLoader, { rootDir: '/test' });
 * });
 */

import { afterEach, beforeEach } from 'bun:test';
import { TestBed } from './test-bed';

interface UseTestBedOptions {
  /** Enable auto-stubbing (default: true) */
  autoStub?: boolean;
}

export function useTestBed(): void;
export function useTestBed(setup: () => void): void;
export function useTestBed(options: UseTestBedOptions): void;
export function useTestBed(options: UseTestBedOptions, setup: () => void): void;
export function useTestBed(
  optionsOrSetup?: UseTestBedOptions | (() => void),
  setup?: () => void
): void {
  let options: UseTestBedOptions = {};
  let setupFn = setup;

  if (typeof optionsOrSetup === 'function') {
    setupFn = optionsOrSetup;
  } else if (optionsOrSetup) {
    options = optionsOrSetup;
  }

  const autoStub = options.autoStub !== false;

  beforeEach(() => {
    if (autoStub) TestBed.autoStub(true);
    setupFn?.();
  });

  afterEach(() => {
    TestBed.reset();
  });
}
