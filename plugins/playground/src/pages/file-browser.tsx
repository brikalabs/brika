import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderInfo,
  PageHeaderTitle,
} from '@brika/sdk/ui-kit';
import { FileBrowser } from './file-browser/FileBrowser';

export default function FileBrowserPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <PageHeader>
        <PageHeaderInfo>
          <PageHeaderTitle>File Browser</PageHeaderTitle>
          <PageHeaderDescription>
            Browse, upload, and manage files in the plugin&apos;s virtual{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">/data</code>{' '}
            directory. All filesystem access is gated by the consent UI and jailed to the
            plugin&apos;s data dir.
          </PageHeaderDescription>
        </PageHeaderInfo>
      </PageHeader>
      <FileBrowser />
    </div>
  );
}
