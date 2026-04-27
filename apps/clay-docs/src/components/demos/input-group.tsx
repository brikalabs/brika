import { InputGroup, InputGroupAddon, InputGroupInput } from '@brika/clay/components/input-group';

export function InputGroupDefaultDemo() {
  return (
    <div className="w-full max-w-xs">
      <InputGroup>
        <InputGroupAddon>$</InputGroupAddon>
        <InputGroupInput placeholder="0.00" />
        <InputGroupAddon>USD</InputGroupAddon>
      </InputGroup>
    </div>
  );
}
