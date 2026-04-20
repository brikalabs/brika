import { UPDATE_CHANNELS } from '@/features/updates/api';
import { useSetUpdateChannel, useUpdateChannel } from './channel-hooks';

export function ChannelSelector() {
  const { data } = useUpdateChannel();
  const { mutate, isPending } = useSetUpdateChannel();
  const current = data?.channel ?? 'stable';

  return (
    <div className="flex gap-2">
      {UPDATE_CHANNELS.map((ch) => {
        const active = ch.id === current;
        return (
          <button
            key={ch.id}
            type="button"
            disabled={isPending || active}
            onClick={() => mutate(ch.id)}
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
  );
}
