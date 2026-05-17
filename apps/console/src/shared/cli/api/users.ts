/** Users list — backs the Users section. POST/edit is done inline with
 *  `hubFetch` in the feature itself. */

import { hubFetch } from '../hub-client';

export interface UserDto {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: string;
}

export async function fetchUsers(): Promise<UserDto[]> {
  const res = await hubFetch('/api/users');
  if (!res.ok) {
    throw new Error(`users fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as { users?: UserDto[] } | UserDto[];
  if (Array.isArray(body)) {
    return [...body];
  }
  return [...(body.users ?? [])];
}
