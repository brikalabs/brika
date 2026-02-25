/**
 * Section Components
 *
 * Composable card-section primitives following the shadcn pattern.
 * Each sub-component is a simple wrapper — no content props, pure composition.
 *
 * Usage:
 *   <Section id="hub-control" className="scroll-mt-4">
 *     <SectionHeader>
 *       <SectionInfo>
 *         <SectionIcon><Terminal className="size-4" /></SectionIcon>
 *         <div>
 *           <SectionTitle>Hub Control</SectionTitle>
 *           <SectionDescription>Restart or stop the hub</SectionDescription>
 *         </div>
 *       </SectionInfo>
 *       <Badge>PID 123</Badge>        ← optional right-side slot
 *     </SectionHeader>
 *     <SectionContent className="space-y-3">
 *       ...content...
 *     </SectionContent>
 *   </Section>
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from './avatar';
import { Card, CardContent } from './card';

/** Root card wrapper. Pass `id` for scroll-anchor linking; `className` for scroll-mt-* etc. */
function Section({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <Card data-slot="section" className={className} {...props}>
      <CardContent className="p-6">{children}</CardContent>
    </Card>
  );
}

/** Flex row that separates the info group (left) from any right-side content (badges, buttons). */
function SectionHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="section-header"
      className={cn('flex items-start justify-between gap-4', className)}
      {...props}
    />
  );
}

/** Groups the icon and text stack as a flex row on the left side of the header. */
function SectionInfo({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="section-info" className={cn('flex items-start gap-3', className)} {...props} />
  );
}

/** Wraps a lucide icon inside the section's avatar pill. Place inside SectionInfo. */
function SectionIcon({ children, className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="section-icon" className={cn('shrink-0', className)} {...props}>
      <Avatar size="lg">
        <AvatarFallback>{children}</AvatarFallback>
      </Avatar>
    </div>
  );
}

/** Primary title line. Place inside the text div within SectionInfo. */
function SectionTitle({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p data-slot="section-title" className={cn('font-semibold text-base', className)} {...props} />
  );
}

/** Muted description line below the title. */
function SectionDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="section-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

/** Content area rendered below the SectionHeader. Adds top spacing from the header. */
function SectionContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="section-content" className={cn('mt-3', className)} {...props} />;
}

export {
  Section,
  SectionHeader,
  SectionInfo,
  SectionIcon,
  SectionTitle,
  SectionDescription,
  SectionContent,
};
