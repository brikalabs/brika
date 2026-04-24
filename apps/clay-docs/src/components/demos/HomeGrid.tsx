import type { ReactNode } from 'react';
import { ButtonIconDemo, ButtonOutlineDemo, ButtonPrimaryDemo } from './button';
import { CardAccentDemo, CardDefaultDemo } from './card';
import { InputDefaultDemo, InputInvalidDemo } from './input';

interface GridEntry {
  readonly name: string;
  readonly href: string;
  readonly preview: ReactNode;
}

const liveEntries: readonly GridEntry[] = [
  {
    name: 'Button',
    href: '/components/button',
    preview: (
      <div className="flex flex-col items-center gap-2">
        <ButtonPrimaryDemo />
        <ButtonOutlineDemo />
        <ButtonIconDemo />
      </div>
    ),
  },
  {
    name: 'Input',
    href: '/components/input',
    preview: (
      <div className="flex w-full max-w-[220px] flex-col gap-2">
        <InputDefaultDemo />
        <InputInvalidDemo />
      </div>
    ),
  },
  {
    name: 'Card',
    href: '/components/card',
    preview: (
      <div className="flex flex-col items-center gap-2">
        <CardDefaultDemo />
        <CardAccentDemo />
      </div>
    ),
  },
];

const comingSoonEntries: readonly string[] = [
  'Label',
  'Badge',
  'Separator',
  'Dialog',
  'Tooltip',
  'Tabs',
  'Popover',
  'Select',
  'Switch',
  'Alert',
  'Progress',
  'Skeleton',
];

export function HomeGrid() {
  return (
    <div className="grid grid-cols-1 border-clay-hairline border-b sm:grid-cols-2 lg:grid-cols-3">
      {liveEntries.map((entry) => (
        <a
          key={entry.name}
          href={entry.href}
          className="group flex min-h-[260px] flex-col border-clay-hairline border-t border-r transition-colors hover:bg-clay-base"
        >
          <div className="flex flex-1 items-center justify-center p-6">{entry.preview}</div>
          <div className="border-clay-hairline border-t px-4 py-2 font-mono text-clay-subtle text-xs transition-colors group-hover:text-clay-default">
            {entry.name}
          </div>
        </a>
      ))}
      {comingSoonEntries.map((name) => (
        <div
          key={name}
          className="flex min-h-[260px] flex-col border-clay-hairline border-t border-r"
        >
          <div className="flex flex-1 items-center justify-center p-6">
            <span className="font-mono text-clay-inactive text-xs uppercase tracking-wider">
              coming soon
            </span>
          </div>
          <div className="border-clay-hairline border-t px-4 py-2 font-mono text-clay-inactive text-xs">
            {name}
          </div>
        </div>
      ))}
    </div>
  );
}
