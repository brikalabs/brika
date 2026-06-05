import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCapture } from '@/features/analytics/hooks';
import { fetcher } from '@/lib/query';

interface HubTimezoneResponse {
  timezone: string | null;
}

const timezoneKeys = {
  all: ['settings', 'timezone'] as const,
};

export function useHubTimezone() {
  return useQuery({
    queryKey: timezoneKeys.all,
    queryFn: () => fetcher<HubTimezoneResponse>('/api/settings/timezone'),
  });
}

export function useUpdateHubTimezone() {
  const qc = useQueryClient();
  const capture = useCapture();
  return useMutation({
    mutationFn: (timezone: string) =>
      fetcher<HubTimezoneResponse>('/api/settings/timezone', {
        method: 'PUT',
        body: JSON.stringify({ timezone }),
      }),
    onSuccess: (_data, timezone) => {
      capture('settings.timezone_updated', { timezone });
      qc.invalidateQueries({
        queryKey: timezoneKeys.all,
      });
    },
  });
}
