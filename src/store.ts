import { create } from 'zustand';
import { produce } from 'immer';
import {
  Clip,
  ClipType,
  MediaItem,
  Project,
  ShapeKind,
  TextProps,
  Track,
  TrackKind,
  clipEnd,
  projectDuration,
  uid,
} from './types';

const EPS = 1e-4;

export const defaultColor = () => ({ preset: 'none', brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0 });

export const defaultText = (): TextProps => ({
  content: 'Your title',
  font: 'system-ui, sans-serif',
  size: 96,
  color: '#ffffff',
  bold: true,
  italic: false,
  align: 'center',
  stroke: '#000000',
  strokeWidth: 0,
  shadow: '#000000',
  shadowBlur: 0,
  bg: '',
  animIn: 'none',
  animOut: 'none',
});

export function makeClip(type: ClipType, patch: Partial<Clip>): Clip {
  return {
    id: uid(),
    trackId: '',
    type,
    name: type,
    start: 0,
    duration: 4,
    offset: 0,
    speed: 1,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    flipH: false,
    flipV: false,
    blend: 'source-over',
    fit: 'contain',
    crop: { l: 0, t: 0, r: 0, b: 0 },
    color: defaultColor(),
    motion: 'none',
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    ...patch,
  };
}

const makeTrack = (kind: TrackKind, n: number): Track => ({
  id: uid(),
  kind,
  name: `${kind === 'video' ? 'Video' : 'Audio'} ${n}`,
  muted: false,
  hidden: false,
  locked: false,
});

export function newProject(): Project {
  return {
    name: 'Untitled project',
    width: 1920,
    height: 1080,
    fps: 30,
    tracks: [makeTrack('video', 2), makeTrack('video', 1), makeTrack('audio', 1)],
    clips: [],
  };
}

/** Closest start to `desired` where a clip of `duration` fits on the track without overlap. */
export function findFreeStart(clips: Clip[], trackId: string, desired: number, duration: number, ignore: string[] = []): number {
  const others = clips.filter((c) => c.trackId === trackId && !ignore.includes(c.id));
  const fits = (s: number) => s >= -EPS && others.every((o) => s + duration <= o.start + EPS || s >= clipEnd(o) - EPS);
  desired = Math.max(0, desired);
  if (fits(desired)) return desired;
  const candidates = [0, ...others.map(clipEnd), ...others.map((o) => o.start - duration)].filter(fits);
  candidates.sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired));
  return Math.max(0, candidates[0] ?? Math.max(0, ...others.map(clipEnd)));
}

const isFree = (clips: Clip[], trackId: string, start: number, duration: number) =>
  clips.every((c) => c.trackId !== trackId || start + duration <= c.start + EPS || start >= clipEnd(c) - EPS);

export interface Toast {
  id: string;
  text: string;
}

interface State {
  project: Project;
  media: Record<string, MediaItem>;
  selection: string[];
  time: number;
  playing: boolean;
  pxPerSec: number;
  snapping: boolean;
  past: Project[];
  future: Project[];
  clipboard: Clip[];
  toasts: Toast[];
  exportOpen: boolean;
  loaded: boolean;

  checkpoint(): void;
  mutate(fn: (p: Project) => void, record?: boolean): void;
  undo(): void;
  redo(): void;
  setTime(t: number): void;
  select(ids: string[], additive?: boolean): void;
  toast(text: string): void;

  addMedia(m: MediaItem): void;
  patchMedia(id: string, patch: Partial<MediaItem>): void;
  removeMedia(id: string): void;

  addTrack(kind: TrackKind): string;
  removeTrack(id: string): void;

  insertClip(clip: Clip, opts?: { trackId?: string; start?: number; preferTop?: boolean }): string;
  addMediaClip(mediaId: string, opts?: { trackId?: string; start?: number }): void;
  addText(patch?: Partial<TextProps>, clipPatch?: Partial<Clip>): void;
  addShape(kind: ShapeKind): void;
  updateClip(id: string, patch: Partial<Clip>, record?: boolean): void;
  updateSelected(fn: (c: Clip) => void, record?: boolean): void;

  splitAtPlayhead(): void;
  deleteSelected(ripple?: boolean): void;
  duplicateSelected(): void;
  copy(): void;
  paste(): void;
  detachAudio(): void;
  setSpeed(id: string, speed: number): void;
  resetProject(): void;
}

