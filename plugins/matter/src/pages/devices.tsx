import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  ScrollArea,
  Separator,
  Skeleton,
} from '@brika/sdk/ui-kit';
import { useAction, useCallAction, useLocale } from '@brika/sdk/ui-kit/hooks';
import {
  Blinds,
  ChevronRight,
  Cpu,
  Eye,
  Info,
  Lightbulb,
  Loader2,
  Lock,
  LockOpen,
  Network,
  Power,
  Radar,
  Sun,
  Thermometer,
  ToggleLeft,
  Trash2,
  Wrench,
} from '@brika/sdk/ui-kit/icons';
import { useState } from 'react';
import { commission, getDevices, remove, scan } from '../actions';

// ─── Types ──────────────────────────────────────────────────────────────────

type DeviceType = 'light' | 'lock' | 'cover' | 'thermostat' | 'switch' | 'sensor' | 'bridge' | 'unknown';

interface MatterDevice {
  nodeId: string;
  name: string;
  deviceType: DeviceType;
  online: boolean;
  commissioned: boolean;
  state: Record<string, unknown>;
  discriminator: number | null;
  vendor: string | null;
  product: string | null;
  serial: string | null;
  softwareVersion: string | null;
}

// ─── Device type metadata ───────────────────────────────────────────────────

type CardAccent = 'blue' | 'emerald' | 'violet' | 'orange' | 'purple' | 'amber' | 'none';

interface DeviceMeta {
  icon: typeof Cpu;
  accent: CardAccent;
  iconClass: string;
  bgClass: string;
}

// Colors use theme-aware data tokens (data-1…data-8) compiled via @source inline()
const DEVICE_META: Record<DeviceType, DeviceMeta> = {
  light:      { icon: Lightbulb,   accent: 'amber',   iconClass: 'text-data-6', bgClass: 'bg-data-6/15' },
  lock:       { icon: Lock,        accent: 'violet',  iconClass: 'text-data-5', bgClass: 'bg-data-5/15' },
  cover:      { icon: Blinds,      accent: 'blue',    iconClass: 'text-data-1', bgClass: 'bg-data-1/15' },
  thermostat: { icon: Thermometer, accent: 'orange',  iconClass: 'text-data-2', bgClass: 'bg-data-2/15' },
  switch:     { icon: ToggleLeft,  accent: 'emerald', iconClass: 'text-data-3', bgClass: 'bg-data-3/15' },
  sensor:     { icon: Eye,         accent: 'purple',  iconClass: 'text-data-8', bgClass: 'bg-data-8/15' },
  bridge:     { icon: Network,     accent: 'blue',    iconClass: 'text-data-7', bgClass: 'bg-data-7/15' },
  unknown:    { icon: Wrench,      accent: 'none',    iconClass: 'text-muted-foreground', bgClass: 'bg-muted' },
};

const TYPE_ORDER: DeviceType[] = ['light', 'switch', 'lock', 'cover', 'thermostat', 'sensor', 'unknown'];

type TFn = (key: string, options?: Record<string, unknown>) => string;

// ─── Helpers ────────────────────────────────────────────────────────────────

interface StatePart {
  icon: typeof Cpu;
  label: string;
}

function isBridgeChild(nodeId: string): boolean {
  return nodeId.includes(':');
}

function getRootNodeId(nodeId: string): string {
  return nodeId.split(':')[0];
}

function buildStateParts(device: MatterDevice, t: TFn): StatePart[] {
  const parts: StatePart[] = [];
  if (device.state.on != null)
    parts.push({ icon: Power, label: device.state.on ? t('device.on') : t('device.off') });
  if (device.state.brightness != null)
    parts.push({ icon: Sun, label: t('devicesPage.brightness', { value: device.state.brightness }) });
  if (device.state.locked != null)
    parts.push({
      icon: device.state.locked ? Lock : LockOpen,
      label: device.state.locked ? t('device.locked') : t('device.unlocked'),
    });
  if (device.state.temperature != null)
    parts.push({ icon: Thermometer, label: t('devicesPage.temperature', { value: device.state.temperature }) });
  if (device.state.coverPosition != null)
    parts.push({ icon: Blinds, label: t('devicesPage.position', { value: device.state.coverPosition }) });
  if (typeof device.state.systemModeName === 'string') {
    parts.push({ icon: Wrench, label: device.state.systemModeName });
  }
  return parts;
}

