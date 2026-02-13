import { registerDirCheck } from '../dir-rule';

// ─────────────────────────────────────────────────────────────────────────────
// Type augmentation for DirRule
// ─────────────────────────────────────────────────────────────────────────────

declare module '../dir-rule' {
  interface DirRule {
    /** Directories should contain these files */
    containFiles(...files: string[]): this;
    /** Directories should contain a specific file */
    containFile(file: string): this;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registrations
// ─────────────────────────────────────────────────────────────────────────────

registerDirCheck('containFiles', (...files: string[]) => ({
  name: `have ${files.join(', ')}`,
  check: async (ctx, dir) => {
    for (const file of files) {
      const path = dir.endsWith('/') ? `${dir}${file}` : `${dir}/${file}`;
      if (!(await ctx.exists(path))) {
        return { file: dir, message: `Missing "${file}"` };
      }
    }
  },
}));

registerDirCheck('containFile', (file: string) => ({
  name: `have ${file}`,
  check: async (ctx, dir) => {
    const path = dir.endsWith('/') ? `${dir}${file}` : `${dir}/${file}`;
    if (!(await ctx.exists(path))) {
      return { file: dir, message: `Missing "${file}"` };
    }
  },
}));
