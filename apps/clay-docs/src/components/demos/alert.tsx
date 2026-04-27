import { Alert, AlertDescription, AlertIcon, AlertTitle } from '@brika/clay/components/alert';
import { AlertCircle } from 'lucide-react';

/** Plain alert with title + description. */
export function AlertDefaultDemo() {
  return (
    <Alert className="w-80">
      <AlertTitle>Heads up</AlertTitle>
      <AlertDescription>You can compose Alert with title and description slots.</AlertDescription>
    </Alert>
  );
}

/** All five semantic variants stacked vertically. */
export function AlertVariantsDemo() {
  return (
    <div className="flex w-80 flex-col gap-3">
      <Alert>
        <AlertTitle>Default</AlertTitle>
        <AlertDescription>Quiet card-style alert.</AlertDescription>
      </Alert>
      <Alert variant="info">
        <AlertTitle>Info</AlertTitle>
        <AlertDescription>Informational notice.</AlertDescription>
      </Alert>
      <Alert variant="success">
        <AlertTitle>Success</AlertTitle>
        <AlertDescription>Operation completed.</AlertDescription>
      </Alert>
      <Alert variant="warning">
        <AlertTitle>Warning</AlertTitle>
        <AlertDescription>Double-check before continuing.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertTitle>Destructive</AlertTitle>
        <AlertDescription>Something went wrong.</AlertDescription>
      </Alert>
    </div>
  );
}

/** Destructive alert paired with a lucide AlertCircle icon. */
export function AlertWithIconDemo() {
  return (
    <Alert variant="destructive" className="w-80">
      <AlertIcon>
        <AlertCircle />
      </AlertIcon>
      <AlertTitle>Unable to save</AlertTitle>
      <AlertDescription>Your session has expired. Please sign in again.</AlertDescription>
    </Alert>
  );
}
