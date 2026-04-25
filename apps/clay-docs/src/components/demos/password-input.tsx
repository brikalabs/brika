import { PasswordInput } from '@brika/clay/components/password-input';

export function PasswordInputDefaultDemo() {
  return (
    <div className="w-full max-w-xs">
      <PasswordInput placeholder="Enter password" defaultValue="secret123" />
    </div>
  );
}
