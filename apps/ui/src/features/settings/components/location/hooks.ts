import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { fetcher } from '@/lib/query';
import { reverseGeocode } from './photon';

export interface HubLocation {
  latitude: number;
  longitude: number;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string;
  formattedAddress: string;
}

interface HubLocationResponse {
  location: HubLocation | null;
}

const locationKeys = {
  all: ['settings', 'location'] as const,
};

export function useHubLocation() {
  return useQuery({
    queryKey: locationKeys.all,
    queryFn: () => fetcher<HubLocationResponse>('/api/settings/location'),
  });
}

export function useUpdateHubLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (location: HubLocation) =>
      fetcher<HubLocationResponse>('/api/settings/location', {
        method: 'PUT',
        body: JSON.stringify(location),
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: locationKeys.all,
      });
    },
  });
}

export function useLocationSettings() {
  const { data } = useHubLocation();
  const mutation = useUpdateHubLocation();
  const [detecting, setDetecting] = useState(false);
  const [draft, setDraft] = useState<HubLocation | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (data?.location && !isDirty) {
      setDraft(data.location);
    }
  }, [data, isDirty]);

  function handleAddressSelect(location: HubLocation) {
    setDraft(location);
    setIsDirty(true);
  }

  function handleFieldChange(field: keyof HubLocation, value: string) {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const numFields = new Set<keyof HubLocation>(['latitude', 'longitude']);
      return {
        ...prev,
        [field]: numFields.has(field) ? Number(value) || 0 : value,
      };
    });
    setIsDirty(true);
  }

  function handleDetect() {
    if (!navigator.geolocation) {
      return;
    }
    setDetecting(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const location = await reverseGeocode(latitude, longitude);
        setDraft(
          location ?? {
            latitude,
            longitude,
            street: '',
            city: '',
            state: '',
            postalCode: '',
            country: '',
            countryCode: '',
            formattedAddress: '',
          }
        );
        setIsDirty(true);
        setDetecting(false);
      },
      () => setDetecting(false),
      {
        timeout: 10_000,
      }
    );
  }

  function handleSave() {
    if (!draft) {
      return;
    }
    mutation.mutate(draft, {
      onSuccess: () => {
        setIsDirty(false);
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
      },
    });
  }

  return {
    draft,
    isDirty,
    detecting,
    showSaved,
    isSaving: mutation.isPending,
    hasLocation: !!draft && (!!draft.formattedAddress || draft.latitude !== 0),
    handleAddressSelect,
    handleFieldChange,
    handleDetect,
    handleSave,
  };
}
