import { Check, ChevronDown, Loader2, MapPin, Navigation } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
  Separator,
} from '@/components/ui';
import { AddressSearch } from '@/features/settings/components/location/AddressSearch';
import type { HubLocation } from '@/features/settings/components/location/hooks';
import { useLocationSettings } from '@/features/settings/components/location/hooks';
import { StaticMap } from '@/features/settings/components/location/StaticMap';
import { StepBody, StepHeader, StepNav } from './shared';

const TEXT_FIELDS = ['street', 'city', 'postalCode', 'state', 'country', 'timezone'] as const;
const NUM_FIELDS = ['latitude', 'longitude'] as const;

export function LocationStep() {
  const { t } = useTranslation('setup');
  const {
    draft,
    isDirty,
    detecting,
    showSaved,
    isSaving,
    hasLocation,
    handleAddressSelect,
    handleFieldChange,
    handleDetect,
    handleSave,
  } = useLocationSettings();

  const [showDetails, setShowDetails] = useState(false);

  return (
    <>
      <StepHeader
        icon={MapPin}
        title={t('location.title')}
        description={t('location.description')}
      />

      <StepBody>
        <AddressSearch onSelect={handleAddressSelect} />

        {!hasLocation && <EmptyState detecting={detecting} onDetect={handleDetect} t={t} />}

        {hasLocation && draft && (
          <div className="space-y-3">
            <LocationCard
              draft={draft}
              showDetails={showDetails}
              onShowDetailsChange={setShowDetails}
              onFieldChange={handleFieldChange}
              t={t}
            />

            <Button
              variant="outline"
              size="sm"
              onClick={handleDetect}
              disabled={detecting}
              className="gap-2"
            >
              <Navigation className="size-3.5" />
              {detecting ? t('location.detecting') : t('location.detect')}
            </Button>

            {isDirty && (
              <SaveButton onSave={handleSave} isSaving={isSaving} showSaved={showSaved} t={t} />
            )}
          </div>
        )}

        <StepNav back="/setup/avatar" next="/setup/complete" showSkip={!hasLocation} />
      </StepBody>
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function EmptyState({
  detecting,
  onDetect,
  t,
}: Readonly<{
  detecting: boolean;
  onDetect: () => void;
  t: (key: string) => string;
}>) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
        <MapPin className="size-8 text-muted-foreground/50" />
        <p className="text-muted-foreground text-sm">{t('location.emptyHint')}</p>
      </div>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">{t('location.or')}</span>
        <Separator className="flex-1" />
      </div>

      <Button variant="outline" onClick={onDetect} disabled={detecting} className="w-full gap-2">
        {detecting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t('location.detecting')}
          </>
        ) : (
          <>
            <Navigation className="size-4" />
            {t('location.detect')}
          </>
        )}
      </Button>
    </div>
  );
}

function LocationCard({
  draft,
  showDetails,
  onShowDetailsChange,
  onFieldChange,
  t,
}: Readonly<{
  draft: HubLocation;
  showDetails: boolean;
  onShowDetailsChange: (open: boolean) => void;
  onFieldChange: (field: keyof HubLocation, value: string) => void;
  t: (key: string) => string;
}>) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <MapPin className="size-4 text-primary" />
        </div>
        <p className="font-medium text-sm">{draft.formattedAddress || t('location.unknownCity')}</p>
      </div>

      {draft.latitude !== 0 && draft.longitude !== 0 && (
        <StaticMap latitude={draft.latitude} longitude={draft.longitude} />
      )}

      <Collapsible open={showDetails} onOpenChange={onShowDetailsChange}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between">
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
                <Label className="text-xs">{t(`location.${field}`)}</Label>
                <Input
                  value={draft[field]}
                  onChange={(e) => onFieldChange(field, e.target.value)}
                  className="mt-1 h-8 text-sm"
                />
              </div>
            ))}
            {NUM_FIELDS.map((field) => (
              <div key={field}>
                <Label className="text-xs">{t(`location.${field}`)}</Label>
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

function SaveButton({
  onSave,
  isSaving,
  showSaved,
  t,
}: Readonly<{
  onSave: () => void;
  isSaving: boolean;
  showSaved: boolean;
  t: (key: string) => string;
}>) {
  const label = showSaved ? t('location.saved') : t('location.save');
  const icon = isSaving ? (
    <Loader2 className="size-3.5 animate-spin" />
  ) : (
    <Check className="size-3.5" />
  );

  return (
    <Button
      onClick={onSave}
      disabled={isSaving}
      size="sm"
      variant="secondary"
      className="w-full gap-2"
    >
      {icon}
      {label}
    </Button>
  );
}
