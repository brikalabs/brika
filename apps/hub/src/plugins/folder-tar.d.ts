/**
 * Type declarations for folder-tar plugin imports
 *
 * When importing a .tar file that corresponds to a folder,
 * the plugin packs the folder contents into a gzipped tar archive.
 *
 * @example
 * const archive = (await import("@/templates.tar")).default;
 * // archive is Uint8Array containing gzipped tar data
 */
declare module '*.tar' {
  const archive: Uint8Array<ArrayBuffer>;
  export default archive;
}
