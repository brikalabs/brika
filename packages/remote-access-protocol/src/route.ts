/**
 * Pure translation helpers for the coordinator's signaling router.
 *
 * Both coordinator implementations (Bun in-process registry and the CF Worker
 * Durable Object) own a state machine that turns a `hub.*` or `client.*`
 * frame from one peer into the corresponding `session.*` frame for the other.
 * The dispatch — finding the right socket on each side — differs by backend,
 * but the frame shape that comes out is identical. These helpers are that
 * pure shape conversion, owned in one place.
 */

import type {
  ClientAbortMessage,
  ClientIceMessage,
  ClientOfferMessage,
  HubAbortMessage,
  HubAnswerMessage,
  HubIceMessage,
  IceServer,
  SessionAnswerMessage,
  SessionErrorMessage,
  SessionIceMessage,
  SessionOfferMessage,
} from './signaling';
import { PROTOCOL_VERSION } from './version';

/** Frames a hub may send that the coordinator forwards to the client side. */
export type HubInbound = HubAnswerMessage | HubIceMessage | HubAbortMessage;

/** Frames a client may send that the coordinator forwards to the hub side. */
export type ClientInbound = ClientOfferMessage | ClientIceMessage | ClientAbortMessage;

export function translateFromHub(
  msg: HubInbound
): SessionAnswerMessage | SessionIceMessage | SessionErrorMessage {
  switch (msg.kind) {
    case 'hub.answer':
      return {
        v: PROTOCOL_VERSION,
        kind: 'session.answer',
        sessionId: msg.sessionId,
        sdp: msg.sdp,
      };
    case 'hub.ice':
      return {
        v: PROTOCOL_VERSION,
        kind: 'session.ice',
        sessionId: msg.sessionId,
        candidate: msg.candidate,
        from: 'hub',
      };
    case 'hub.abort':
      return {
        v: PROTOCOL_VERSION,
        kind: 'session.error',
        sessionId: msg.sessionId,
        code: 'hub-abort',
        message: msg.reason ?? 'Hub aborted session',
      };
  }
}

export function translateFromClient(
  msg: ClientInbound,
  sessionId: string,
  iceServers: ReadonlyArray<IceServer>
): SessionOfferMessage | SessionIceMessage | SessionErrorMessage {
  switch (msg.kind) {
    case 'client.offer':
      return {
        v: PROTOCOL_VERSION,
        kind: 'session.offer',
        sessionId,
        sdp: msg.sdp,
        clientCaps: msg.caps,
        iceServers,
      };
    case 'client.ice':
      return {
        v: PROTOCOL_VERSION,
        kind: 'session.ice',
        sessionId,
        candidate: msg.candidate,
        from: 'client',
      };
    case 'client.abort':
      return {
        v: PROTOCOL_VERSION,
        kind: 'session.error',
        sessionId,
        code: 'client-abort',
        message: msg.reason ?? 'Client aborted',
      };
  }
}
