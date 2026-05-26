import { useCallAction } from '@brika/sdk/ui-kit/hooks';
import { useCallback, useState } from 'react';
import { makeFolder } from '../actions';
import { joinPath } from '../lib/path';

interface UseFolderCreateOptions {
  currentPath: string;
  onCreated: () => void | Promise<void>;
}

interface UseFolderCreateResult {
  creating: boolean;
  create: (name: string) => Promise<void>;
}

/** Wraps `makeFolder` with a `creating` flag so the button can show a spinner. */
export function useFolderCreate({
  currentPath,
  onCreated,
}: UseFolderCreateOptions): UseFolderCreateResult {
  const callAction = useCallAction();
  const [creating, setCreating] = useState(false);

  const create = useCallback(
    async (name: string) => {
      setCreating(true);
      try {
        await callAction(makeFolder, { path: joinPath(currentPath, name) });
        await onCreated();
      } catch {
        // Toast already fired.
      } finally {
        setCreating(false);
      }
    },
    [callAction, currentPath, onCreated]
  );

  return { creating, create };
}
