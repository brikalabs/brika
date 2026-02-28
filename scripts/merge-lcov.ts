#!/usr/bin/env bun
/**
 * Merge multiple LCOV files by summing hit counts for duplicate files.
 *
 * Usage: bun scripts/merge-lcov.ts coverage/phase1.lcov coverage/phase2.lcov > coverage/lcov.info
 *        bun scripts/merge-lcov.ts coverage/phase*.lcov > coverage/lcov.info
 */

interface FileData {
  fnf: number;
  fnh: number;
  /** line → hits */
  da: Map<number, number>;
}

const files = new Map<string, FileData>();

for (const path of process.argv.slice(2)) {
  const content = await Bun.file(path).text();
  let currentFile: string | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('SF:')) {
      currentFile = trimmed.slice(3);
      if (!files.has(currentFile)) {
        files.set(currentFile, { fnf: 0, fnh: 0, da: new Map() });
      }
    } else if (trimmed.startsWith('DA:') && currentFile) {
      const data = files.get(currentFile)!;
      const parts = trimmed.slice(3).split(',');
      const lineNum = Number(parts[0]);
      const hits = Number(parts[1]);
      data.da.set(lineNum, (data.da.get(lineNum) ?? 0) + hits);
    } else if (trimmed.startsWith('FNF:') && currentFile) {
      const data = files.get(currentFile)!;
      data.fnf = Math.max(data.fnf, Number(trimmed.slice(4)));
    } else if (trimmed.startsWith('FNH:') && currentFile) {
      const data = files.get(currentFile)!;
      data.fnh = Math.max(data.fnh, Number(trimmed.slice(4)));
    } else if (trimmed === 'end_of_record') {
      currentFile = null;
    }
  }
}

// Output merged LCOV
const lines: string[] = [];
for (const [file, data] of files) {
  lines.push('TN:');
  lines.push(`SF:${file}`);
  lines.push(`FNF:${data.fnf}`);
  lines.push(`FNH:${data.fnh}`);

  const sortedLines = [...data.da.entries()].sort((a, b) => a[0] - b[0]);
  for (const [lineNum, hits] of sortedLines) {
    lines.push(`DA:${lineNum},${hits}`);
  }

  const lf = sortedLines.length;
  const lh = sortedLines.filter(([, hits]) => hits > 0).length;
  lines.push(`LF:${lf}`);
  lines.push(`LH:${lh}`);
  lines.push('end_of_record');
}

process.stdout.write(lines.join('\n') + '\n');
