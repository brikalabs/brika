'use client';

import { Checkbox } from '@brika/clay/components/checkbox';
import { useState } from 'react';

export function CheckboxDefaultDemo() {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <Checkbox defaultChecked />
      Accept terms and conditions
    </label>
  );
}

export function CheckboxSizesDemo() {
  return (
    <div className="flex items-center gap-4">
      <Checkbox size="sm" defaultChecked />
      <Checkbox size="default" defaultChecked />
      <Checkbox size="lg" defaultChecked />
    </div>
  );
}

export function CheckboxIndeterminateDemo() {
  const [checked, setChecked] = useState<'indeterminate' | boolean>('indeterminate');

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={setChecked} />
      Select all
    </label>
  );
}
