import type { VideoNode } from '@brika/ui-kit';
import Hls from 'hls.js';
import { memo, useEffect, useRef } from 'react';

function HlsVideo({ src, poster, muted }: { src: string; poster?: string; muted: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari — native HLS
      video.src = src;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: false, lowLatencyMode: true });
      hls.loadSource(src);
      hls.attachMedia(video);
      return () => hls.destroy();
    }
  }, [src]);

  return (
    <video
      ref={videoRef}
      poster={poster}
      muted={muted}
      autoPlay
      playsInline
      className="h-full w-full object-cover"
    />
  );
}

export const VideoRenderer = memo(function VideoRenderer({ node }: { node: VideoNode }) {
  if (node.format === 'mjpeg') {
    return (
      <div className="min-h-0 flex-1 overflow-hidden rounded-md">
        <img src={node.src} alt="Camera feed" className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-md">
      <HlsVideo src={node.src} poster={node.poster} muted={node.muted ?? true} />
    </div>
  );
});
