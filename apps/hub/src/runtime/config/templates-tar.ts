/**
 * Template extraction utilities using Bun.Archive
 *
 * Templates are packed via the folder-tar plugin and unpacked
 * at runtime using Bun's native Archive API.
 */

import { join } from "node:path";
import type { Logger } from "../logs/log-router";

/**
 * Unpack a gzipped tar archive and extract files to target directory.
 * Files that already exist are skipped to preserve user modifications.
 */
export async function unpackTemplates(
  compressedData: Uint8Array<ArrayBuffer>,
  targetDir: string,
  logger: Logger,
): Promise<void> {
  const tarData = Bun.gunzipSync(compressedData);
  const archive = new Bun.Archive(tarData);
  const files = await archive.files();

  for (const [relativePath, file] of files) {
    const filePath = join(targetDir, '.brika', relativePath);
    const targetFile = Bun.file(filePath);
    if (await targetFile.exists()) {
      logger.debug("Skipping template file (already exists)", { file: relativePath });
      continue;
    }
    const content = await file.arrayBuffer();
    await Bun.write(filePath, content);
    logger.debug("Created template file", { file: relativePath });
  }
}
