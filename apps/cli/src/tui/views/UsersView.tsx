/**
 * Users section — list users via `/api/users` (requires admin auth)
 * and add new ones through a small inline form. Tokens + edit + delete
 * are tracked as follow-ups; the form here exercises the same plumbing
 * any future flow will reuse.
 */

import { useKey } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useState } from 'react';
import { fetchUsers, type UserDto } from '../../cli/hub-api';
import { hubFetch } from '../../cli/hub-client';
import { TextInput } from '../components/TextInput';
import { useCli } from '../useCli';
import { useHubResource } from '../useHubResource';

type FormField = 'name' | 'email' | 'role' | 'password';

const FIELDS: ReadonlyArray<FormField> = ['name', 'email', 'role', 'password'];

export function UsersView(): React.ReactElement {
  const cli = useCli();
  const list = useHubResource<UserDto[]>(fetchUsers, []);
  const [adding, setAdding] = useState(false);
  const [field, setField] = useState<FormField>('name');
  const [draft, setDraft] = useState({ name: '', email: '', role: 'user', password: '' });
  const [formError, setFormError] = useState<string | null>(null);

  useKey('a', () => setAdding(true), !adding);
  useKey(
    'tab',
    () => {
      const i = FIELDS.indexOf(field);
      setField(FIELDS[(i + 1) % FIELDS.length] ?? 'name');
    },
    adding
  );

  if (cli.hub.state !== 'running') {
    return (
      <Box flexDirection="column">
        <Text bold>Users</Text>
        <Box marginTop={1}>
          <Text dimColor>hub isn't running — press </Text>
          <Text color="yellow">s</Text>
          <Text dimColor> to start it.</Text>
        </Box>
      </Box>
    );
  }

  const items = list.data ?? [];

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Users </Text>
        <Text dimColor>{items.length}</Text>
        {list.loading && <Text dimColor> · loading…</Text>}
        {list.error && (
          <Text color="red">
            {' '}
            · {list.error.includes('401') ? 'admin login required' : list.error}
          </Text>
        )}
      </Box>

      {adding && (
        <Box
          flexDirection="column"
          marginBottom={1}
          borderStyle="round"
          borderColor="cyan"
          paddingX={1}
        >
          <Text dimColor>Add user — Tab cycles fields, Enter submits, Esc cancels.</Text>
          <TextInput
            label="name"
            value={draft.name}
            onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
            focused={field === 'name'}
          />
          <TextInput
            label="email"
            value={draft.email}
            onChange={(v) => setDraft((d) => ({ ...d, email: v }))}
            focused={field === 'email'}
          />
          <TextInput
            label="role"
            value={draft.role}
            onChange={(v) => setDraft((d) => ({ ...d, role: v }))}
            placeholder="user | admin"
            focused={field === 'role'}
          />
          <TextInput
            label="password"
            value={draft.password}
            onChange={(v) => setDraft((d) => ({ ...d, password: v }))}
            mask
            focused={field === 'password'}
            onSubmit={async () => {
              try {
                setFormError(null);
                const res = await hubFetch('/api/users/', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify(draft),
                });
                if (!res.ok) {
                  throw new Error(`${res.status} ${await res.text()}`);
                }
                setAdding(false);
                setDraft({ name: '', email: '', role: 'user', password: '' });
                setField('name');
                list.refresh();
              } catch (e) {
                setFormError(e instanceof Error ? e.message : String(e));
              }
            }}
            onCancel={() => {
              setAdding(false);
              setFormError(null);
            }}
          />
          {formError && <Text color="red">{formError}</Text>}
        </Box>
      )}

      {items.length === 0 ? (
        <Text dimColor>(no users to show — admin login required for non-empty lists)</Text>
      ) : (
        <Box flexDirection="column">
          {items.map((u) => (
            <Box key={u.id}>
              <Text>▸ {u.email.padEnd(32)} </Text>
              <Text color={u.role === 'admin' ? 'red' : 'cyan'}>{u.role.padEnd(8)}</Text>
              <Text dimColor> {u.name}</Text>
            </Box>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>a add · tab cycle fields</Text>
      </Box>
    </Box>
  );
}
