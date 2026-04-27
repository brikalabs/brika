import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '../input-group';

interface PasswordInputProps extends Omit<React.ComponentProps<'input'>, 'type'> {
  /** aria-label for the show-password toggle. */
  showLabel?: string;
  /** aria-label for the hide-password toggle. */
  hideLabel?: string;
}

function PasswordInput({
  ref,
  showLabel = 'Show password',
  hideLabel = 'Hide password',
  ...props
}: Readonly<PasswordInputProps>) {
  const [visible, setVisible] = useState(false);

  return (
    <InputGroup>
      <InputGroupAddon>
        <LockKeyhole />
      </InputGroupAddon>
      <InputGroupInput ref={ref} type={visible ? 'text' : 'password'} {...props} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          variant="ghost"
          size="icon-xs"
          aria-label={visible ? hideLabel : showLabel}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

export { PasswordInput };
