/**
 * Spark Receiver block view.
 *
 * A custom React view that fully owns this block's configuration UI in the
 * workflow editor. It fetches the hub's spark registry directly (the editor is
 * same-origin) and renders a grouped picker, replacing what used to be a
 * hardcoded spark field baked into the host config panel.
 */

import { useBlockConfig, useUpdateBlockConfig } from '@brika/sdk/block-views';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@brika/sdk/ui-kit';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface RegisteredSpark {
  type: string;
  id: string;
  pluginId: string;
  name?: string;
  description?: string;
}

interface SparkReceiverConfig {
  sparkType?: string;
}

export default function SparkReceiverView() {
  const { t } = useLocale();
  const config = useBlockConfig<SparkReceiverConfig>();
  const updateConfig = useUpdateBlockConfig();
  const [sparks, setSparks] = useState<RegisteredSpark[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/sparks')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: RegisteredSpark[]) => {
        if (!cancelled) {
          setSparks(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSparks([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, RegisteredSpark[]>();
    for (const spark of sparks) {
      const existing = map.get(spark.pluginId) ?? [];
      existing.push(spark);
      map.set(spark.pluginId, existing);
    }
    return [...map.entries()];
  }, [sparks]);

  const value = config.sparkType ?? '';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Zap className="size-3.5 text-amber-500" />
        <span className="font-medium text-sm">Spark type</span>
      </div>

      {loading && <p className="text-muted-foreground text-xs">Loading sparks...</p>}

      {!loading && sparks.length === 0 && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-muted-foreground text-sm">
          <Zap className="size-4" />
          <span>{t('blocks.spark-receiver.noSparks')}</span>
        </div>
      )}

      {!loading && sparks.length > 0 && (
        <Select value={value} onValueChange={(v) => updateConfig({ sparkType: v })}>
          <SelectTrigger className="bg-background">
            <SelectValue placeholder="Select spark type...">
              {value && (
                <span className="flex items-center gap-2">
                  <Zap className="size-4 text-amber-500" />
                  <span className="font-mono">{value}</span>
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {grouped.map(([pluginId, pluginSparks]) => (
              <SelectGroup key={pluginId}>
                <SelectLabel className="font-mono text-xs">{pluginId}</SelectLabel>
                {pluginSparks.map((spark) => (
                  <SelectItem key={spark.type} value={spark.type}>
                    <span className="flex items-center gap-2">
                      <Zap className="size-3 text-amber-500" />
                      <span>{spark.name ?? spark.id}</span>
                      <span className="font-mono text-muted-foreground text-xs">
                        ({spark.type})
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      )}

      <p className="text-muted-foreground text-xs">
        The block emits each matching spark's payload on its output port.
      </p>
    </div>
  );
}
