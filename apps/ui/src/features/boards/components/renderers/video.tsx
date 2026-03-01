import { useEffect, useRef } from 'react';
import { defineRenderer } from './registry';

function HlsVideo({
  src,
  poster,
  muted,
  controls,
  loop,
}: Readonly<{
  src: string;
  poster?: string;
  muted: boolean;
  controls?: boolean;
  loop?: boolean;
}>) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return;
    }

    let hls:
      | {
          destroy(): void;
        }
      | undefined;

    import('hls.js').then(({ default: Hls }) => {
      if (!Hls.isSupported()) {
        return;
      }
      const instance = new Hls({
        enableWorker: false,
        lowLatencyMode: true,
      });
      instance.loadSource(src);
      instance.attachMedia(video);
      hls = instance;
    });

    return () => hls?.destroy();
  }, [src]);

  return (
    <video
      ref={videoRef}
      poster={poster}
      muted={muted}
      autoPlay
      playsInline
      controls={controls}
      loop={loop}
      className="h-full w-full object-cover"
    >
      <track kind="captions" />
    </video>
  );
}

defineRenderer('video', ({ node }) => {
  if (node.format === 'mjpeg') {
    return (
      <div className="min-h-0 flex-1 overflow-hidden rounded-md">
        <img src={node.src} alt="Camera feed" className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-md">
      <HlsVideo
        src={node.src}
        poster={node.poster}
        muted={node.muted ?? true}
        controls={node.controls}
        loop={node.loop}
      />
    </div>
  );
});
