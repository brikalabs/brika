'use client';

import { Collapsible as CollapsiblePrimitive } from 'radix-ui';

import { withSlot } from '../../primitives/with-slot';

const Collapsible = withSlot(CollapsiblePrimitive.Root, 'collapsible');
const CollapsibleTrigger = withSlot(CollapsiblePrimitive.CollapsibleTrigger, 'collapsible-trigger');
const CollapsibleContent = withSlot(CollapsiblePrimitive.CollapsibleContent, 'collapsible-content');

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
