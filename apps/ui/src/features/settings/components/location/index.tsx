import { Check, ChevronDown, MapPin, Navigation } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionIcon,
  SectionInfo,
  SectionTitle,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { AddressSearch } from './AddressSearch';
import { useLocationSettings } from './hooks';
import { StaticMap } from './StaticMap';

export function LocationSettings() {
  const { t } = useLocale();
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
  const saveLabel = isSaving ? t('common:actions.saving') : t('common:actions.save');

  return (
    <>
      <SectionHeader>
        <SectionInfo>
          <SectionIcon>
            <MapPin className="size-4" />
          </SectionIcon>
          <div>
            <SectionTitle>{t('settings:location.title')}</SectionTitle>
            <SectionDescription>{t('settings:location.description')}</SectionDescription>
          </div>
        </SectionInfo>
        <Button variant="outline" size="sm" onClick={handleDetect} disabled={detecting}>
          <Navigation className="mr-2 size-4" />
          {detecting ? t('settings:location.detecting') : t('settings:location.detect')}
        </Button>
      </SectionHeader>

      <SectionContent className="space-y-4">
        <AddressSearch onSelect={handleAddressSelect} />

        {!hasLocation && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
            <MapPin className="size-8 text-muted-foreground/50" />
            <p className="text-muted-foreground text-sm">{t('settings:location.emptyHint')}</p>
          </div>
        )}

        {hasLocation && draft && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <MapPin className="size-4 text-primary" />
              </div>
              <p className="font-medium text-sm">
                {draft.formattedAddress || t('settings:location.notConfigured')}
              </p>
            </div>

            {draft.latitude !== 0 && draft.longitude !== 0 && (
              <StaticMap latitude={draft.latitude} longitude={draft.longitude} />
            )}

            <Collapsible open={showDetails} onOpenChange={setShowDetails}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between">
                  {t('settings:location.editDetails')}
                  <ChevronDown
                    className={`size-4 transition-transform ${showDetails ? 'rotate-180' : ''}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid grid-cols-2 gap-3 pt-3">
                  {(
                    [
                      [
                        'street',
                        'street',
                      ],
                      [
                        'city',
                        'city',
                      ],
                      [
                        'postalCode',
                        'postalCode',
                      ],
                      [
                        'state',
                        'state',
                      ],
                      [
                        'country',
                        'country',
                      ],
                      [
                        'timezone',
                        'timezone',
                      ],
                    ] as const
                  ).map(([field, labelKey]) => (
                    <div key={field}>
                      <Label className="text-xs">{t(`settings:location.${labelKey}`)}</Label>
                      <Input
                        value={draft[field]}
                        onChange={(e) => handleFieldChange(field, e.target.value)}
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                  ))}
                  {(
                    [
                      'latitude',
                      'longitude',
                    ] as const
                  ).map((field) => (
                    <div key={field}>
                      <Label className="text-xs">{t(`settings:location.${field}`)}</Label>
                      <Input
                        value={draft[field]}
                        onChange={(e) => handleFieldChange(field, e.target.value)}
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
        )}

        {isDirty && draft && (
          <Button onClick={handleSave} disabled={isSaving} size="sm">
            {showSaved ? (
              <>
                <Check className="mr-2 size-4" />
                {t('settings:location.saved')}
              </>
            ) : (
              saveLabel
            )}
          </Button>
        )}
      </SectionContent>
    </>
  );
}
