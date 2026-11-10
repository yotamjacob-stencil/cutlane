import { Clip, ShapeKind, TextProps, TransitionType } from './types';
import { useStore } from './store';
import { clipEnd } from './types';

export interface TitlePreset {
  label: string;
  text: Partial<TextProps>;
  clip?: Partial<Clip>;
  /** CSS used for the tile in the library */
  css: React.CSSProperties;
}

export const TITLE_PRESETS: TitlePreset[] = [
  { label: 'Headline', text: { content: 'Headline', size: 140 }, css: { fontWeight: 700, fontSize: 20 } },
  { label: 'Subtitle', text: { content: 'Subtitle goes here', size: 56, bold: false, shadowBlur: 12 }, clip: { y: 400 }, css: { fontSize: 12 } },
  {
    label: 'Lower third',
    text: { content: 'Name Surname', size: 60, bg: '#f5a524', color: '#161310', animIn: 'slideUp', animOut: 'fade' },
    clip: { x: -520, y: 360 },
    css: { fontWeight: 700, fontSize: 12, background: '#f5a524', color: '#161310', padding: '2px 8px', borderRadius: 3 },
  },
  {
    label: 'Outline',
    text: { content: 'OUTLINE', size: 160, font: 'Impact, "Arial Black", sans-serif', strokeWidth: 8, stroke: '#000000', animIn: 'pop' },
    css: { fontFamily: 'Impact, sans-serif', fontSize: 22, WebkitTextStroke: '1px #000', textShadow: '0 0 0 #000' },
  },
  {
    label: 'Glow',
    text: { content: 'Glow', size: 150, color: '#7df9ff', shadow: '#00c2ff', shadowBlur: 40, animIn: 'fade', animOut: 'fade' },
    css: { color: '#7df9ff', fontWeight: 700, fontSize: 20, textShadow: '0 0 10px #00c2ff' },
  },
  {
    label: 'Typewriter',
    text: { content: 'Typed out, letter by letter', size: 64, font: '"Courier New", monospace', bold: false, animIn: 'typewriter' },
    css: { fontFamily: '"Courier New", monospace', fontSize: 11 },
  },
  {
    label: 'Caption',
    text: { content: 'Caption text', size: 52, bg: '#000000cc', bold: false },
    clip: { y: 420 },
    css: { fontSize: 11, background: '#000c', padding: '2px 8px', borderRadius: 3 },
  },
  {
    label: 'Serif quote',
    text: { content: '“A line worth\nremembering.”', size: 84, font: 'Georgia, serif', italic: true, bold: false, animIn: 'fade', animOut: 'fade' },
    css: { fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 13 },
  },
];

export const FONTS = [
  ['Sans', 'system-ui, sans-serif'],
  ['Serif', 'Georgia, serif'],
  ['Mono', '"Courier New", monospace'],
  ['Impact', 'Impact, "Arial Black", sans-serif'],
  ['Rounded', '"Trebuchet MS", Verdana, sans-serif'],
  ['Script', '"Brush Script MT", "Segoe Script", cursive'],
  ['Heavy', '"Arial Black", Arial, sans-serif'],
];

export const SHAPES: ShapeKind[] = ['rect', 'ellipse', 'triangle', 'star', 'arrow', 'line'];

export const EMOJI = '😀 😂 😍 🤩 😎 🥳 😱 🤔 👍 👏 🙌 💪 🔥 ✨ ⭐ 💥 ❤️ 💯 🎉 🎬 🎵 📍 ➡️ ⬅️ ⬆️ ⬇️ ✅ ❌ ⚡ 💡 🏆 🚀 🌈 ☀️ 🌙 💬'.split(' ');

export type DropPayload =
  | { kind: 'media'; id: string }
  | { kind: 'title'; index: number }
  | { kind: 'shape'; shape: ShapeKind }
  | { kind: 'emoji'; char: string }
  | { kind: 'transition'; type: TransitionType }
  | { kind: 'filter'; preset: string };

export const DRAG_TYPE = 'application/x-cutlane';

/** Apply a library item: onto a clip (transitions, filters) or into the timeline. */
export function applyPayload(p: DropPayload, at: { trackId?: string; start?: number; clipId?: string } = {}) {
  const st = useStore.getState();
  const scale = st.project.height / 1080;
  const where = { trackId: at.trackId, start: at.start };
  if (p.kind === 'media') return st.addMediaClip(p.id, where);
  if (p.kind === 'transition' || p.kind === 'filter') {
    const id = at.clipId ?? st.selection[0];
    const clip = st.project.clips.find((c) => c.id === id);
    if (!clip || clip.type === 'audio') return st.toast('Select a clip on the timeline first, or drag this onto one.');
    if (p.kind === 'filter') st.updateClip(clip.id, { color: { ...clip.color, preset: p.preset } });
    else st.updateClip(clip.id, { transIn: { type: p.type, duration: Math.min(1, clip.duration / 2) } });
    st.select([clip.id]);
    if (p.kind === 'transition') st.setTime(Math.max(0, clip.start - 0.5));
    return;
  }
  const before = new Set(st.project.clips.map((c) => c.id));
  if (p.kind === 'title') {
    const preset = TITLE_PRESETS[p.index];
    const text = { ...preset.text, size: Math.round((preset.text.size ?? 96) * scale) };
    st.addText(text, { x: (preset.clip?.x ?? 0) * scale, y: (preset.clip?.y ?? 0) * scale });
  } else if (p.kind === 'emoji') st.addText({ content: p.char, size: Math.round(260 * scale), bold: false }, { name: p.char });
  else if (p.kind === 'shape') st.addShape(p.shape);
  // insertClip picks a track; honour an explicit drop target when one was given.
  const added = useStore.getState().project.clips.find((c) => !before.has(c.id));
  if (added && (at.trackId || at.start !== undefined)) {
    const s2 = useStore.getState();
    const track = s2.project.tracks.find((t) => t.id === at.trackId && t.kind === 'video' && !t.locked);
    const trackId = track?.id ?? added.trackId;
    const start = at.start ?? added.start;
    const free = s2.project.clips.every((c) => c.id === added.id || c.trackId !== trackId || start + added.duration <= c.start || start >= clipEnd(c));
    if (free) s2.updateClip(added.id, { trackId, start }, false);
  }
}
