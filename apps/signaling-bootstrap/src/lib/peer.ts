/**
 * WebRTC + signaling client for the bootstrap.
 *
 * Mints a ticket against the coordinator, runs the SDP/ICE handshake, and
 * exposes a tiny `request(method, url)` API over the resulting data channel.
 * Everything here is framework-agnostic — the React layer above just calls
 * `openPeer()` once and uses the returned handle.
 */

import {
  decodeRpc,
  decodeSignaling,
  encodeRpc,
  encodeSignaling,
  type IceCandidate,
  PROTOCOL_VERSION,
  type RpcMessage,
  type SignalingMessage,
} from '@brika/remote-access-protocol';
import { isValidHubName } from './hub-name';

export interface TicketResponse {
  ticket: string;
  expiresAt: number;
  iceServers?: { urls: string | string[]; username?: string; credential?: string }[];
}

export interface PeerHandle {
  request(method: string, url: string, signal?: AbortSignal): Promise<Response>;
  close(): void;
}

interface IceServerSpec {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const FALLBACK_ICE_SERVERS: IceServerSpec[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export async function mintTicket(hubName: string, coordinator: string): Promise<TicketResponse> {
  if (!isValidHubName(hubName)) {
    throw new Error(`Refusing to mint ticket for invalid hub name "${hubName}"`);
  }
  const res = await fetch(`${coordinator}/v1/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hubName }),
  });
  if (!res.ok) {
    throw new Error(`/v1/tickets failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TicketResponse;
}

interface InflightEntry {
  resolve: (res: Response) => void;
  reject: (err: Error) => void;
  headEmitted: boolean;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  stream: ReadableStream<Uint8Array>;
}

function chunkToBytes(msg: { dataB64?: string; dataText?: string }): Uint8Array {
  if (msg.dataB64) {
    return Uint8Array.from(atob(msg.dataB64), (c) => c.codePointAt(0) ?? 0);
  }
  return new TextEncoder().encode(msg.dataText ?? '');
}

function buildSignalingUrl(coordinator: string, hubName: string, ticket: string): string {
  if (!isValidHubName(hubName)) {
    throw new Error(`Refusing to open signaling URL for invalid hub name "${hubName}"`);
  }
  const u = new URL('/v1/client', coordinator);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.searchParams.set('hub', hubName);
  u.searchParams.set('ticket', ticket);
  return u.toString();
}

function closeQuietly(c: { close(): void }): void {
  try {
    c.close();
  } catch {
    /* already torn down */
  }
}

function pickIceServers(servers: TicketResponse['iceServers']): RTCIceServer[] {
  const chosen = servers && servers.length > 0 ? servers : FALLBACK_ICE_SERVERS;
  return chosen.map((s) => ({
    urls: s.urls,
    username: s.username,
    credential: s.credential,
  }));
}

function waitForWsOpen(ws: WebSocket, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Signaling WS open timed out')), timeoutMs);
    ws.addEventListener(
      'open',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true }
    );
    ws.addEventListener(
      'error',
      () => {
        clearTimeout(t);
        reject(new Error('Signaling WS errored before open'));
      },
      { once: true }
    );
  });
}

function waitForDataChannel(channel: RTCDataChannel, pc: RTCPeerConnection): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Data channel open timed out')), 30_000);
    if (channel.readyState === 'open') {
      clearTimeout(t);
      resolve();
      return;
    }
    channel.addEventListener('open', () => {
      clearTimeout(t);
      resolve();
    });
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        clearTimeout(t);
        reject(new Error(`WebRTC connection ${pc.connectionState}`));
      }
    });
  });
}

function dispatchRpcFrame(msg: RpcMessage, inflight: Map<number, InflightEntry>): void {
  if (
    msg.kind !== 'response.head' &&
    msg.kind !== 'response.chunk' &&
    msg.kind !== 'response.end' &&
    msg.kind !== 'response.error'
  ) {
    return;
  }
  const entry = inflight.get(msg.id);
  if (!entry) {
    return;
  }
  switch (msg.kind) {
    case 'response.head': {
      entry.headEmitted = true;
      const response = new Response(entry.stream, {
        status: msg.status,
        headers: new Headers(msg.headers.map(([k, v]) => [k, v]) as [string, string][]),
      });
      entry.resolve(response);
      return;
    }
    case 'response.chunk':
      void entry.writer.write(chunkToBytes(msg));
      return;
    case 'response.end':
      void entry.writer.close();
      inflight.delete(msg.id);
      return;
    case 'response.error':
      if (entry.headEmitted) {
        void entry.writer.abort(new Error(`RPC ${msg.id}: ${msg.code}`));
      } else {
        entry.reject(new Error(`RPC ${msg.id}: ${msg.code} ${msg.message ?? ''}`));
      }
      inflight.delete(msg.id);
      return;
  }
}

