import { Slider } from '@brika/clay/components/slider';
import { useState } from 'react';

export function SliderDefaultDemo() {
  const [value, setValue] = useState(50);
  return (
    <div className="w-full max-w-xs">
      <Slider value={value} onChange={setValue} min={0} max={100} step={1} unit="%" />
    </div>
  );
}
