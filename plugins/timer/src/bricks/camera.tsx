import { Button, Grid, Row, Stat, Status, Video, defineBrick, useBrickSize, usePreference, useState } from '@brika/sdk/bricks';

const STREAMS = [
  { name: 'Sintel', src: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8' },
  { name: 'Big Buck Bunny', src: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
  { name: 'Elephants Dream', src: 'https://playertest.longtailvideo.com/adaptive/elephants_dream_v4/index.m3u8' },
  { name: 'Oceans', src: 'https://playertest.longtailvideo.com/adaptive/oceans_aes/oceans_aes.m3u8' },
  { name: 'Angel One', src: 'https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8' },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function CameraControls({ recording, onPrev, onNext, onToggleRec }: Readonly<{
  recording: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggleRec: () => void;
}>) {
  return (
    <Row gap="sm">
      <Button label="Prev" onPress={onPrev} icon="chevron-left" variant="outline" />
      <Button
        label={recording ? 'Stop' : 'Record'}
        onPress={onToggleRec}
        icon={recording ? 'square' : 'circle'}
        variant={recording ? 'destructive' : 'default'}
      />
      <Button label="Next" onPress={onNext} icon="chevron-right" variant="outline" />
    </Row>
  );
}

function CameraInfoGrid({ streamName, recording, wide }: Readonly<{ streamName: string; recording: boolean; wide: boolean }>) {
  return (
    <Grid columns={wide ? 3 : 2} gap="sm">
      <Stat label="Stream" value={streamName} icon="video" color="#ef4444" />
      <Status label="Status" status={recording ? 'error' : 'online'} icon={recording ? 'circle-dot' : 'circle'} />
      {wide && <Stat label="Format" value="HLS" icon="radio" />}
    </Grid>
  );
}

// ─── Brick ───────────────────────────────────────────────────────────────────

export const cameraBrick = defineBrick(
  {
    id: 'camera',
    name: 'Live Video',
    description: 'HLS video stream with controls',
    icon: 'video',
    color: '#ef4444',
    families: ['sm', 'md', 'lg'],
    category: 'media',
    minSize: { w: 2, h: 2 },
    maxSize: { w: 12, h: 8 },
    config: [
      { type: 'dropdown', name: 'defaultStream', label: 'Default Stream', options: STREAMS.map((s) => ({ value: s.name })), default: STREAMS[0].name },
      { type: 'checkbox', name: 'muted', label: 'Muted', default: true },
    ],
  },
  () => {
    const { width, height } = useBrickSize();
    const [defaultStream] = usePreference<string>('defaultStream', STREAMS[0].name);
    const [muted] = usePreference<boolean>('muted', true);

    const defaultIndex = Math.max(0, STREAMS.findIndex((s) => s.name === defaultStream));
    const [streamIndex, setStreamIndex] = useState(defaultIndex);
    const [recording, setRecording] = useState(false);
    const stream = STREAMS[streamIndex % STREAMS.length];

    const handleNext = () => setStreamIndex((i: number) => (i + 1) % STREAMS.length);
    const handlePrev = () => setStreamIndex((i: number) => (i - 1 + STREAMS.length) % STREAMS.length);
    const handleToggleRec = () => setRecording((r: boolean) => !r);

    // ── Narrow (2-3 cols): video-focused ─────────────────────────────────
    if (width <= 3) {
      return (
        <>
          <Video src={stream.src} format="hls" muted={muted} />
          {height >= 3 && <Status label={stream.name} status={recording ? 'error' : 'online'} icon="video" />}
          {height >= 4 && <CameraControls recording={recording} onPrev={handlePrev} onNext={handleNext} onToggleRec={handleToggleRec} />}
        </>
      );
    }

    // ── Wide (4+ cols): video + info grid + controls ─────────────────────
    return (
      <>
        <Video src={stream.src} format="hls" muted={muted} />
        <CameraInfoGrid streamName={stream.name} recording={recording} wide={width >= 6} />
        {height >= 4 && <CameraControls recording={recording} onPrev={handlePrev} onNext={handleNext} onToggleRec={handleToggleRec} />}
      </>
    );
  },
);
