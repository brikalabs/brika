import { Button } from '@brika/clay/components/button';
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderInfo,
  PageHeaderTitle,
} from '@brika/clay/components/page-header';

export function PageHeaderDefaultDemo() {
  return (
    <PageHeader className="w-full max-w-2xl">
      <PageHeaderInfo>
        <PageHeaderTitle>Dashboards</PageHeaderTitle>
        <PageHeaderDescription>All your monitoring views in one place.</PageHeaderDescription>
      </PageHeaderInfo>
      <PageHeaderActions>
        <Button>New dashboard</Button>
      </PageHeaderActions>
    </PageHeader>
  );
}
