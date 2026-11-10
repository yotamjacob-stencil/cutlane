export type MediaKind = 'video' | 'audio' | 'image';

export interface MediaItem {
  id: string;
  name: string;
  kind: MediaKind;
  url: string;
  duration: number;
  width: number;
  height: number;
  thumb: string;
  hasAudio: boolean;
  /** Waveform peaks, PEAKS_PER_SEC samples per second, 0..1 */
  peaks?: number[];
  size: number;
}

export const PEAKS_PER_SEC = 40;

export type TrackKind = 'video' | 'audio';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
}

export type ClipType = 'video' | 'image' | 'audio' | 'text' | 'shape';

export interface TextProps {
  content: string;
  font: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  stroke: string;
  strokeWidth: number;
  shadow: string;
  shadowBlur: number;
  bg: string;
  animIn: TextAnim;
  animOut: TextAnim;
}

export type TextAnim = 'none' | 'fade' | 'slideUp' | 'slideDown' | 'pop' | 'typewriter';

export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'star' | 'arrow' | 'line';

export interface ShapeProps {
  kind: ShapeKind;
  fill: string;
  w: number;
  h: number;
}

export interface ColorProps {
  preset: string;
  brightness: number; // 100 = neutral
  contrast: number;
  saturation: number;
  hue: number; // degrees
  blur: number; // px
}

export type TransitionType =
  | 'fade'
  | 'dip'
  | 'wipeLeft'
  | 'wipeRight'
  | 'wipeUp'
  | 'wipeDown'
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'slideDown'
  | 'zoom'
  | 'iris';

export type Motion = 'none' | 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight';

export interface Clip {
  id: string;
  trackId: string;
  type: ClipType;
  mediaId?: string;
  name: string;
  /** Position on the timeline, seconds */
  start: number;
  /** Length on the timeline, seconds */
  duration: number;
  /** In point inside the source, seconds */
  offset: number;
  speed: number;

  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  flipH: boolean;
  flipV: boolean;
  blend: GlobalCompositeOperation;
  fit: 'contain' | 'cover';
  crop: { l: number; t: number; r: number; b: number };
  color: ColorProps;
  motion: Motion;

  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;

  transIn?: { type: TransitionType; duration: number };

  text?: TextProps;
  shape?: ShapeProps;
}

export interface Project {
  name: string;
  width: number;
  height: number;
  fps: number;
  /** Display order, top to bottom. Video tracks higher in the list draw in front. */
  tracks: Track[];
  clips: Clip[];
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export const clipEnd = (c: Clip) => c.start + c.duration;

export const projectDuration = (p: Project) => p.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);

export const isVisual = (c: Clip) => c.type !== 'audio';

export const hasSound = (c: Clip) => c.type === 'audio' || c.type === 'video';

export function formatTime(t: number, fps = 30): string {
  if (!isFinite(t) || t < 0) t = 0;
  const f = Math.floor((t % 1) * fps + 1e-6);
  const s = Math.floor(t) % 60;
  const m = Math.floor(t / 60) % 60;
  const h = Math.floor(t / 3600);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}:${p(f)}`;
}
