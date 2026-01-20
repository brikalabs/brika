/**
 * Template extraction utilities using Bun.Archive
 *
 * Templates are packed via the folder-tar plugin and unpacked
 * at runtime using Bun's native Archive API.
 */

import { join } from 'node:path'
/**
 * Unpack a gzipped tar archive and extract files to target directory.
 * Files that already exist are skipped to preserve user modifications.
 *
 * @param compressedData - Gzipped tar archive (number[] from bundler or Uint8Array)
 * @param targetDir - Directory to extract files to
 */
export async function unpackTemplates(
  compressedData: Uint8Array<ArrayBuffer>,
  targetDir: string,
): Promise<void> {
  const tarData = Bun.gunzipSync(compressedData);
  const archive = new Bun.Archive(tarData);
  const files = await archive.files();

  for (const [relativePath, file] of files) {
    const filePath = join(targetDir, relativePath);
    const targetFile = Bun.file(filePath);
    if (await targetFile.exists()) {
      console.log(`[init] Skipping ${relativePath} - file already exists`);
      continue;
    }
    const content = await file.arrayBuffer();
    await Bun.write(filePath, content);
    console.log(`[init] Created ${relativePath}`);
  }
}