/**
 * Detect bridge devices: either by explicit deviceType or by having child
 * endpoints (other devices whose nodeId starts with this device's nodeId + ":").
 */
function getBridges(devices: MatterDevice[]): MatterDevice[] {
  return devices.filter((d) => {
    if (d.deviceType === 'bridge') return true;
    if (!d.nodeId.includes(':')) {
      return devices.some((other) => other.nodeId.startsWith(d.nodeId + ':'));
    }
    return false;
  });
}

function getBridgeChildren(bridge: MatterDevice, devices: MatterDevice[]): MatterDevice[] {
  const rootId = getRootNodeId(bridge.nodeId);
  return devices.filter((d) => d.nodeId !== bridge.nodeId && getRootNodeId(d.nodeId) === rootId);
}

function groupByType(devices: MatterDevice[], bridgeIds: Set<string>): [DeviceType, MatterDevice[]][] {
  const groups = new Map<DeviceType, MatterDevice[]>();
  for (const device of devices) {
    if (bridgeIds.has(device.nodeId)) continue;
    const list = groups.get(device.deviceType);
    if (list) list.push(device);
    else groups.set(device.deviceType, [device]);
  }
  return TYPE_ORDER.filter((type) => groups.has(type)).map((type) => [type, groups.get(type) ?? []]);
}

function findBridgeName(device: MatterDevice, allDevices: MatterDevice[]): string {
  const rootId = getRootNodeId(device.nodeId);
  const bridge = allDevices.find((d) => d.deviceType === 'bridge' && getRootNodeId(d.nodeId) === rootId);
  return bridge?.name ?? bridge?.vendor ?? 'Bridge';
}

// ─── Device card ────────────────────────────────────────────────────────────

