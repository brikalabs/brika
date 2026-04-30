/**
 * Form-control previews — buttons, inputs, selects, switches, sliders, etc.
 * Each preview renders the **real** `@brika/clay` component so theme tweaks
 * ripple through automatically.
 */

import {
  Badge,
  Button,
  ButtonGroup,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Label,
  PasswordInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@brika/clay';
import { Check, Search } from 'lucide-react';
import { useState } from 'react';

export function ButtonPreview() {
  return (
    <div className="flex items-center gap-2">
      <Button size="sm">Primary</Button>
      <Button size="sm" variant="outline">
        Outline
      </Button>
    </div>
  );
}

export function InputPreview() {
  return <Input placeholder="Username" className="h-8 w-48 text-xs" />;
}

export function SelectPreview() {
  return (
    <Select defaultValue="option-a">
      <SelectTrigger className="h-8 w-40 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="option-a">Option A</SelectItem>
        <SelectItem value="option-b">Option B</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** No Checkbox in the kit yet — mirrors the real component's utility classes. */
export function CheckboxPreview() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-4 items-center justify-center rounded-checkbox border border-primary bg-primary text-primary-foreground">
        <Check className="size-3" />
      </div>
      <div className="size-4 rounded-checkbox border border-input" />
    </div>
  );
}

export function TabsPreview() {
  return (
    <Tabs defaultValue="active">
      <TabsList>
        <TabsTrigger value="active" className="text-xs">
          Active
        </TabsTrigger>
        <TabsTrigger value="idle" className="text-xs">
          Idle
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export function BadgePreview() {
  return (
    <div className="flex items-center gap-2">
      <Badge>New</Badge>
      <Badge variant="outline">Beta</Badge>
    </div>
  );
}

export function SwitchPreview() {
  return (
    <div className="flex items-center gap-3">
      <Switch defaultChecked />
      <Switch />
    </div>
  );
}

export function SwitchThumbPreview() {
  return <Switch defaultChecked />;
}

export function TextareaPreview() {
  return <Textarea placeholder="Type a message…" className="h-16 w-56 text-xs" />;
}

export function PasswordInputPreview() {
  return <PasswordInput placeholder="••••••••" className="h-8 w-48 text-xs" />;
}

export function SliderPreview() {
  const [value, setValue] = useState(0.5);
  return (
    <div className="w-56">
      <Slider value={value} onChange={setValue} min={0} max={1} step={0.01} />
    </div>
  );
}

export function ButtonGroupPreview() {
  return (
    <ButtonGroup>
      <Button variant="outline" size="sm">
        Day
      </Button>
      <Button variant="outline" size="sm">
        Week
      </Button>
      <Button variant="outline" size="sm">
        Month
      </Button>
    </ButtonGroup>
  );
}

export function InputGroupPreview() {
  return (
    <InputGroup className="w-52">
      <InputGroupAddon>
        <Search className="size-3.5" />
      </InputGroupAddon>
      <InputGroupInput placeholder="Search…" className="h-8 text-xs" />
    </InputGroup>
  );
}

export function LabelPreview() {
  return (
    <div className="w-48 space-y-1.5">
      <Label htmlFor="preview-label" className="text-xs">
        Email address
      </Label>
      <Input
        id="preview-label"
        type="email"
        placeholder="you@example.com"
        className="h-8 text-xs"
      />
    </div>
  );
}
