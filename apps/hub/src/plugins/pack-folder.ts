/**
 * Pack a folder into a gzipped tar archive using Bun.Archive
 */

import { resolve } from 'node:path'

export async function packFolder(folderPath: string): Promise<Uint8Array> {
  const glob = new Bun.Glob("**/*");
  const files: Record<string, Uint8Array> = {};

  for await (const relativePath of glob.scan({
    cwd: folderPath,
    absolute: false,
    dot: true,
  })) {
    const file = Bun.file(resolve(folderPath, relativePath));
    if (await file.exists()) {
      try {
        const content = await file.bytes();
        if (content.length > 0) {
          files[relativePath] = content;
        }
      } catch {
        // Skip directories or unreadable files
      }
    }
  }

  const archive = new Bun.Archive(files, { compress: "gzip", level: 9 });
  return archive.bytes();
}
