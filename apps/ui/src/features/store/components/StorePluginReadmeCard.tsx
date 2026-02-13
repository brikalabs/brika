import { FileText } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { Markdown } from '@/features/plugins/components/Markdown';
import { useLocale } from '@/lib/use-locale';

interface StorePluginReadmeCardProps {
  readme: string;
  filename?: string | null;
}

export function StorePluginReadmeCard({ readme, filename }: Readonly<StorePluginReadmeCardProps>) {
  const { t } = useLocale();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-5 text-primary" />
          {t('store:sections.readme')}
          {filename && (
            <Badge variant="outline" className="ml-auto font-mono text-xs">
              {filename}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Markdown>{readme}</Markdown>
      </CardContent>
    </Card>
  );
}
