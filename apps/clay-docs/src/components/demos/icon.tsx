import { Icon } from '@brika/clay/components/icon';
import { Bell } from 'lucide-react';

export function IconDefaultDemo() {
  return <Icon as={Bell} aria-label="Notifications" />;
}

export function IconTonesDemo() {
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="flex items-center gap-2">
        <Icon as={Bell} tone="default" />
        <span className="text-sm">Default</span>
      </div>
      <div className="flex items-center gap-2">
        <Icon as={Bell} tone="muted" />
        <span className="text-sm">Muted</span>
      </div>
      <div className="flex items-center gap-2">
        <Icon as={Bell} tone="primary" />
        <span className="text-sm">Primary</span>
      </div>
    </div>
  );
}

export function IconSizesDemo() {
  return (
    <div className="flex flex-wrap items-center gap-6">
      <Icon as={Bell} size="xs" aria-label="Extra small" />
      <Icon as={Bell} size="sm" aria-label="Small" />
      <Icon as={Bell} size="default" aria-label="Default" />
      <Icon as={Bell} size="lg" aria-label="Large" />
    </div>
  );
}
