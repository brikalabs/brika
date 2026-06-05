import { useCapture } from '@/features/analytics/hooks';
import { UPDATE_CHANNELS } from '@/features/updates/api';
import { useSetUpdateChannel, useUpdateChannel } from './channel-hooks';
import { PinnedVersionInput } from './PinnedVersionInput';

export function ChannelSelector() {
  const capture = useCapture();
  const { data } = useUpdateChannel();
  const { mutate, isPending } = useSetUpdateChannel();
  const current = data?.channel ?? 'stable';

  const activeChannel = UPDATE_CHANNELS.find((c) => c.id === current);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {UPDATE_CHANNELS.map((ch) => {
          const active = ch.id === current;
          return (
            <button
              key={ch.id}
              type="button"
              disabled={isPending || active}
              onClick={() => {
                capture('settings.update_channel_selected', { channel: ch.id });
                mutate(ch.id);
              }}
              className={
                active
                  ? 'rounded-md border border-primary bg-primary/10 px-3 py-1.5 font-medium text-primary text-sm'
                  : 'rounded-md border px-3 py-1.5 text-muted-foreground text-sm hover:bg-accent disabled:opacity-50'
              }
            >
              {ch.label}
            </button>
          );
        })}
      </div>
      {activeChannel && (
        <p className="text-muted-foreground text-xs">{activeChannel.description}</p>
      )}
      {current === 'pinned' && <PinnedVersionInput />}
    </div>
  );
}
