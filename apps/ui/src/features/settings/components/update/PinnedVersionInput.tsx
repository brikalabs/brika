/**
 * Inline version-pin input. Visible only when the active channel is
 * `pinned`; submits via PUT /api/settings/update-pinned-version after
 * a debounce so a user typing a version string doesn't fire one API
 * call per keystroke.
 */

import { Button } from '@brika/clay/components/button';
import { Input } from '@brika/clay/components/input';
import { useEffect, useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import { usePinnedVersion, useSetPinnedVersion } from './channel-hooks';

const VERSION_RE = /^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u;

export function PinnedVersionInput() {
  const { t } = useLocale();
  const { data, isLoading } = usePinnedVersion();
  const { mutate, isPending } = useSetPinnedVersion();
  const [draft, setDraft] = useState<string>('');

  useEffect(() => {
    if (data?.version !== undefined && data.version !== null) {
      setDraft(data.version);
    }
  }, [data?.version]);

  const isValid = draft.length === 0 || VERSION_RE.test(draft);
  const hasChanges = draft !== (data?.version ?? '');

  return (
    <div className="flex flex-col gap-2">
      <label className="text-muted-foreground text-xs" htmlFor="pinned-version">
        {t('common:updates.pinnedVersionLabel', { example: '0.5.2' })}
      </label>
      <div className="flex gap-2">
        <Input
          id="pinned-version"
          value={draft}
          placeholder={
            isLoading ? t('common:status.loading') : t('common:updates.pinnedVersionPlaceholder')
          }
          onChange={(e) => setDraft(e.target.value)}
          aria-invalid={!isValid}
          className="max-w-xs font-mono"
        />
        <Button
          size="sm"
          disabled={!isValid || !hasChanges || isPending}
          onClick={() => mutate(draft.length === 0 ? null : draft)}
        >
          {isPending ? t('common:actions.saving') : t('common:actions.save')}
        </Button>
        {data?.version !== null && data?.version !== undefined && (
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              setDraft('');
              mutate(null);
            }}
          >
            {t('common:actions.clear')}
          </Button>
        )}
      </div>
      {!isValid && (
        <p className="text-destructive text-xs">
          {t('common:updates.pinnedVersionInvalid', { example1: '0.5.2', example2: 'v0.5.2-rc.1' })}
        </p>
      )}
    </div>
  );
}
