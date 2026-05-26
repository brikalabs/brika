import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  channelApi,
  channelKeys,
  pinnedVersionKeys,
  type UpdateChannelId,
  updateKeys,
} from '@/features/updates/api';

export function useUpdateChannel() {
  return useQuery({
    queryKey: channelKeys.all,
    queryFn: channelApi.get,
  });
}

export function useSetUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channel: UpdateChannelId) => channelApi.set(channel),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: channelKeys.all });
      // Re-check for updates after switching channels
      qc.invalidateQueries({ queryKey: updateKeys.check });
    },
  });
}

export function usePinnedVersion() {
  return useQuery({
    queryKey: pinnedVersionKeys.all,
    queryFn: channelApi.getPinnedVersion,
  });
}

export function useSetPinnedVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: string | null) => channelApi.setPinnedVersion(version),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pinnedVersionKeys.all });
      qc.invalidateQueries({ queryKey: updateKeys.check });
    },
  });
}
