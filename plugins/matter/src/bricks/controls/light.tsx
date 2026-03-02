/**
 * Light controls — power toggle, brightness slider, and color presets.
 *
 * All features shown at every size. Labels appear at h≥3 for breathing room.
 * Brightness slider uses local state with debounced commands for smooth dragging.
 */

import { Sun } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hsvToHex, miredsToHex } from '../color-utils';
import { PowerToggle } from '../components';
import { getDeviceTheme } from '../theme';
import type { DeviceState } from '../types';
import { useSendCommand } from './send-command';

// ─── Color Presets ───────────────────────────────────────────────────────────

/** HSV presets (h: 0-360 degrees, s: 0-100 %) */
const COLOR_PRESETS = [
  { h: 35, s: 70 },
  { h: 45, s: 25 },
  { h: 200, s: 10 },
  { h: 0, s: 100 },
  { h: 25, s: 100 },
  { h: 50, s: 100 },
  { h: 120, s: 100 },
  { h: 180, s: 100 },
  { h: 230, s: 100 },
  { h: 270, s: 100 },
  { h: 300, s: 100 },
  { h: 340, s: 90 },
] as const;

/** Color temperature presets in mireds */
const TEMP_PRESETS = [
  { mireds: 153 },
  { mireds: 230 },
  { mireds: 333 },
  { mireds: 454 },
] as const;

// ─── Preset Matching ─────────────────────────────────────────────────────────

function closestColorPreset(hue: number, sat: number): number {
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < COLOR_PRESETS.length; i++) {
    const p = COLOR_PRESETS[i];
    const dh = Math.min(Math.abs(hue - p.h), 360 - Math.abs(hue - p.h));
    const ds = Math.abs(sat - p.s);
    const dist = dh + ds;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestDist < 25 ? bestIdx : -1;
}