export async function openPeer(
  hubName: string,
  ticket: TicketResponse,
  coordinator: string
): Promise<PeerHandle> {
  const ws = new WebSocket(buildSignalingUrl(coordinator, hubName, ticket.ticket), [
    `brika.v${PROTOCOL_VERSION}`,
    `ticket.${ticket.ticket}`,
  ]);
  const pc = new RTCPeerConnection({ iceServers: pickIceServers(ticket.iceServers) });

  let sessionId = '';
  const pendingIce: IceCandidate[] = [];

  const sendSignaling = (msg: SignalingMessage): void => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(encodeSignaling(msg));
    }
  };

  pc.addEventListener('icecandidate', (ev) => {
    if (!ev.candidate) {
      return;
    }
    const cand: IceCandidate = {
      candidate: ev.candidate.candidate,
      sdpMid: ev.candidate.sdpMid ?? undefined,
      sdpMLineIndex: ev.candidate.sdpMLineIndex ?? undefined,
    };
    if (sessionId) {
      sendSignaling({ v: PROTOCOL_VERSION, kind: 'client.ice', sessionId, candidate: cand });
    } else {
      pendingIce.push(cand);
    }
  });

  const channel = pc.createDataChannel('rpc', { ordered: true });
  channel.binaryType = 'arraybuffer';

  const inflight = new Map<number, InflightEntry>();
  let nextId = 1;
  let dataChannel: RTCDataChannel | null = null;

  const sendRpc = (frame: RpcMessage): void => {
    if (dataChannel?.readyState === 'open') {
      dataChannel.send(encodeRpc(frame));
    }
  };

  channel.addEventListener('open', () => {
    dataChannel = channel;
    sendRpc({
      v: PROTOCOL_VERSION,
      kind: 'hello',
      role: 'client',
      softwareVersion: 'bootstrap',
      maxProtocolVersion: PROTOCOL_VERSION,
    });
  });

  channel.addEventListener('message', (ev) => {
    const raw = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
    const msg = decodeRpc(raw);
    if (msg) {
      dispatchRpcFrame(msg, inflight);
    }
  });

  await waitForWsOpen(ws, 10_000);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  if (!offer.sdp) {
    throw new Error('createOffer produced no SDP');
  }
  sendSignaling({
    v: PROTOCOL_VERSION,
    kind: 'client.offer',
    hubName,
    sdp: offer.sdp,
    ticket: ticket.ticket,
    caps: ['rpc.v1'],
  });

  ws.addEventListener('message', async (ev) => {
    const raw = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
    const msg = decodeSignaling(raw);
    if (!msg) {
      return;
    }
    if (msg.kind === 'session.iceServers') {
      return;
    }
    if (msg.kind === 'session.answer') {
      sessionId = msg.sessionId;
      await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
      for (const cand of pendingIce) {
        sendSignaling({
          v: PROTOCOL_VERSION,
          kind: 'client.ice',
          sessionId,
          candidate: cand,
        });
      }
      pendingIce.length = 0;
      return;
    }
    if (msg.kind === 'session.ice') {
      try {
        await pc.addIceCandidate({
          candidate: msg.candidate.candidate,
          sdpMid: msg.candidate.sdpMid,
          sdpMLineIndex: msg.candidate.sdpMLineIndex,
        });
      } catch {
        /* late or malformed — drop */
      }
      return;
    }
    if (msg.kind === 'session.error') {
      throw new Error(`Signaling error: ${msg.code} ${msg.message ?? ''}`);
    }
  });

  await waitForDataChannel(channel, pc);

  return {
    request: (method, url, signal): Promise<Response> => {
      return new Promise<Response>((resolve, reject) => {
        const id = nextId++;
        const { writable, readable } = new TransformStream<Uint8Array, Uint8Array>();
        const writer = writable.getWriter();
        const ctrl = new AbortController();
        if (signal) {
          signal.addEventListener('abort', () => ctrl.abort());
        }
        ctrl.signal.addEventListener('abort', () => {
          sendRpc({ v: PROTOCOL_VERSION, kind: 'abort', id });
          inflight.delete(id);
          reject(new DOMException('Aborted', 'AbortError'));
        });
        inflight.set(id, { resolve, reject, headEmitted: false, writer, stream: readable });
        sendRpc({
          v: PROTOCOL_VERSION,
          kind: 'request',
          id,
          method,
          url,
          headers: [],
        });
      });
    },
    close: () => {
      closeQuietly(channel);
      closeQuietly(pc);
      closeQuietly(ws);
    },
  };
}
