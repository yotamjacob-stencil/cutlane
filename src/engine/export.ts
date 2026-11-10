import * as Mp4 from 'mp4-muxer';
import * as WebM from 'webm-muxer';
import { useStore } from '../store';
import { decodeAudio } from '../media';
import { Clip, clipEnd, hasSound, projectDuration } from '../types';
import { Source, renderFrame, sourceTime, visibleAt } from './render';

export interface ExportOpts {
  height: number;
  fps: number;
  format: 'mp4' | 'webm';
  quality: 'low' | 'medium' | 'high';
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  note?: string;
}

const SAMPLE_RATE = 48000;
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export const exportSupported = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

async function pickVideo(format: 'mp4' | 'webm', cfg: Omit<VideoEncoderConfig, 'codec'>) {
  const list =
    format === 'mp4'
      ? [
          { codec: 'avc1.640033', mux: 'avc', label: 'H.264' },
          { codec: 'avc1.4d0033', mux: 'avc', label: 'H.264' },
          { codec: 'avc1.42003e', mux: 'avc', label: 'H.264' },
          { codec: 'vp09.00.40.08', mux: 'vp9', label: 'VP9' },
          { codec: 'av01.0.08M.08', mux: 'av1', label: 'AV1' },
        ]
      : [
          { codec: 'vp09.00.40.08', mux: 'V_VP9', label: 'VP9' },
          { codec: 'vp8', mux: 'V_VP8', label: 'VP8' },
        ];
  for (const c of list) {
    try {
      if ((await VideoEncoder.isConfigSupported({ ...cfg, codec: c.codec })).supported) return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function pickAudio(format: 'mp4' | 'webm') {
  if (typeof AudioEncoder === 'undefined') return null;
  const list = format === 'mp4' ? [{ codec: 'mp4a.40.2', mux: 'aac' }, { codec: 'opus', mux: 'opus' }] : [{ codec: 'opus', mux: 'A_OPUS' }];
  for (const c of list) {
    try {
      if ((await AudioEncoder.isConfigSupported({ codec: c.codec, sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 192000 })).supported) return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function mixAudio(duration: number): Promise<AudioBuffer | null> {
  const { project, media } = useStore.getState();
  const muted = new Set(project.tracks.filter((t) => t.muted).map((t) => t.id));
  const clips = project.clips.filter((c) => hasSound(c) && !c.muted && c.volume > 0 && !muted.has(c.trackId) && media[c.mediaId ?? '']?.hasAudio);
  if (!clips.length) return null;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  const buffers = new Map<string, AudioBuffer | null>();
  for (const c of clips) {
    const m = media[c.mediaId!];
    if (!buffers.has(m.id)) buffers.set(m.id, await decodeAudio(m.url).catch(() => null));
    const buffer = buffers.get(m.id);
    if (!buffer) continue;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = c.speed;
    const g = ctx.createGain();
    const end = clipEnd(c);
    const fi = Math.min(c.fadeIn, c.duration / 2);
    const fo = Math.min(c.fadeOut, c.duration / 2);
    g.gain.setValueAtTime(fi > 0 ? 0 : c.volume, c.start);
    if (fi > 0) g.gain.linearRampToValueAtTime(c.volume, c.start + fi);
    if (fo > 0) {
      g.gain.setValueAtTime(c.volume, end - fo);
      g.gain.linearRampToValueAtTime(0, end);
    }
    src.connect(g).connect(ctx.destination);
    src.start(c.start, c.offset, c.duration * c.speed);
  }
  return ctx.startRendering();
}

const waitFor = (el: EventTarget, ev: string, ms = 4000) =>
  new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      el.removeEventListener(ev, done);
      el.removeEventListener('error', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    el.addEventListener(ev, done);
    el.addEventListener('error', done);
  });

export async function exportVideo(opts: ExportOpts, onProgress: (p: number, stage: string) => void, signal: AbortSignal): Promise<ExportResult> {
  const { project, media } = useStore.getState();
  const duration = projectDuration(project);
  if (duration <= 0) throw new Error('Add something to the timeline first.');
  if (!exportSupported()) throw new Error('This browser cannot encode video. Use a current Chrome or Edge on desktop.');

  const height = even(opts.height);
  const width = even((opts.height * project.width) / project.height);
  const scale = width / project.width;
  const perPixel = { low: 0.05, medium: 0.1, high: 0.18 }[opts.quality];
  const bitrate = Math.round(width * height * opts.fps * perPixel);
  const vcfg = { width, height, bitrate, framerate: opts.fps };
  const vc = await pickVideo(opts.format, vcfg);
  if (!vc) throw new Error(`This browser has no ${opts.format.toUpperCase()} encoder at ${width}×${height}. Try the other format or a smaller size.`);

  onProgress(0, 'Mixing audio');
  const mixed = await mixAudio(duration);
  const ac = mixed ? await pickAudio(opts.format) : null;
  const notes: string[] = [];
  if (opts.format === 'mp4' && vc.mux !== 'avc') notes.push(`This browser has no H.264 encoder, so the MP4 uses ${vc.label}. Some players may not open it.`);
  if (opts.format === 'mp4' && ac?.mux === 'opus') notes.push('This browser has no AAC encoder, so the MP4 sound is Opus. Some players (QuickTime) may play it silent.');
  if (mixed && !ac) notes.push('No audio encoder is available here, so the file has no sound.');

  const isMp4 = opts.format === 'mp4';
  const target = isMp4 ? new Mp4.ArrayBufferTarget() : new WebM.ArrayBufferTarget();
  const audioCfg = ac ? { codec: ac.mux, numberOfChannels: 2, sampleRate: SAMPLE_RATE } : undefined;
  const muxer: { addVideoChunk: Function; addAudioChunk: Function; finalize(): void } = isMp4
    ? new Mp4.Muxer({
        target: target as Mp4.ArrayBufferTarget,
        video: { codec: vc.mux as 'avc', width, height, frameRate: opts.fps },
        audio: audioCfg as Mp4.MuxerOptions<Mp4.ArrayBufferTarget>['audio'],
        fastStart: 'in-memory',
      })
    : new WebM.Muxer({
        target: target as WebM.ArrayBufferTarget,
        video: { codec: vc.mux, width, height, frameRate: opts.fps },
        audio: audioCfg,
      });

  let failure: Error | null = null;
  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (failure = e),
  });
  venc.configure({ ...vcfg, codec: vc.codec, ...(vc.mux === 'avc' ? { avc: { format: 'avc' as const } } : {}) });

  // Frame sources: one seekable element per video clip, one image per still.
  const videos = new Map<string, HTMLVideoElement>();
  const images = new Map<string, HTMLImageElement>();
  const cleanup = () => {
    for (const v of videos.values()) {
      v.removeAttribute('src');
      v.load();
    }
    videos.clear();
    if (venc.state !== 'closed') venc.close();
  };

  try {
    for (const m of Object.values(media)) {
      if (m.kind !== 'image' || !project.clips.some((c) => c.mediaId === m.id)) continue;
      const img = new Image();
      img.src = m.url;
      await img.decode().catch(() => {});
      images.set(m.id, img);
    }

    const prepare = async (clip: Clip, t: number) => {
      const m = media[clip.mediaId ?? ''];
      if (clip.type !== 'video' || !m) return;
      let el = videos.get(clip.id);
      if (!el) {
        el = document.createElement('video');
        el.muted = true;
        el.preload = 'auto';
        el.src = m.url;
        videos.set(clip.id, el);
        await waitFor(el, 'loadeddata', 8000);
      }
      const want = Math.min(Math.max(0, sourceTime(clip, t)), Math.max(0, m.duration - 0.03));
      if (Math.abs(el.currentTime - want) > 0.0005 || el.readyState < 2) {
        const seeked = waitFor(el, 'seeked');
        el.currentTime = want;
        await seeked;
      }
    };
    const getSource = (clip: Clip): Source | null => (clip.type === 'image' ? images.get(clip.mediaId ?? '') ?? null : videos.get(clip.id) ?? null);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const total = Math.max(1, Math.round(duration * opts.fps));
    const frameUs = 1e6 / opts.fps;

    for (let i = 0; i < total; i++) {
      if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
      if (failure) throw failure;
      const t = i / opts.fps;
      const vis = visibleAt(project, t);
      for (const v of vis) await prepare(v.clip, t);
      for (const [id, el] of videos) {
        if (vis.some((v) => v.clip.id === id)) continue;
        const c = project.clips.find((x) => x.id === id);
        if (!c || t > clipEnd(c) + 3) {
          el.removeAttribute('src');
          el.load();
          videos.delete(id);
        }
      }
      renderFrame(ctx, project, media, t, getSource, scale);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
      venc.encode(frame, { keyFrame: i % (opts.fps * 2) === 0 });
      frame.close();
      while (venc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 4));
      if (i % 5 === 0) {
        onProgress((i / total) * 0.95, 'Rendering video');
        await new Promise((r) => setTimeout(r));
      }
    }
    await venc.flush();
    if (failure) throw failure;

    if (mixed && ac) {
      onProgress(0.96, 'Encoding audio');
      const aenc = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => (failure = e),
      });
      aenc.configure({ codec: ac.codec, sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 192000 });
      const left = mixed.getChannelData(0);
      const right = mixed.numberOfChannels > 1 ? mixed.getChannelData(1) : left;
      const CHUNK = 4800;
      for (let o = 0; o < mixed.length; o += CHUNK) {
        const n = Math.min(CHUNK, mixed.length - o);
        const data = new Float32Array(n * 2);
        data.set(left.subarray(o, o + n), 0);
        data.set(right.subarray(o, o + n), n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: SAMPLE_RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((o / SAMPLE_RATE) * 1e6), data });
        aenc.encode(ad);
        ad.close();
        if (aenc.encodeQueueSize > 20) await new Promise((r) => setTimeout(r, 4));
      }
      await aenc.flush();
      aenc.close();
      if (failure) throw failure;
    }

    muxer.finalize();
    onProgress(1, 'Done');
    const blob = new Blob([target.buffer], { type: isMp4 ? 'video/mp4' : 'video/webm' });
    const safe = project.name.replace(/[^\w\- ]+/g, '').trim() || 'video';
    return { blob, filename: `${safe}.${opts.format}`, note: notes.join(' ') || undefined };
  } finally {
    cleanup();
  }
}