function closestTempPreset(mireds: number): number {
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < TEMP_PRESETS.length; i++) {
    const dist = Math.abs(mireds - TEMP_PRESETS[i].mireds);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestDist < 40 ? bestIdx : -1;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LightControls({
  device,
  height,
}: Readonly<{ device: DeviceState; height: number }>) {
  const theme = getDeviceTheme('light');
  const isOn = Boolean(device.state.on);
  const brightness = device.state.brightness == null ? null : Number(device.state.brightness);
  const hue = device.state.hue == null ? null : Number(device.state.hue);
  const saturation = device.state.saturation == null ? null : Number(device.state.saturation);
  const colorTempMireds =
    device.state.colorTempMireds == null ? null : Number(device.state.colorTempMireds);
  const hasColor = hue != null && saturation != null;
  const hasColorTemp = colorTempMireds != null;
  const sendCommand = useSendCommand();

  let previewColor = theme.accentColor;
  if (hasColor) previewColor = hsvToHex(hue, saturation, brightness ?? 100);
  else if (hasColorTemp) previewColor = miredsToHex(colorTempMireds);

  const brightnessPct = brightness ?? 0;
  const showLabels = height >= 3;

  // ─── Debounced brightness (local state → batched IPC) ──────────────

  const [localBrightness, setLocalBrightness] = useState(brightnessPct);
  const brightnessTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setLocalBrightness(brightnessPct);
  }, [brightnessPct]);

  useEffect(() => {
    return () => clearTimeout(brightnessTimer.current);
  }, []);

  // ─── Active preset detection ───────────────────────────────────────

  const activeColorIdx = useMemo(
    () => (hasColor ? closestColorPreset(hue, saturation) : -1),
    [hue, saturation, hasColor],
  );

  const activeTempIdx = useMemo(
    () => (hasColorTemp && !hasColor ? closestTempPreset(colorTempMireds) : -1),
    [colorTempMireds, hasColorTemp, hasColor],
  );

  // ─── Handlers ──────────────────────────────────────────────────────

  const handleToggle = useCallback(() => {
    sendCommand(device.nodeId, 'toggle');
  }, [sendCommand, device.nodeId]);

  const handleBrightness = useCallback(
    (value: number) => {
      setLocalBrightness(value);
      clearTimeout(brightnessTimer.current);
      brightnessTimer.current = setTimeout(() => {
        const level = Math.round((value / 100) * 254);
        sendCommand(device.nodeId, 'setBrightness', { level: String(level) });
      }, 150);
    },
    [sendCommand, device.nodeId],
  );

  const handleColorPreset = useCallback(
    (presetH: number, presetS: number) => {
      const matterHue = Math.round((presetH / 360) * 254);
      const matterSat = Math.round((presetS / 100) * 254);
      sendCommand(device.nodeId, 'setHueSaturation', {
        hue: String(matterHue),
        saturation: String(matterSat),
      });
    },
    [sendCommand, device.nodeId],
  );

  const handleTempPreset = useCallback(
    (mireds: number) => {
      sendCommand(device.nodeId, 'setColorTemp', { mireds: String(mireds) });
    },
    [sendCommand, device.nodeId],
  );

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-2.5">
      {/* ── Power + color preview ──────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <PowerToggle isOn={isOn} accentColor={previewColor} onToggle={handleToggle} />
        <div
          className="size-7 shrink-0 rounded-full transition-all duration-300"
          style={{
            backgroundColor: previewColor,
            boxShadow: isOn
              ? `0 0 20px ${previewColor}80, 0 0 6px ${previewColor}40`
              : 'none',
            opacity: isOn ? 1 : 0.3,
          }}
        />
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-white">{isOn ? 'On' : 'Off'}</span>
          {brightness != null && (
            <span className="text-[10px] text-white/40 tabular-nums">
              {localBrightness}%
            </span>
          )}
        </div>
      </div>

      {/* ── Brightness slider ──────────────────────────────────────── */}
      {brightness != null && (
        <div className={showLabels ? 'space-y-1.5' : ''}>
          {showLabels && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sun className="size-3 text-white/40" />
                <span className="text-[11px] text-white/40">Brightness</span>
              </div>
              <span className="text-[11px] font-medium text-white tabular-nums">
                {localBrightness}%
              </span>
            </div>
          )}
          <div className="relative h-2 rounded-full bg-white/10">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${localBrightness}%`,
                background: `linear-gradient(90deg, ${previewColor}30, ${previewColor})`,
              }}
            />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={localBrightness}
              onChange={(e) => handleBrightness(Number(e.target.value))}
              className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent
                [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.3)]"
            />
          </div>
        </div>
      )}

      {/* ── Color presets ──────────────────────────────────────────── */}
      {hasColor && (
        <div className={showLabels ? 'space-y-1.5' : ''}>
          {showLabels && <span className="text-[11px] text-white/40">Color</span>}
          <div className="flex flex-wrap gap-1.5">
            {COLOR_PRESETS.map((preset, i) => {
              const color = hsvToHex(preset.h, preset.s, 85);
              const isActive = activeColorIdx === i;
              return (
                <button
                  key={`${preset.h}-${preset.s}`}
                  type="button"
                  onClick={() => handleColorPreset(preset.h, preset.s)}
                  className="size-6 shrink-0 cursor-pointer rounded-full transition-all duration-150 hover:scale-110 active:scale-95"
                  style={{
                    backgroundColor: color,
                    boxShadow: isActive
                      ? `0 0 0 2px rgba(0,0,0,0.4), 0 0 0 3.5px white, 0 0 12px ${color}50`
                      : '0 1px 3px rgba(0,0,0,0.25)',
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Temperature presets ────────────────────────────────────── */}
      {hasColorTemp && !hasColor && (
        <div className={showLabels ? 'space-y-1.5' : ''}>
          {showLabels && <span className="text-[11px] text-white/40">Temperature</span>}
          <div className="flex gap-2">
            {TEMP_PRESETS.map((preset, i) => {
              const color = miredsToHex(preset.mireds);
              const isActive = activeTempIdx === i;
              return (
                <button
                  key={preset.mireds}
                  type="button"
                  onClick={() => handleTempPreset(preset.mireds)}
                  className="size-7 shrink-0 cursor-pointer rounded-full transition-all duration-150 hover:scale-110 active:scale-95"
                  style={{
                    backgroundColor: color,
                    boxShadow: isActive
                      ? `0 0 0 2px rgba(0,0,0,0.4), 0 0 0 3.5px white, 0 0 12px ${color}50`
                      : '0 1px 3px rgba(0,0,0,0.25)',
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
