/**
 * RadiusField — slider + preset chips + semantic preview.
 *
 * The live preview shows the four semantic radius tokens (pill,
 * control, container, surface) derived from the chosen base radius so
 * users see the whole scale ripple as they drag.
 */

import { radiiFor } from '../effects-css';
import { RADIUS_PRESETS } from '../radius-presets';
import { FieldPreview } from './FieldPreview';
import { cssVars, nearlyEquals, PresetChips, SemanticTile, SliderInput } from './primitives';

interface RadiusFieldProps {
  value: number;
  onChange: (next: number) => void;
}

const SEMANTIC_SAMPLES = [
  { key: 'pill', label: 'Pill', hint: 'chips' },
  { key: 'control', label: 'Control', hint: 'buttons' },
  { key: 'container', label: 'Container', hint: 'cards' },
  { key: 'surface', label: 'Surface', hint: 'dialogs' },
] as const;

const RADIUS_EQUALS = nearlyEquals(0.001);

export function RadiusField({ value, onChange }: Readonly<RadiusFieldProps>) {
  const radii = radiiFor(value);
  const scopedVars = cssVars({ '--radius': `${value}rem` });

  return (
    <div className="space-y-2.5">
      <SliderInput
        value={value}
        onChange={onChange}
        min={0}
        max={2}
        step={0.125}
        unit="rem"
        numericWidth="w-8"
      />

      <PresetChips
        presets={RADIUS_PRESETS}
        value={value}
        onChange={onChange}
        columns="grid-cols-3"
        isActive={RADIUS_EQUALS}
      />

      <FieldPreview
        label="Semantic radius"
        caption={`${value.toFixed(3)}rem base`}
        style={scopedVars}
      >
        <div className="grid w-full grid-cols-4 gap-2">
          {SEMANTIC_SAMPLES.map(({ key, label, hint }) => {
            const r = radii[key];
            return (
              <SemanticTile key={key} label={label} hint={hint} value={r}>
                <div
                  className="size-10 border-2 border-primary/40 bg-primary/10"
                  style={{ borderRadius: r }}
                  aria-hidden
                />
              </SemanticTile>
            );
          })}
        </div>
      </FieldPreview>
    </div>
  );
}
