import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
} from '@brika/clay';
import { ChevronDown, Loader2, MapPin, Navigation } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCapture } from '@/features/analytics/hooks';
import { AddressSearch } from '@/features/settings/components/location/AddressSearch';
import type { HubLocation } from '@/features/settings/components/location/hooks';
import {
  useLocationSettings,
  useUpdateHubLocation,
} from '@/features/settings/components/location/hooks';
import { StaticMap } from '@/features/settings/components/location/StaticMap';
import { type SetupPath, StepBody, StepHeader, StepNav } from './shared';

const TEXT_FIELDS = ['street', 'city', 'postalCode', 'state', 'country'] as const;
const NUM_FIELDS = ['latitude', 'longitude'] as const;

export function LocationStep() {
  const { t } = useTranslation('setup');
  const {
    draft,
    isDirty,
    detecting,
    hasLocation,
    handleAddressSelect,
    handleFieldChange,
    handleDetect,
  } = useLocationSettings();

  const [showDetails, setShowDetails] = useState(false);
  const updateMutation = useUpdateHubLocation();
  const capture = useCapture();

  const handleDetectClick = () => {
    capture('auth.setup_location_detected');
    handleDetect();
  };

  // Save on Continue if there is a draft and changes are pending. Otherwise
  // just navigate forward — location is optional.
  const handleContinue = async (): Promise<SetupPath> => {
    if (draft && isDirty) {
      await updateMutation.mutateAsync(draft);
    }
    return '/setup/update';
  };

  return (
    <>
      <StepHeader
        eyebrow={t('location.eyebrow')}
        title={t('location.title')}
        subtitle={t('location.subtitle')}
      />

      <StepBody>
        <AddressSearch onSelect={handleAddressSelect} />

        {!hasLocation && (
          <EmptyState
            detecting={detecting}
            onDetect={handleDetectClick}
            emptyHint={t('location.emptyHint')}
            detectLabel={t('location.detect')}
            detectingLabel={t('location.detecting')}
          />
        )}

        {hasLocation && draft && (
          <LocationCard
            draft={draft}
            showDetails={showDetails}
            onShowDetailsChange={(open) => {
              if (open) {
                capture('auth.setup_location_details_expanded');
              }
              setShowDetails(open);
            }}
            onFieldChange={handleFieldChange}
            onRedetect={handleDetectClick}
            redetecting={detecting}
            t={t}
          />
        )}

        <StepNav
          back="/setup/timezone"
          onContinue={handleContinue}
          loading={updateMutation.isPending}
        />
      </StepBody>
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

interface EmptyStateProps {
  detecting: boolean;
  onDetect: () => void;
  emptyHint: string;
  detectLabel: string;
  detectingLabel: string;
}

function EmptyState({
  detecting,
  onDetect,
  emptyHint,
  detectLabel,
  detectingLabel,
}: Readonly<EmptyStateProps>) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-border/60 border-dashed bg-foreground/[0.015] px-6 py-8 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-foreground/5">
        <MapPin className="size-5 text-muted-foreground/70" />
      </div>
      <p className="max-w-[300px] text-[12.5px] text-muted-foreground leading-relaxed">
        {emptyHint}
      </p>
      <Button variant="outline" size="sm" onClick={onDetect} disabled={detecting} className="gap-2">
        {detecting ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            {detectingLabel}
          </>
        ) : (
          <>
            <Navigation className="size-3.5" />
            {detectLabel}
          </>
        )}
      </Button>
    </div>
  );
}

interface LocationCardProps {
  draft: HubLocation;
  showDetails: boolean;
  onShowDetailsChange: (open: boolean) => void;
  onFieldChange: (field: keyof HubLocation, value: string) => void;
  onRedetect: () => void;
  redetecting: boolean;
  t: (key: string) => string;
}

function LocationCard({
  draft,
  showDetails,
  onShowDetailsChange,
  onFieldChange,
  onRedetect,
  redetecting,
  t,
}: Readonly<LocationCardProps>) {
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-foreground/[0.015] p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <MapPin className="size-4" />
        </div>
        <p className="min-w-0 flex-1 truncate font-medium text-[13.5px]">
          {draft.formattedAddress || t('location.unknownCity')}
        </p>
        <button
          type="button"
          onClick={onRedetect}
          disabled={redetecting}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground disabled:opacity-50"
          aria-label={t('location.detect')}
        >
          {redetecting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Navigation className="size-3.5" />
          )}
        </button>
      </div>

      {draft.latitude !== 0 && draft.longitude !== 0 && (
        <div className="overflow-hidden rounded-lg ring-1 ring-border/60">
          <StaticMap latitude={draft.latitude} longitude={draft.longitude} />
        </div>
      )}

      <Collapsible open={showDetails} onOpenChange={onShowDetailsChange}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between text-muted-foreground"
          >
            {t('location.editDetails')}
            <ChevronDown
              className={`size-4 transition-transform ${showDetails ? 'rotate-180' : ''}`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid grid-cols-2 gap-3 pt-3">
            {TEXT_FIELDS.map((field) => (
              <div key={field}>
                <Label className="text-[11px] text-muted-foreground">
                  {t(`location.${field}`)}
                </Label>
                <Input
                  value={draft[field]}
                  onChange={(e) => onFieldChange(field, e.target.value)}
                  className="mt-1 h-8 text-sm"
                />
              </div>
            ))}
            {NUM_FIELDS.map((field) => (
              <div key={field}>
                <Label className="text-[11px] text-muted-foreground">
                  {t(`location.${field}`)}
                </Label>
                <Input
                  value={draft[field]}
                  onChange={(e) => onFieldChange(field, e.target.value)}
                  type="number"
                  step="any"
                  className="mt-1 h-8 text-sm"
                />
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
