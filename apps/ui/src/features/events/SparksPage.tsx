import { useNavigate, useParams } from '@tanstack/react-router';
import { Clock, Zap } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { EventStreamTab, RegisteredSparksTab } from './components';

type SparkTab = 'registry' | 'stream';

export function SparksPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const activeTab: SparkTab = params.tab === 'stream' ? 'stream' : 'registry';

  const handleTabChange = (tab: string) => {
    navigate({ to: `/sparks/${tab}` });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">{t('sparks:title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('sparks:subtitle')}</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList>
          <TabsTrigger value="registry" className="gap-2">
            <Zap className="size-4" />
            {t('sparks:tabs.registry')}
          </TabsTrigger>
          <TabsTrigger value="stream" className="gap-2">
            <Clock className="size-4" />
            {t('sparks:tabs.stream')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="registry" className="mt-6">
          <RegisteredSparksTab />
        </TabsContent>
        <TabsContent value="stream" className="mt-6">
          <EventStreamTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
