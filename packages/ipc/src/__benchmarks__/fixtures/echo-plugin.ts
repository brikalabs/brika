/**
 * Echo Plugin - Benchmark fixture
 */

import { createClient, rpc } from '@brika/ipc';
import { z } from 'zod';

const ping = rpc('ping', z.object({ ts: z.number() }), z.object({ ts: z.number() }));
const echo = rpc('echo', z.object({ data: z.unknown() }), z.object({ data: z.unknown() }));

const client = createClient();

client.implement(ping, ({ ts }) => ({ ts }));
client.implement(echo, ({ data }) => ({ data }));

client.start({ id: 'benchmark-plugin', version: '1.0.0' });
