/**
 * Public types for the supervisor. The class itself lives in
 * `./Supervisor.ts`; these are kept here so consumers can import types
 * without dragging in the runtime.
 */

import type { ServiceSpec } from '../config';

export type ServiceStatus =
  | { kind: 'pending' }
  | { kind: 'starting' }
  | { kind: 'healthy' }
  | { kind: 'crashed'; exitCode: number | null; reason: string };

/**
 * Public read-only view of a service's runtime state. All fields are
 * marked readonly to discourage external mutation — the supervisor
 * owns these objects and updates them in place.
 */
export interface ServiceState {
  readonly spec: ServiceSpec;
  readonly status: ServiceStatus;
  /** Most recent N lines from stdout+stderr, oldest first. */
  readonly logs: ReadonlyArray<string>;
  /** Monotonic counter that ticks every time logs/status change. */
  readonly revision: number;
  /** Port the service was observed listening on (set by `health: auto`). */
  readonly detectedPort: number | null;
}

export type SupervisorEvent =
  | { kind: 'state'; serviceId: string }
  /** Shutdown was requested — children are being SIGTERMed. */
  | { kind: 'shutting-down' }
  /** All children have been torn down (and SIGKILL'd if they ignored TERM). */
  | { kind: 'shutdown' };

export type Listener = (event: SupervisorEvent) => void;
