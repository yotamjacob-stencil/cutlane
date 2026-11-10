import { MediaItem, MediaKind, PEAKS_PER_SEC, Project, uid } from './types';
import { useStore } from './store';

// ---------- IndexedDB (project autosave + imported files) ----------

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('cutlane', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('media');
      req.result.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx<T>(store: 'media' | 'kv', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

type StoredMedia = Omit<MediaItem, 'url'> & { blob: Blob };

const saveMedia = (m: MediaItem, blob: Blob) => {
  const { url: _url, ...meta } = m;
  return tx('media', 'readwrite', (s) => s.put({ ...meta, blob } satisfies StoredMedia, m.id)).catch(() => {
    useStore.getState().toast(`Couldn't save "${m.name}" for next time (browser storage is full).`);
  });
};

export const deleteStoredMedia = (id: string) => tx('media', 'readwrite', (s) => s.delete(id)).catch(() => {});

export async function clearStorage() {
  await tx('media', 'readwrite', (s) => s.clear()).catch(() => {});
  await tx('kv', 'readwrite', (s) => s.clear()).catch(() => {});
}

export async function loadSaved() {
  try {
    const items = (await tx('media', 'readonly', (s) => s.getAll())) as StoredMedia[];
    const project = (await tx('kv', 'readonly', (s) => s.get('project'))) as Project | undefined;
    const media: Record<string, MediaItem> = {};
    for (const { blob, ...meta } of items) media[meta.id] = { ...meta, url: URL.createObjectURL(blob) };
    if (project?.tracks?.length) {
      project.clips = project.clips.filter((c) => !c.mediaId || media[c.mediaId]);
      useStore.setState({ project, media });
    } else useStore.setState({ media });
  } catch {
    /* storage unavailable: start fresh */
  }
  useStore.setState({ loaded: true });
  let timer = 0;
  let last = useStore.getState().project;
  useStore.subscribe((s) => {
    if (s.project === last) return;
    last = s.project;
    clearTimeout(timer);
    timer = window.setTimeout(() => tx('kv', 'readwrite', (st) => st.put(last, 'project')).catch(() => {}), 400);
  });
}

// ---------- Import ----------

const once = (el: EventTarget, ok: string, ms = 15000) =>
  new Promise<void>((resolve, reject) => {
    const done = (fn: () => void) => () => {
      clearTimeout(timer);
      el.removeEventListener(ok, onOk);
      el.removeEventListener('error', onErr);
      fn();
    };
    const onOk = done(resolve);
    const onErr = done(() => reject(new Error('load failed')));
    const timer = setTimeout(onErr, ms);
    el.addEventListener(ok, onOk);
    el.addEventListener('error', onErr);
  });

function thumbOf(src: CanvasImageSource, w: number, h: number): string {
  const c = document.createElement('canvas');
  c.width = 240;
  c.height = Math.max(1, Math.round((240 * h) / Math.max(1, w)));
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}

function kindOf(file: File): MediaKind | null {
  const t = file.type;
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('image/')) return 'image';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mov', 'webm', 'mkv', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) return 'audio';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return 'image';
  return null;
}

async function mediaDuration(el: HTMLMediaElement): Promise<number> {
  if (isFinite(el.duration)) return el.duration;
  // Recordings without a duration header report Infinity until seeked to the end.
  el.currentTime = 1e7;
  await once(el, 'seeked').catch(() => {});
  const d = isFinite(el.duration) ? el.duration : el.currentTime;
  el.currentTime = 0;
  return d;
}

async function probe(file: File, kind: MediaKind, url: string): Promise<Pick<MediaItem, 'duration' | 'width' | 'height' | 'thumb'>> {
  if (kind === 'image') {
    const img = new Image();
    img.src = url;
    await once(img, 'load');
    return { duration: 0, width: img.naturalWidth, height: img.naturalHeight, thumb: thumbOf(img, img.naturalWidth, img.naturalHeight) };
  }
  if (kind === 'audio') {
    const a = new Audio();
    a.preload = 'metadata';
    a.src = url;
    await once(a, 'loadedmetadata');
    return { duration: await mediaDuration(a), width: 0, height: 0, thumb: '' };
  }
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  v.src = url;
  await once(v, 'loadedmetadata');
  const duration = await mediaDuration(v);
  v.currentTime = Math.min(1, duration / 4);
  await once(v, 'seeked').catch(() => {});
  if (v.readyState < 2) await once(v, 'loadeddata').catch(() => {});
  const out = { duration, width: v.videoWidth, height: v.videoHeight, thumb: thumbOf(v, v.videoWidth, v.videoHeight) };
  v.removeAttribute('src');
  v.load();
  return out;
}

let decodeCtx: AudioContext | null = null;
export async function decodeAudio(url: string): Promise<AudioBuffer> {
  decodeCtx ??= new AudioContext();
  const buf = await (await fetch(url)).arrayBuffer();
  return decodeCtx.decodeAudioData(buf);
}

async function analyseAudio(m: MediaItem, blob: Blob) {
  if (m.size > 600 * 1024 * 1024) return;
  try {
    const audio = await decodeAudio(m.url);
    const step = Math.floor(audio.sampleRate / PEAKS_PER_SEC);
    const data = audio.getChannelData(0);
    const peaks: number[] = [];
    for (let i = 0; i < data.length; i += step) {
      let max = 0;
      for (let j = i; j < i + step && j < data.length; j += 8) max = Math.max(max, Math.abs(data[j]));
      peaks.push(Math.round(max * 100) / 100);
    }
    useStore.getState().patchMedia(m.id, { peaks, hasAudio: true });
  } catch {
    useStore.getState().patchMedia(m.id, { hasAudio: m.kind === 'audio' });
  }
  const latest = useStore.getState().media[m.id];
  if (latest) saveMedia(latest, blob);
}

export async function importFiles(files: Iterable<File>): Promise<string[]> {
  const ids: string[] = [];
  const st = useStore.getState();
  for (const file of files) {
    const kind = kindOf(file);
    if (!kind) {
      st.toast(`"${file.name}" isn't a video, audio or image file.`);
      continue;
    }
    const url = URL.createObjectURL(file);
    try {
      const info = await probe(file, kind, url);
      const m: MediaItem = { id: uid(), name: file.name, kind, url, size: file.size, hasAudio: kind === 'audio', ...info };
      st.addMedia(m);
      ids.push(m.id);
      saveMedia(m, file);
      if (kind !== 'image') analyseAudio(m, file);
    } catch {
      URL.revokeObjectURL(url);
      st.toast(`This browser can't play "${file.name}". Try MP4 (H.264), WebM, MP3 or WAV.`);
    }
  }
  return ids;
}
