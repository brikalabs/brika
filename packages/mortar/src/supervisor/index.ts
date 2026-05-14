/**
 * Barrel for the supervisor module. Importers target this path
 * (`../supervisor`) — the split into Supervisor.ts + types.ts +
 * command-parser / kill-tree / stream-reader / health / port-detect
 * is an implementation detail.
 */

export { splitCommand } from './command-parser';
export { Supervisor } from './Supervisor';
export type { Listener, ServiceState, ServiceStatus, SupervisorEvent } from './types';
