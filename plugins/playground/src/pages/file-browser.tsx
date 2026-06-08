import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderInfo,
  PageHeaderTitle,
} from '@brika/sdk/ui-kit';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { FileBrowser } from './file-browser/FileBrowser';

export default function FileBrowserPage() {
  const { t } = useLocale();
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <PageHeader>
        <PageHeaderInfo>
          <PageHeaderTitle>{t('fileBrowser.page.title')}</PageHeaderTitle>
          <PageHeaderDescription>{t('fileBrowser.page.description')}</PageHeaderDescription>
        </PageHeaderInfo>
      </PageHeader>
      <FileBrowser />
    </div>
  );
}
