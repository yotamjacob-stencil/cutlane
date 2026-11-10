import { useStore } from '../store';
import { Clip, clipEnd, hasSound, projectDuration } from '../types';
import { Source, gainAt, renderFrame, sourceTime } from './render';

interface Slot {
  el: HTMLVideoElement | HTMLAudioElement;
  url: string;
  gain?: GainNode;
  node?: MediaElementAudioSourceNode;
}

/** Real-time preview: keeps one media element per nearby clip in step with the playhead and paints the canvas. */
class Player {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private slots = new Map<string, Slot>();
  private images = new Map<string, HTMLImageElement>();
  private audio: AudioContext | null = null;
  private dirty = true;
  private base = 0;
  private baseNow = 0;
  private started = false;

  attach(canvas: HTMLCanvasElement | null) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d') ?? null;
    this.dirty = true;
    if (!this.started) {
      this.started = true;
      useStore.subscribe(() => (this.dirty = true));
      const loop = () => {
        this.frame();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  play() {
    const st = useStore.getState();
    const dur = projectDuration(st.project);
    if (dur <= 0) return;
    if (st.time >= dur - 0.02) st.setTime(0);
    this.audio ??= new AudioContext();
    this.audio.resume();
    this.base = useStore.getState().time;
    this.baseNow = performance.now();
    useStore.setState({ playing: true });
  }
  pause() {
    useStore.setState({ playing: false });
  }
  toggle() {
    useStore.getState().playing ? this.pause() : this.play();
  }
  seek(t: number) {
    const dur = projectDuration(useStore.getState().project);
    t = Math.min(Math.max(0, t), Math.max(dur, 0));
    this.base = t;
    this.baseNow = performance.now();
    useStore.getState().setTime(t);
  }
  /** Stop every element (used while exporting so the preview stays quiet). */
  silence() {
    this.pause();
    for (const s of this.slots.values()) s.el.pause();
  }

  private image(mediaId: string, url: string) {
    let img = this.images.get(mediaId);
    if (!img) {
      img = new Image();
      img.onload = () => (this.dirty = true);
      img.src = url;
      this.images.set(mediaId, img);
    }
    return img;
  }

  private slot(clip: Clip, url: string): Slot {
    let s = this.slots.get(clip.id);
    if (s && s.url !== url) {
      this.drop(clip.id);
      s = undefined;
    }
    if (!s) {
      const el = clip.type === 'video' ? document.createElement('video') : new Audio();
      el.preload = 'auto';
      el.src = url;
      if (el instanceof HTMLVideoElement) el.playsInline = true;
      for (const ev of ['seeked', 'loadeddata', 'canplay']) el.addEventListener(ev, () => (this.dirty = true));
      s = { el, url };
      this.slots.set(clip.id, s);
    }
    if (!s.gain && this.audio) {
      try {
        s.node = this.audio.createMediaElementSource(s.el);
        s.gain = this.audio.createGain();
        s.node.connect(s.gain).connect(this.audio.destination);
      } catch {
        /* fall back to element volume */
      }
    }
    return s;
  }

  private drop(id: string) {
    const s = this.slots.get(id);
    if (!s) return;
    s.el.pause();
    s.node?.disconnect();
    s.gain?.disconnect();
    s.el.removeAttribute('src');
    s.el.load();
    this.slots.delete(id);
  }

  private frame() {
    const st = useStore.getState();
    const { project, media } = st;
    let t = st.time;
    if (st.playing) {
      const dur = projectDuration(project);
      t = this.base + (performance.now() - this.baseNow) / 1000;
      if (t >= dur) {
        t = dur;
        useStore.setState({ playing: false });
      }
      st.setTime(t);
    }
    const playing = useStore.getState().playing;

    const tracks = new Map(project.tracks.map((x) => [x.id, x]));
    const wanted = new Set<string>();
    for (const clip of project.clips) {
      const m = media[clip.mediaId ?? ''];
      if (!m) continue;
      if (clip.type === 'image') {
        this.image(m.id, m.url);
        continue;
      }
      if (!hasSound(clip)) continue;
      // A clip keeps running under the next clip's transition.
      const next = project.clips.find((c) => c.trackId === clip.trackId && c.transIn && Math.abs(c.start - clipEnd(clip)) < 0.05);
      const tail = next?.transIn?.duration ?? 0;
      if (t < clip.start - 1 || t > clipEnd(clip) + tail + 0.25) continue;
      wanted.add(clip.id);
      const s = this.slot(clip, m.url);
      const el = s.el;
      const inside = t >= clip.start && t < clipEnd(clip) + tail;
      const want = Math.min(Math.max(0, sourceTime(clip, Math.max(t, clip.start))), Math.max(0, m.duration - 0.03));
      const g = (tracks.get(clip.trackId)?.muted ? 0 : 1) * gainAt(clip, t);
      if (s.gain) s.gain.gain.value = g;
      else el.volume = Math.min(1, g);
      el.muted = g === 0;
      if (playing && inside) {
        el.playbackRate = clip.speed;
        if (el.paused) {
          if (Math.abs(el.currentTime - want) > 0.05) el.currentTime = want;
          el.play().catch(() => {});
        } else if (Math.abs(el.currentTime - want) > 0.3) el.currentTime = want;
      } else {
        if (!el.paused) el.pause();
        if (!el.seeking && Math.abs(el.currentTime - want) > 0.02) el.currentTime = want;
      }
    }
    for (const id of [...this.slots.keys()]) if (!wanted.has(id)) this.drop(id);

    if (!this.ctx || !this.canvas || !(this.dirty || playing)) return;
    this.dirty = false;
    const scale = Math.min(1, 1280 / project.width);
    const w = Math.round(project.width * scale);
    const h = Math.round(project.height * scale);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    renderFrame(this.ctx, project, media, t, (clip) => this.source(clip), scale);
  }

  private source(clip: Clip): Source | null {
    if (clip.type === 'image') {
      const img = this.images.get(clip.mediaId ?? '');
      return img?.complete && img.naturalWidth ? img : null;
    }
    const el = this.slots.get(clip.id)?.el;
    return el instanceof HTMLVideoElement && el.readyState >= 2 ? el : null;
  }

  /** Current frame at full project resolution, as a PNG. */
  async snapshot(): Promise<Blob | null> {
    const { project, media, time } = useStore.getState();
    const c = document.createElement('canvas');
    c.width = project.width;
    c.height = project.height;
    renderFrame(c.getContext('2d')!, project, media, time, (clip) => this.source(clip));
    return new Promise((r) => c.toBlob(r, 'image/png'));
  }
}

export const player = new Player();
