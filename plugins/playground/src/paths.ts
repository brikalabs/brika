/**
 * Shared path constraints for the playground plugin.
 *
 * Both the JSON actions and the binary routes run inside the plugin process
 * and must enforce the same `/data` jail. The grant runtime is the actual
 * security boundary — this helper is defence-in-depth and exists to fail
 * fast with a clear error before the call ever hits the grant layer.
 */

export const DATA_ROOT = '/data';

export function isUnderData(path: string): boolean {
  if (!path.startsWith(`${DATA_ROOT}/`) && path !== DATA_ROOT) {
    return false;
  }
  return !path.split('/').includes('..');
}

export function assertUnderData(path: string): void {
  if (!isUnderData(path)) {
    throw new Error('Path must be under /data and may not contain ".."');
  }
}
