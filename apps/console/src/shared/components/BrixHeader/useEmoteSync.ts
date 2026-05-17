/**
 * Sync Brix's body emote with two upstream signals:
 *
 *   1. The hub state transitions to a new known value → play the matching
 *      greeting emote (wave / oops / sleep).
 *   2. `CliProvider` rotates `activityEmote` every 10–18 s while the hub
 *      is up → play that emote so Brix's posture matches the "-ing"
 *      caption ("snacking" → nom, "patrolling" → patrol, …).
 *
 * Both effects are de-duped via refs so React StrictMode double-mounts
 * don't replay every animation on every render.
 *
 * Pass `enabled = false` to suppress both sync paths — used during
 * dying / tombstone phases so the `dead` emote and the static
 * tombstone aren't clobbered by an unrelated hub greeting or activity
 * rotation. Refs still advance while disabled so re-enabling doesn't
 * trigger a flood of catch-up plays.
 */

import { type EmoteName, useEmote } from '@brika/brix';
import { useEffect, useRef } from 'react';
import { HUB_EMOTES, type HubState } from './lines';

export function useEmoteSync(
  hubState: HubState,
  activityEmote: EmoteName | null,
  enabled = true
): void {
  const api = useEmote();
  const lastHub = useRef<HubState | null>(null);
  const lastActivity = useRef<EmoteName | null>(null);

  useEffect(() => {
    if (lastHub.current === hubState) {
      return;
    }
    lastHub.current = hubState;
    if (!enabled) {
      return;
    }
    const name = HUB_EMOTES[hubState];
    if (name) {
      api.play(name);
    }
  }, [hubState, api, enabled]);

  useEffect(() => {
    if (activityEmote === null || activityEmote === lastActivity.current) {
      lastActivity.current = activityEmote;
      return;
    }
    lastActivity.current = activityEmote;
    if (!enabled) {
      return;
    }
    api.play(activityEmote);
  }, [activityEmote, api, enabled]);
}
