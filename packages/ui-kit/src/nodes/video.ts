import type { BaseNode } from './_shared';

export interface VideoNode extends BaseNode {
  type: 'video';
  src: string;
  format: 'hls' | 'mjpeg';
  poster?: string;
  aspectRatio?: string;
  muted?: boolean;
}

export function Video(props: Omit<VideoNode, 'type'>): VideoNode {
  return { type: 'video', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    video: VideoNode;
  }
}
