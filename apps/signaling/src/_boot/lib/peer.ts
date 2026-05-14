/**
 * WebRTC + signaling client for the bootstrap.
 *
 * Mints a ticket against the coordinator, runs the SDP/ICE handshake, and
 * exposes a tiny `request(method, url)` API over the resulting data channel.
 * Everything here is framework-agnostic — the React layer above just calls
 * `openPeer()` once and uses the returned handle.
 */

import {
  DEFAULT_ICE_SERVERS,
  decodeBinaryChunk,
  decodeRpc,
  decodeSignaling,
  encodeRpc,
  encodeSignaling,
  type IceCandidate,
  type IceServer,
  PROTOCOL_VERSION,
  ResponseAssembler,
  RPC_CAPABILITIES,
  type RpcMessage,
  type SignalingMessage,
} from '@brika/remote-access-protocol';
import {
  CoordinatorUnreachableError,
  HubNotFoundError,
  HubUnreachableError,
  TicketError,
} from './errors';
import { isValidHubName } from './hub-name';

export interface TicketResponse {
  ticket: string;
  expiresAt: number;
  iceServers?: IceServer[];
}

export interface PeerHandle {
  request(method: string, url: string, signal?: AbortSignal): Promise<Response>;
  close(): void;
}

const TEXT_DECODER = new TextDecoder();

/** Per-request inflight timeout. Bounds slot lifetime even if a hub goes silent. */
const REQUEST_TIMEOUT_MS = 30_000;

