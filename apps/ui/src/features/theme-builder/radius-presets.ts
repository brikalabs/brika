/**
 * Quick-pick radius presets, surfaced next to the slider so users can
 * jump between common feels without dragging.
 */

export interface RadiusPreset {
  label: string;
  value: number;
  hint: string;
}

export const RADIUS_PRESETS: readonly RadiusPreset[] = [
  { label: 'Sharp', value: 0, hint: 'Brutalist, right-angle' },
  { label: 'Subtle', value: 0.25, hint: 'Barely rounded' },
  { label: 'Default', value: 0.5, hint: 'Classic web feel' },
  { label: 'Soft', value: 0.75, hint: 'Brika default' },
  { label: 'Pillowy', value: 1.25, hint: 'Very rounded' },
  { label: 'Pill', value: 2, hint: 'Fully rounded' },
] as const;
