/**
 * Add a Matter Device — client-rendered brick.
 *
 * Lets a user pair a new Matter device from a dashboard by entering its
 * setup/pairing code (e.g. "1234-567-8901" or an 11/21-digit numeric code).
 * Optionally scans the local network and lists discoverable devices.
 *
 * Pairing and scanning run server-side via callAction(commission|scan, ...).
 */

import { useBrickSize } from '@brika/sdk/brick-views';
import { useCallAction } from '@brika/sdk/ui-kit/hooks';
import { AlertTriangle, CheckCircle2, Loader2, Plus, Radar } from 'lucide-react';
import { useCallback, useState } from 'react';
import { commission, scan } from '../actions';

const MATTER_ACCENT = '#6366f1';
const OVERVIEW_GRADIENT = 'linear-gradient(135deg, #1a1e38 0%, #252a48 50%, #303658 100%)';

type PairStatus = 'idle' | 'pairing' | 'success' | 'error';
type ScanStatus = 'idle' | 'scanning';

interface DiscoveredDevice {
  nodeId: string;
  name: string;
  deviceType: string;
}

/** Best-effort human message from an unknown thrown value. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  return 'Pairing failed. Check the code and try again.';
}

export default function CommissionBrick() {
  const { height } = useBrickSize();
  const callAction = useCallAction();

  const [pairingCode, setPairingCode] = useState('');
  const [status, setStatus] = useState<PairStatus>('idle');
  const [pairedName, setPairedName] = useState('');
  const [error, setError] = useState('');

  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [discovered, setDiscovered] = useState<readonly DiscoveredDevice[]>([]);

  const trimmedCode = pairingCode.trim();
  const canPair = trimmedCode.length > 0 && status !== 'pairing';

  const handlePair = useCallback(async () => {
    const code = pairingCode.trim();
    if (code.length === 0) {
      return;
    }
    setStatus('pairing');
    setError('');
    try {
      const result = await callAction(commission, { pairingCode: code });
      setPairedName(result.device?.name ?? 'New device');
      setStatus('success');
      setPairingCode('');
    } catch (error_: unknown) {
      setError(errorMessage(error_));
      setStatus('error');
    }
  }, [callAction, pairingCode]);

  const handleScan = useCallback(async () => {
    setScanStatus('scanning');
    try {
      const result = await callAction(scan, undefined);
      setDiscovered(
        result.discovered.map((d) => ({
          nodeId: d.nodeId,
          name: d.name,
          deviceType: d.deviceType,
        }))
      );
    } catch {
      setDiscovered([]);
    } finally {
      setScanStatus('idle');
    }
  }, [callAction]);

  const resetToIdle = useCallback(() => {
    setStatus('idle');
    setPairedName('');
    setError('');
  }, []);

  // ─── Success state ────────────────────────────────────────────────────

  if (status === 'success') {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 rounded-lg p-4 text-center"
        style={{ background: OVERVIEW_GRADIENT }}
      >
        <div
          className="flex size-12 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(52,211,153,0.18)' }}
        >
          <CheckCircle2 className="size-6 text-emerald-400" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-sm text-white">Device paired</span>
          <span className="truncate text-white/60 text-xs">{pairedName}</span>
        </div>
        <button
          type="button"
          onClick={resetToIdle}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium text-white text-xs transition-opacity hover:opacity-90"
          style={{ backgroundColor: MATTER_ACCENT }}
        >
          <Plus className="size-4" />
          Add another
        </button>
      </div>
    );
  }

  // ─── Idle / pairing / error state ─────────────────────────────────────

  return (
    <div
      className="flex h-full flex-col gap-3 overflow-hidden rounded-lg p-4"
      style={{ background: OVERVIEW_GRADIENT }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(99,102,241,0.2)' }}
        >
          <Plus className="size-5 text-indigo-400" />
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-sm text-white">Add a Matter device</span>
          <span className="text-[11px] text-white/50">Enter the setup or pairing code</span>
        </div>
      </div>

      {/* Pairing code input */}
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        value={pairingCode}
        onChange={(event) => setPairingCode(event.target.value)}
        placeholder="1234-567-8901"
        disabled={status === 'pairing'}
        className="w-full rounded-lg border border-white/10 bg-white/8 px-3 py-2 font-mono text-sm text-white placeholder:text-white/30 focus:border-indigo-400/60 focus:outline-none disabled:opacity-60"
      />

      {/* Add device button */}
      <button
        type="button"
        onClick={handlePair}
        disabled={!canPair}
        className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 font-medium text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ backgroundColor: MATTER_ACCENT }}
      >
        {status === 'pairing' ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Pairing…
          </>
        ) : (
          <>
            <Plus className="size-4" />
            Add device
          </>
        )}
      </button>

      {/* Error message */}
      {status === 'error' && (
        <div className="flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-400" />
          <span className="text-red-200/90 text-xs">{error}</span>
        </div>
      )}

      {/* Scan network (secondary) */}
      {height >= 3 && (
        <div className="mt-auto flex flex-col gap-2">
          <div className="h-px bg-white/10" />
          <button
            type="button"
            onClick={handleScan}
            disabled={scanStatus === 'scanning'}
            className="flex items-center justify-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 font-medium text-white/70 text-xs transition-colors hover:bg-white/8 disabled:opacity-50"
          >
            {scanStatus === 'scanning' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Radar className="size-3.5" />
            )}
            {scanStatus === 'scanning' ? 'Scanning…' : 'Scan network'}
          </button>

          {discovered.length > 0 && (
            <div className="flex max-h-24 flex-col gap-1 overflow-y-auto">
              {discovered.map((device) => (
                <div
                  key={device.nodeId}
                  className="flex items-center gap-2 rounded-md bg-white/5 px-2 py-1"
                >
                  <span className="truncate text-white/80 text-xs">{device.name}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-white/40">
                    {device.deviceType}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
