import { FileBrowser } from './file-browser/FileBrowser';

export default function FileBrowserPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="space-y-1.5">
        <p className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-[0.18em]">
          Playground · Page
        </p>
        <h1 className="font-semibold text-lg leading-tight tracking-tight">File Browser</h1>
        <p className="max-w-2xl text-muted-foreground text-sm">
          Browse, upload, and manage files in the plugin&apos;s virtual{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">/data</code>{' '}
          directory. All filesystem access is gated by the consent UI and jailed to the
          plugin&apos;s data dir.
        </p>
      </header>
      <FileBrowser />
    </div>
  );
}