export async function mintTicket(
  hubName: string,
  coordinator: string,
  signal?: AbortSignal
): Promise<TicketResponse> {
  if (!isValidHubName(hubName)) {
    throw new Error(`Refusing to mint ticket for invalid hub name "${hubName}"`);
  }
  let res: Response;
  try {
    res = await fetch(`${coordinator}/v1/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hubName }),
      signal,
    });
  } catch (cause) {
    throw new CoordinatorUnreachableError(cause);
  }
  if (res.status === 404) {
    throw new HubNotFoundError(hubName);
  }
  if (!res.ok) {
    throw new TicketError(res.status, await res.text());
  }
  const data: TicketResponse = await res.json();
  return data;
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
  const chosen: ReadonlyArray<IceServer> =
    servers && servers.length > 0 ? servers : DEFAULT_ICE_SERVERS;
  const out: RTCIceServer[] = [];
  for (const s of chosen) {
    // Drop entries with a missing or malformed `urls` — `[...undefined]`
    // would throw "Spread syntax requires ...iterable not be null or
    // undefined" and abort the entire `RTCPeerConnection` construction.
    let urls: string | string[];
    if (typeof s.urls === 'string') {
      if (s.urls.length === 0) {
        continue;
      }
      urls = s.urls;
    } else if (Array.isArray(s.urls) && s.urls.length > 0) {
      urls = [...s.urls];
    } else {
      continue;
    }
    out.push({ urls, username: s.username, credential: s.credential });
  }
  return out;
}

function waitForWsOpen(ws: WebSocket, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new HubUnreachableError('ws-open-timeout', 'Signaling WS open timed out')),
      timeoutMs
    );
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
        reject(new HubUnreachableError('ws-errored', 'Signaling WS errored before open'));
      },
      { once: true }
    );
  });
}

interface DataChannelReady {
  readonly promise: Promise<void>;
  /** Reject the open promise with a fatal error from any source (e.g. signaling). */
  fail(err: Error): void;
}

function makeDataChannelReady(channel: RTCDataChannel, pc: RTCPeerConnection): DataChannelReady {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const timer = setTimeout(
    () => reject(new HubUnreachableError('data-channel-timeout', 'Data channel open timed out')),
    30_000
  );
  const settle = (cb: () => void): void => {
    clearTimeout(timer);
    cb();
  };

  if (channel.readyState === 'open') {
    settle(resolve);
  } else {
    channel.addEventListener('open', () => settle(resolve), { once: true });
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        settle(() =>
          reject(
            new HubUnreachableError(
              pc.connectionState === 'failed' ? 'webrtc-failed' : 'webrtc-closed',
              `WebRTC connection ${pc.connectionState}`
            )
          )
        );
      }
    });
  }

  return { promise, fail: (err) => settle(() => reject(err)) };
}

interface InflightSlot {
  readonly assembler: ResponseAssembler;
  readonly timer: ReturnType<typeof setTimeout>;
}

function dispatchRpcFrame(msg: RpcMessage, inflight: Map<number, InflightSlot>): void {
  if (
    msg.kind !== 'response.head' &&
    msg.kind !== 'response.chunk' &&
    msg.kind !== 'response.end' &&
    msg.kind !== 'response.error'
  ) {
    return;
  }
  const slot = inflight.get(msg.id);
  if (!slot) {
    return;
  }
  switch (msg.kind) {
    case 'response.head':
      slot.assembler.onHead(msg);
      return;
    case 'response.chunk':
      slot.assembler.onChunk(msg);
      return;
    case 'response.end':
      slot.assembler.onEnd(msg);
      clearTimeout(slot.timer);
      inflight.delete(msg.id);
      return;
    case 'response.error':
      slot.assembler.onError(msg);
      clearTimeout(slot.timer);
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

  const inflight = new Map<number, InflightSlot>();
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
      // Bootstrap is GET-only (asset prime), so we only ever *receive*
      // binary chunks — but advertising the cap lets the hub stream
      // assets without paying the base64 tax.
      caps: [RPC_CAPABILITIES.BINARY_FRAMES],
    });
  });

  channel.addEventListener('message', (ev) => {
    if (typeof ev.data === 'string') {
      const msg = decodeRpc(ev.data);
      if (msg) {
        dispatchRpcFrame(msg, inflight);
      }
      return;
    }
    if (ev.data instanceof ArrayBuffer) {
      const chunk = decodeBinaryChunk(ev.data);
      if (chunk?.kind !== 'response.chunk') {
        return;
      }
      // Synthesize a chunk message so the JSON and binary paths funnel
      // through the same `dispatchRpcFrame` arm.
      dispatchRpcFrame(
        {
          v: PROTOCOL_VERSION,
          kind: 'response.chunk',
          id: chunk.id,
          dataBin: chunk.payload,
        },
        inflight
      );
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

  const dcReady = makeDataChannelReady(channel, pc);

  // Remote ICE candidates that arrive before `setRemoteDescription` resolves
  // would otherwise reject (`InvalidStateError`) and be silently dropped by
  // the .catch — buffer them and flush once SRD lands.
  const pendingRemoteIce: RTCIceCandidateInit[] = [];
  let remoteDescriptionApplied = false;

  ws.addEventListener('message', (ev) => {
    const raw = typeof ev.data === 'string' ? ev.data : TEXT_DECODER.decode(ev.data);
    const msg = decodeSignaling(raw);
    if (!msg) {
      return;
    }
    if (msg.kind === 'session.iceServers') {
      return;
    }
    if (msg.kind === 'session.answer') {
      sessionId = msg.sessionId;
      // Flush queued LOCAL candidates synchronously so the live `icecandidate`
      // handler and the flush can't interleave.
      const toFlush = pendingIce.splice(0);
      for (const cand of toFlush) {
        sendSignaling({ v: PROTOCOL_VERSION, kind: 'client.ice', sessionId, candidate: cand });
      }
      pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp })
        .then(() => {
          remoteDescriptionApplied = true;
          const remoteToFlush = pendingRemoteIce.splice(0);
          for (const cand of remoteToFlush) {
            pc.addIceCandidate(cand).catch(() => {
              /* late or malformed — drop */
            });
          }
        })
        .catch((err: unknown) => {
          dcReady.fail(err instanceof Error ? err : new Error(String(err)));
        });
      return;
    }
    if (msg.kind === 'session.ice') {
      const init: RTCIceCandidateInit = {
        candidate: msg.candidate.candidate,
        sdpMid: msg.candidate.sdpMid,
        sdpMLineIndex: msg.candidate.sdpMLineIndex,
      };
      if (!remoteDescriptionApplied) {
        pendingRemoteIce.push(init);
        return;
      }
      pc.addIceCandidate(init).catch(() => {
        /* late or malformed — drop */
      });
      return;
    }
    if (msg.kind === 'session.error') {
      dcReady.fail(
        new HubUnreachableError(
          'signaling-error',
          `Signaling error: ${msg.code} ${msg.message ?? ''}`
        )
      );
    }
  });

  ws.addEventListener('close', () => {
    dcReady.fail(
      new HubUnreachableError('ws-closed', 'Signaling WS closed before data channel opened')
    );
  });

  await dcReady.promise;

  return {
    request: (method, url, signal): Promise<Response> => {
      const id = nextId++;
      const assembler = new ResponseAssembler();

      // Bound every in-flight request so a hub that goes silent (sends
      // `response.head` but never `response.end`) can't pin the slot
      // forever. The asset graph BFS opens many requests; without this
      // a stuck hub would slowly leak entries.
      const timer = setTimeout(() => {
        if (!inflight.has(id)) {
          return;
        }
        sendRpc({ v: PROTOCOL_VERSION, kind: 'abort', id });
        assembler.onError({
          v: PROTOCOL_VERSION,
          kind: 'response.error',
          id,
          code: 'timeout',
          message: 'RPC request timed out',
        });
        inflight.delete(id);
      }, REQUEST_TIMEOUT_MS);

      inflight.set(id, { assembler, timer });

      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            if (!inflight.has(id)) {
              return;
            }
            clearTimeout(timer);
            sendRpc({ v: PROTOCOL_VERSION, kind: 'abort', id });
            assembler.onError({
              v: PROTOCOL_VERSION,
              kind: 'response.error',
              id,
              code: 'aborted',
              message: 'Aborted',
            });
            inflight.delete(id);
          },
          { once: true }
        );
      }
      sendRpc({
        v: PROTOCOL_VERSION,
        kind: 'request',
        id,
        method,
        url,
        headers: [],
      });
      return assembler.response();
    },
    close: () => {
      // Drain inflight before tearing down the transport so we don't leak
      // 30s timers + assembler closures per pending request.
      for (const [id, slot] of inflight) {
        clearTimeout(slot.timer);
        slot.assembler.onError({
          v: PROTOCOL_VERSION,
          kind: 'response.error',
          id,
          code: 'closed',
          message: 'Peer closed',
        });
      }
      inflight.clear();
      closeQuietly(channel);
      closeQuietly(pc);
      closeQuietly(ws);
    },
  };
}
