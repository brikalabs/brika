/**
 * Template tar packing and unpacking utilities using modern-tar
 */
import { join } from 'node:path';
import { packTar, type TarEntry, unpackTar } from 'modern-tar';

/**
 * Pack all files from the templates directory into a base64-encoded tar string
 * Returns base64 string for macro compatibility (Uint8Array can't be serialized to AST)
 */
export async function packTemplates(): Promise<string> {
  // Resolve templates directory relative to this file
  const templatesDir = join(import.meta.dir, '../../../templates');

  const glob = new Bun.Glob('**/*');
  const entries: TarEntry[] = [];

  for await (const relativePath of glob.scan({ cwd: templatesDir, absolute: false, dot: true })) {
    const fullPath = join(templatesDir, relativePath);
    const file = Bun.file(fullPath);

    // Check if it's a file (not directory)
    if (await file.exists()) {
      try {
        const content = await file.arrayBuffer();
        const data = new Uint8Array(content);

        entries.push({
          header: {
            name: relativePath,
            size: data.length,
            type: 'file',
          },
          body: data,
        });
      } catch (error) {
        console.error(`[templates] Failed to read ${relativePath}:`, error);
      }
    }
  }

  const tarBuffer = await packTar(entries);
  return Bun.gzipSync(Buffer.from(tarBuffer), { level: 9 }).toBase64();
}

/**
 * Unpack a tar buffer (from base64 string) and extract files to target directory
 */
export async function unpackTemplates(tarDataBase: string, targetDir: string): Promise<void> {
  const tarData = Bun.gunzipSync(Buffer.from(tarDataBase, 'base64'));
  const entries = await unpackTar(new Uint8Array(tarData));

  for (const entry of entries) {
    const filePath = join(targetDir, entry.header.name);

    // Check if file already exists
    const targetFile = Bun.file(filePath);
    if (await targetFile.exists()) {
      continue; // Skip existing files
    }

    // Write file - Bun.write creates parent directories automatically
    if (entry.data) {
      await Bun.write(filePath, entry.data);
      console.log(`[init] Created ${entry.header.name}`);
    }
  }
}
