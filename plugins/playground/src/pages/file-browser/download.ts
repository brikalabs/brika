/**
 * Browser-side helper to start a file download from a blob URL.
 *
 * The blob is built by `useCallAction` from the binary response of
 * `readEntry` — see `binaryResponse(...)` in [actions.ts](./actions.ts).
 * No base64 anywhere in the loop.
 */

export function triggerDownload(blobUrl: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