function DeviceCard({ device, allDevices, onRemove, onInfo, removingId, t }: Readonly<{
  device: MatterDevice;
  allDevices: MatterDevice[];
  onRemove: (id: string) => void;
  onInfo: (device: MatterDevice) => void;
  removingId: string | null;
  t: TFn;
}>) {
  const meta = DEVICE_META[device.deviceType] ?? DEVICE_META.unknown;
  const Icon = meta.icon;
  const stateParts = buildStateParts(device, t);
  const isRemoving = removingId === device.nodeId;
  const bridgeChild = isBridgeChild(device.nodeId);
  const bridgeName = bridgeChild ? findBridgeName(device, allDevices) : null;

  return (
    <Card accent={meta.accent} className="group overflow-hidden">
      <CardContent className="flex items-start gap-3 p-3">
        {/* Avatar with online dot */}
        <div className="relative shrink-0">
          <Avatar size="lg" className={meta.bgClass}>
            <AvatarFallback className={`${meta.bgClass} ${meta.iconClass}`}>
              <Icon className="size-5" />
            </AvatarFallback>
          </Avatar>
          <span
            className={`absolute right-0 bottom-0 z-10 size-2.5 rounded-full ring-2 ring-card ${device.online ? 'bg-success' : 'bg-muted-foreground'}`}
          />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">{device.name}</p>

          {/* State badges */}
          {stateParts.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {stateParts.map((part) => (
                <Badge key={part.label} variant="secondary" className="gap-1 text-xs">
                  <part.icon className="size-3 shrink-0" />
                  <span className="truncate">{part.label}</span>
                </Badge>
              ))}
            </div>
          )}

          {/* Bridge / vendor info */}
          {(bridgeName ?? device.vendor) && (
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
              {bridgeChild && <Network className="size-3 shrink-0" />}
              <span className="truncate">
                {bridgeName
                  ? t('devicesPage.viaBridge', { bridge: bridgeName })
                  : device.vendor}
              </span>
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon-xs"
            className="hover:bg-muted hover:text-foreground"
            onClick={() => onInfo(device)}
          >
            <Info className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="hover:bg-muted hover:text-foreground"
            onClick={() => onRemove(device.nodeId)}
            disabled={isRemoving}
          >
            {isRemoving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Type group ─────────────────────────────────────────────────────────────

function DeviceTypeGroup({ type, devices, allDevices, onRemove, onInfo, removingId, t }: Readonly<{
  type: DeviceType;
  devices: MatterDevice[];
  allDevices: MatterDevice[];
  onRemove: (id: string) => void;
  onInfo: (device: MatterDevice) => void;
  removingId: string | null;
  t: TFn;
}>) {
  const meta = DEVICE_META[type] ?? DEVICE_META.unknown;
  const Icon = meta.icon;
  const [open, setOpen] = useState(true);
  const onlineCount = devices.filter((d) => d.online).length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 py-1 text-left"
        >
          <div className={`flex size-7 items-center justify-center rounded-lg ${meta.bgClass} ${meta.iconClass}`}>
            <Icon className="size-4" />
          </div>
          <span className="flex-1 truncate font-semibold text-sm">
            {t(`devicesPage.typesPlural.${type}`)}
          </span>
          <Badge variant="secondary" className="gap-1.5 text-xs">
            <span className={`size-2 rounded-full ${onlineCount > 0 ? 'bg-success' : 'bg-muted-foreground'}`} />
            {`${onlineCount}/${devices.length}`}
          </Badge>
          <ChevronRight className={`size-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => (
            <DeviceCard
              key={device.nodeId}
              device={device}
              allDevices={allDevices}
              onRemove={onRemove}
              onInfo={onInfo}
              removingId={removingId}
              t={t}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Bridge section ─────────────────────────────────────────────────────────
// Reuses DeviceTypeGroup with standard DeviceCards — sub-devices shown in info dialog

// ─── Device info dialog ─────────────────────────────────────────────────────

function InfoRow({ label, value }: Readonly<{ label: string; value: string | null | undefined }>) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-sm">{value}</span>
    </div>
  );
}

function DeviceInfoDialog({ device, allDevices, onClose, t }: Readonly<{
  device: MatterDevice | null;
  allDevices: MatterDevice[];
  onClose: () => void;
  t: TFn;
}>) {
  if (!device) return null;

  const meta = DEVICE_META[device.deviceType] ?? DEVICE_META.unknown;
  const Icon = meta.icon;
  const stateParts = buildStateParts(device, t);
  const isBridge = device.deviceType === 'bridge';
  const children = isBridge ? getBridgeChildren(device, allDevices) : [];

  return (
    <Dialog open onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar size="lg" className={meta.bgClass}>
              <AvatarFallback className={`${meta.bgClass} ${meta.iconClass}`}>
                <Icon className="size-5" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <DialogTitle className="truncate">{device.name}</DialogTitle>
              <DialogDescription className="sr-only">
                {t('devicesPage.vendor')}: {device.vendor ?? '-'}
              </DialogDescription>
              <div className="mt-1 flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${device.online ? 'bg-success' : 'bg-muted-foreground'}`} />
                <span className="text-xs text-muted-foreground">
                  {device.online ? t('device.online') : t('device.offline')}
                </span>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* State */}
        {stateParts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {stateParts.map((part) => (
              <Badge key={part.label} variant="secondary" className="gap-1 text-xs">
                <part.icon className="size-3 shrink-0" />
                {part.label}
              </Badge>
            ))}
          </div>
        )}

        <Separator />

        {/* Device details */}
        <div className="flex flex-col">
          <InfoRow label={t('devicesPage.vendor')} value={device.vendor} />
          <InfoRow label={t('devicesPage.product')} value={device.product} />
          <InfoRow label={t('devicesPage.serial')} value={device.serial} />
          <InfoRow label={t('devicesPage.software')} value={device.softwareVersion} />
          <InfoRow label="Node ID" value={device.nodeId} />
          {device.discriminator != null && (
            <InfoRow label="Discriminator" value={String(device.discriminator)} />
          )}
        </div>

        {/* Bridge sub-devices */}
        {children.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <p className="font-medium text-sm">
                {t('devicesPage.connectedDevices', { count: children.length })}
              </p>
              <ScrollArea className="max-h-48">
                <div className="flex flex-col gap-1">
                  {children.map((child) => {
                    const childMeta = DEVICE_META[child.deviceType] ?? DEVICE_META.unknown;
                    const ChildIcon = childMeta.icon;
                    return (
                      <div key={child.nodeId} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                        <Avatar size="sm" className={childMeta.bgClass}>
                          <AvatarFallback className={`${childMeta.bgClass} ${childMeta.iconClass}`}>
                            <ChildIcon className="size-3" />
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-sm">{child.name}</span>
                        <span
                          className={`ml-auto size-2 shrink-0 rounded-full ${child.online ? 'bg-success' : 'bg-muted-foreground'}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function DevicesPage() {
  const { t } = useLocale();
  const callAction = useCallAction();
  const { data, loading, refetch } = useAction(getDevices);
  const [scanning, setScanning] = useState(false);
  const [commissioning, setCommissioning] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [infoDevice, setInfoDevice] = useState<MatterDevice | null>(null);

  const devices: MatterDevice[] = data?.devices ?? [];
  const online = devices.filter((d) => d.online);
  const bridges = getBridges(devices);
  const bridgeIds = new Set(bridges.map((b) => b.nodeId));
  const typeGroups = groupByType(devices, bridgeIds);

  const handleScan = async () => {
    setScanning(true);
    try {
      await callAction(scan);
      refetch();
    } finally {
      setScanning(false);
    }
  };

  const handleCommission = async () => {
    const code = pairingCode.trim();
    if (!code) return;
    setCommissioning(true);
    try {
      await callAction(commission, { pairingCode: code });
      setPairingCode('');
      refetch();
    } finally {
      setCommissioning(false);
    }
  };

  const handleRemove = async (nodeId: string) => {
    setRemovingId(nodeId);
    try {
      await callAction(remove, { nodeId });
      refetch();
    } finally {
      setRemovingId(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-4 p-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-40 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-7 w-32 rounded-md" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {t('devicesPage.deviceCount', { count: devices.length })}
          </Badge>
          <Badge variant={online.length > 0 ? 'default' : 'secondary'}>
            {t('devicesPage.onlineCount', { count: online.length })}
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={handleScan} disabled={scanning}>
          {scanning ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
          <span className="truncate">
            {scanning ? t('devicesPage.scanning') : t('devicesPage.scanNetwork')}
          </span>
        </Button>
      </div>

      {/* Commission */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="size-4" />
            <span className="truncate">{t('devicesPage.commissionTitle')}</span>
          </CardTitle>
          <CardDescription className="truncate">
            {t('devicesPage.commissionDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={pairingCode}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPairingCode(e.target.value)}
              placeholder={t('devicesPage.commissionPlaceholder')}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter') handleCommission();
              }}
            />
            <Button onClick={handleCommission} disabled={commissioning || !pairingCode.trim()}>
              {commissioning ? <Loader2 className="size-4 animate-spin" /> : null}
              <span className="truncate">
                {commissioning ? t('devicesPage.commissioning') : t('devicesPage.commission')}
              </span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Device groups */}
      {devices.length > 0 ? (
        <div className="flex flex-col gap-5">
          {typeGroups.map(([type, groupDevices]) => (
            <DeviceTypeGroup
              key={type}
              type={type}
              devices={groupDevices}
              allDevices={devices}
              onRemove={handleRemove}
              onInfo={setInfoDevice}
              removingId={removingId}
              t={t}
            />
          ))}

          {/* Bridges */}
          {bridges.length > 0 && (
            <DeviceTypeGroup
              type="bridge"
              devices={bridges}
              allDevices={devices}
              onRemove={handleRemove}
              onInfo={setInfoDevice}
              removingId={removingId}
              t={t}
            />
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Cpu className="mx-auto mb-3 size-10 opacity-30" />
            <p className="font-medium">{t('devicesPage.emptyTitle')}</p>
            <p className="mt-1 text-sm opacity-60">
              {t('devicesPage.emptyDescription')}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Info modal */}
      <DeviceInfoDialog device={infoDevice} allDevices={devices} onClose={() => setInfoDevice(null)} t={t} />
    </div>
  );
}