export const useStore = create<State>((set, get) => ({
  project: newProject(),
  media: {},
  selection: [],
  time: 0,
  playing: false,
  pxPerSec: 60,
  snapping: true,
  past: [],
  future: [],
  clipboard: [],
  toasts: [],
  exportOpen: false,
  loaded: false,

  checkpoint() {
    set((s) => ({ past: [...s.past.slice(-99), s.project], future: [] }));
  },
  mutate(fn, record = true) {
    if (record) get().checkpoint();
    set((s) => ({ project: produce(s.project, fn) }));
  },
  undo() {
    const { past, project, future } = get();
    if (!past.length) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], selection: [] });
  },
  redo() {
    const { past, project, future } = get();
    if (!future.length) return;
    set({ project: future[0], future: future.slice(1), past: [...past, project], selection: [] });
  },
  setTime(t) {
    set({ time: Math.max(0, t) });
  },
  select(ids, additive = false) {
    set((s) => {
      if (!additive) return { selection: ids };
      const cur = new Set(s.selection);
      for (const id of ids) cur.has(id) ? cur.delete(id) : cur.add(id);
      return { selection: [...cur] };
    });
  },
  toast(text) {
    const id = uid();
    set((s) => ({ toasts: [...s.toasts, { id, text }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },

  addMedia(m) {
    set((s) => ({ media: { ...s.media, [m.id]: m } }));
  },
  patchMedia(id, patch) {
    set((s) => (s.media[id] ? { media: { ...s.media, [id]: { ...s.media[id], ...patch } } } : {}));
  },
  removeMedia(id) {
    const s = get();
    if (s.project.clips.some((c) => c.mediaId === id)) {
      s.mutate((p) => {
        p.clips = p.clips.filter((c) => c.mediaId !== id);
      });
    }
    set((st) => {
      const media = { ...st.media };
      delete media[id];
      return { media, selection: [] };
    });
  },

  addTrack(kind) {
    let id = '';
    get().mutate((p) => {
      const t = makeTrack(kind, p.tracks.filter((x) => x.kind === kind).length + 1);
      id = t.id;
      if (kind === 'video') p.tracks.unshift(t);
      else p.tracks.push(t);
    }, false);
    return id;
  },
  removeTrack(id) {
    const s = get();
    const track = s.project.tracks.find((t) => t.id === id);
    if (!track) return;
    if (s.project.tracks.filter((t) => t.kind === track.kind).length <= 1) {
      s.toast(`A project needs at least one ${track.kind} track.`);
      return;
    }
    s.mutate((p) => {
      p.tracks = p.tracks.filter((t) => t.id !== id);
      p.clips = p.clips.filter((c) => c.trackId !== id);
    });
    set({ selection: [] });
  },

  insertClip(clip, opts = {}) {
    const s = get();
    const kind: TrackKind = clip.type === 'audio' ? 'audio' : 'video';
    s.checkpoint();
    let start = Math.max(0, opts.start ?? s.time);
    let trackId = '';
    const p = s.project;
    const requested = p.tracks.find((t) => t.id === opts.trackId && t.kind === kind && !t.locked);
    if (requested) {
      trackId = requested.id;
      start = findFreeStart(p.clips, trackId, start, clip.duration);
    } else {
      const sameKind = p.tracks.filter((t) => t.kind === kind && !t.locked);
      // Video tracks are listed top to bottom; media fills from the bottom, overlays from the top.
      const order = kind === 'video' && !opts.preferTop ? [...sameKind].reverse() : sameKind;
      const free = order.find((t) => isFree(p.clips, t.id, start, clip.duration));
      if (free) trackId = free.id;
      else if (opts.preferTop || !order.length) trackId = s.addTrack(kind);
      else {
        trackId = order[0].id;
        start = Math.max(0, ...p.clips.filter((c) => c.trackId === trackId).map(clipEnd));
      }
    }
    const placed = { ...clip, trackId, start };
    s.mutate((pr) => {
      pr.clips.push(placed);
    }, false);
    set({ selection: [placed.id] });
    return placed.id;
  },

  addMediaClip(mediaId, opts) {
    const s = get();
    const m = s.media[mediaId];
    if (!m) return;
    const clip = makeClip(m.kind, {
      mediaId,
      name: m.name,
      duration: m.kind === 'image' ? 5 : Math.max(0.1, m.duration),
    });
    s.insertClip(clip, opts);
  },
  addText(patch = {}, clipPatch = {}) {
    const text = { ...defaultText(), ...patch };
    get().insertClip(makeClip('text', { name: text.content.split('\n')[0].slice(0, 24), text, ...clipPatch }), { preferTop: true });
  },
  addShape(kind) {
    const dims = kind === 'line' ? { w: 600, h: 12 } : kind === 'arrow' ? { w: 500, h: 200 } : { w: 360, h: 360 };
    get().insertClip(makeClip('shape', { name: kind, shape: { kind, fill: '#f5a524', ...dims } }), { preferTop: true });
  },
  updateClip(id, patch, record = true) {
    get().mutate((p) => {
      const c = p.clips.find((x) => x.id === id);
      if (c) Object.assign(c, patch);
    }, record);
  },
  updateSelected(fn, record = true) {
    const sel = get().selection;
    get().mutate((p) => {
      for (const c of p.clips) if (sel.includes(c.id)) fn(c);
    }, record);
  },

  splitAtPlayhead() {
    const s = get();
    const t = s.time;
    const locked = new Set(s.project.tracks.filter((x) => x.locked).map((x) => x.id));
    const under = s.project.clips.filter((c) => !locked.has(c.trackId) && t > c.start + 0.02 && t < clipEnd(c) - 0.02);
    const targets = under.some((c) => s.selection.includes(c.id)) ? under.filter((c) => s.selection.includes(c.id)) : under;
    if (!targets.length) {
      s.toast('Move the playhead over a clip to split it.');
      return;
    }
    const ids = targets.map((c) => c.id);
    s.mutate((p) => {
      for (const c of [...p.clips]) {
        if (!ids.includes(c.id)) continue;
        const left = t - c.start;
        const right: Clip = {
          ...JSON.parse(JSON.stringify(c)),
          id: uid(),
          start: t,
          duration: c.duration - left,
          offset: c.offset + left * c.speed,
          fadeIn: 0,
          transIn: undefined,
        };
        c.duration = left;
        c.fadeOut = 0;
        p.clips.push(right);
      }
    });
  },
  deleteSelected(ripple = false) {
    const s = get();
    if (!s.selection.length) return;
    const sel = s.selection;
    s.mutate((p) => {
      const removed = p.clips.filter((c) => sel.includes(c.id));
      p.clips = p.clips.filter((c) => !sel.includes(c.id));
      if (ripple) {
        for (const r of [...removed].sort((a, b) => b.start - a.start)) {
          for (const c of p.clips) if (c.trackId === r.trackId && c.start >= r.start) c.start = Math.max(0, c.start - r.duration);
        }
      }
    });
    set({ selection: [] });
  },
  duplicateSelected() {
    const s = get();
    const src = s.project.clips.filter((c) => s.selection.includes(c.id));
    if (!src.length) return;
    const ids: string[] = [];
    s.mutate((p) => {
      for (const c of src) {
        const copy: Clip = { ...JSON.parse(JSON.stringify(c)), id: uid() };
        copy.start = findFreeStart(p.clips, c.trackId, clipEnd(c), c.duration);
        p.clips.push(copy);
        ids.push(copy.id);
      }
    });
    set({ selection: ids });
  },
  copy() {
    const s = get();
    const clips = s.project.clips.filter((c) => s.selection.includes(c.id));
    if (clips.length) set({ clipboard: JSON.parse(JSON.stringify(clips)) });
  },
  paste() {
    const s = get();
    if (!s.clipboard.length) return;
    const base = Math.min(...s.clipboard.map((c) => c.start));
    const ids: string[] = [];
    s.mutate((p) => {
      for (const c of s.clipboard) {
        const kind: TrackKind = c.type === 'audio' ? 'audio' : 'video';
        const track = p.tracks.find((t) => t.id === c.trackId) ?? p.tracks.find((t) => t.kind === kind);
        if (!track) continue;
        const copy: Clip = { ...JSON.parse(JSON.stringify(c)), id: uid(), trackId: track.id };
        copy.start = findFreeStart(p.clips, track.id, s.time + (c.start - base), c.duration);
        p.clips.push(copy);
        ids.push(copy.id);
      }
    });
    set({ selection: ids });
  },
  detachAudio() {
    const s = get();
    const targets = s.project.clips.filter((c) => s.selection.includes(c.id) && c.type === 'video' && !c.muted && s.media[c.mediaId ?? '']?.hasAudio);
    if (!targets.length) {
      s.toast('Select a video clip that has sound.');
      return;
    }
    s.checkpoint();
    for (const v of targets) {
      const p = get().project;
      let track = p.tracks.find((t) => t.kind === 'audio' && !t.locked && isFree(p.clips, t.id, v.start, v.duration));
      const trackId = track ? track.id : get().addTrack('audio');
      get().mutate((pr) => {
        const src = pr.clips.find((c) => c.id === v.id)!;
        pr.clips.push(
          makeClip('audio', {
            trackId,
            mediaId: v.mediaId,
            name: v.name,
            start: v.start,
            duration: v.duration,
            offset: v.offset,
            speed: v.speed,
            volume: v.volume,
            fadeIn: v.fadeIn,
            fadeOut: v.fadeOut,
          }),
        );
        src.muted = true;
      }, false);
    }
  },
  setSpeed(id, speed) {
    get().mutate((p) => {
      const c = p.clips.find((x) => x.id === id);
      if (!c) return;
      const oldEnd = clipEnd(c);
      c.duration = Math.max(0.05, (c.duration * c.speed) / speed);
      c.speed = speed;
      const delta = clipEnd(c) - oldEnd;
      // Keep later clips on the track from being overlapped when the clip gets longer.
      if (delta > 0) for (const o of p.clips) if (o.trackId === c.trackId && o.id !== c.id && o.start >= oldEnd - EPS) o.start += delta;
    });
  },
  resetProject() {
    set({ project: newProject(), past: [], future: [], selection: [], time: 0, media: {} });
  },
}));

export const getDuration = () => projectDuration(useStore.getState().project);
