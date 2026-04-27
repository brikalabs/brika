import { Switch } from '@brika/clay/components/switch';
import { useState } from 'react';

export function SwitchDefaultDemo() {
  return <Switch defaultChecked />;
}

export function SwitchControlledDemo() {
  const [on, setOn] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Switch checked={on} onCheckedChange={setOn} />
      <span className="font-mono text-clay-subtle text-xs">{on ? 'on' : 'off'}</span>
    </div>
  );
}
