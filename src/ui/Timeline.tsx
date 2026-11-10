import { memo, useEffect, useRef } from 'react';
import { findFreeStart, useStore } from '../store';
import { player } from '../engine/player';
import { Clip, MediaItem, PEAKS_PER_SEC, Track, clipEnd, projectDuration } from '../types';
import { DRAG_TYPE, DropPayload, applyPayload } from '../presets';
import { TRANSITIONS } from '../engine/render';
import { IconButton } from './icons';

const HEAD_W = 136;
const MIN_PPS = 4;
const MAX_PPS = 400;
const MIN_LEN = 0.1;
const trackH = (t: Track) => (t.kind === 'video' ? 62 : 46);
const st = () => useStore.getState();

function snapTo(v: number, points: number[], tol: number) {
  let best = v;
  let bd = tol;
  for (const p of points) {
    const d = Math.abs(p - v);
    if (d < bd) (best = p), (bd = d);
  }
  return best;
}

const snapPoints = (ignore: string[]) => {
  const s = st();
  return [0, s.time, ...s.project.clips.filter((c) => !ignore.includes(c.id)).flatMap((c) => [c.start, clipEnd(c)])];
};

const Wave = memo(function Wave({ peaks, clip, width }: { peaks: number[]; clip: Clip; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cw = Math.max(1, Math.min(3000, Math.round(width)));
  useEffect(() => {
    const c = ref.current!;
    c.width = cw;
    c.height = 40;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, cw, 40);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    const span = clip.duration * clip.speed;
    for (let x = 0; x < cw; x++) {
      const p = peaks[Math.floor((clip.offset + (x / cw) * span) * PEAKS_PER_SEC)] ?? 0;
      const h = Math.max(1, p * 38);
      g.fillRect(x, 20 - h / 2, 1, h);
    }
  }, [peaks, cw, clip.offset, clip.duration, clip.speed]);
  return <canvas ref={ref} className="wave" />;
});

const ClipView = memo(function ClipView(props: { clip: Clip; pps: number; selected: boolean; media?: MediaItem; locked: boolean }) {
  const { clip, pps, selected, media, locked } = props;
  const width = clip.duration * pps;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || locked) return;
    e.stopPropagation();
    const side = (e.target as HTMLElement).dataset.trim as 'l' | 'r' | undefined;
    const s = st();
    const wasSelected = s.selection.includes(clip.id);
    if (e.shiftKey) s.select([clip.id], true);
    else if (!wasSelected) s.select([clip.id]);
    const sel = e.shiftKey ? [clip.id] : wasSelected ? s.selection : [clip.id];
    const origs = new Map(s.project.clips.filter((c) => sel.includes(c.id)).map((c) => [c.id, c]));
    const tracks = s.project.tracks;
    const kind = tracks.find((t) => t.id === clip.trackId)!.kind;
    const siblings = s.project.clips.filter((c) => c.trackId === clip.trackId && c.id !== clip.id);
    const srcDur = media && clip.type !== 'image' ? media.duration : Infinity;
    const tol = 8 / pps;
    let moved = false;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - e.clientX;
      if (!moved && Math.abs(dx) < 3 && Math.abs(ev.clientY - e.clientY) < 3) return;
      if (!moved) s.checkpoint();
      moved = true;
      const dt = dx / pps;
      const snapping = st().snapping && !ev.altKey;

      if (side === 'l') {
        const end = clipEnd(clip);
        const lower = Math.max(0, clip.start - clip.offset / clip.speed, ...siblings.filter((c) => clipEnd(c) <= clip.start + 1e-4).map(clipEnd));
        let start = clip.start + dt;
        if (snapping) start = snapTo(start, snapPoints([clip.id]), tol);
        start = Math.min(Math.max(start, lower), end - MIN_LEN);
        const offset = srcDur === Infinity ? 0 : Math.max(0, clip.offset + (start - clip.start) * clip.speed);
        s.updateClip(clip.id, { start, duration: end - start, offset }, false);
      } else if (side === 'r') {
        const upper = Math.min(clip.start + (srcDur - clip.offset) / clip.speed, ...siblings.filter((c) => c.start >= clipEnd(clip) - 1e-4).map((c) => c.start));
        let end = clipEnd(clip) + dt;
        if (snapping) end = snapTo(end, snapPoints([clip.id]), tol);
        end = Math.max(Math.min(end, upper), clip.start + MIN_LEN);
        s.updateClip(clip.id, { duration: end - clip.start }, false);
      } else {
        let desired = clip.start + dt;
        if (snapping) {
          const pts = snapPoints(sel);
          const a = snapTo(desired, pts, tol);
          const b = snapTo(desired + clip.duration, pts, tol) - clip.duration;
          desired = a !== desired ? a : b;
        }
        let trackId = clip.trackId;
        if (sel.length === 1) {
          const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-track]');
          const target = tracks.find((t) => t.id === el?.dataset.track);
          if (target && target.kind === kind && !target.locked) trackId = target.id;
        }
        s.mutate((p) => {
          const c = p.clips.find((x) => x.id === clip.id)!;
          c.trackId = trackId;
          c.start = findFreeStart(p.clips, trackId, desired, c.duration, sel);
          const delta = c.start - clip.start;
          for (const o of p.clips) {
            if (o.id === clip.id || !sel.includes(o.id)) continue;
            o.start = findFreeStart(p.clips, o.trackId, Math.max(0, origs.get(o.id)!.start + delta), o.duration, sel);
          }
        }, false);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved && !e.shiftKey && wasSelected) st().select([clip.id]);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (!raw) return;
    const payload = JSON.parse(raw) as DropPayload;
    if (payload.kind !== 'transition' && payload.kind !== 'filter') return;
    e.preventDefault();
    e.stopPropagation();
    applyPayload(payload, { clipId: clip.id });
  };

  const strip = (clip.type === 'video' || clip.type === 'image') && media?.thumb;
  return (
    <div
      className={`clip ${clip.type}${selected ? ' selected' : ''}${clip.muted && clip.type !== 'audio' ? '' : ''}`}
      data-clip={clip.id}
      style={{ left: clip.start * pps, width, backgroundImage: strip ? `url(${media!.thumb})` : undefined }}
      onPointerDown={onPointerDown}
      onDrop={onDrop}
      title={clip.name}
    >
      {clip.type !== 'image' && media?.peaks && !(clip.type === 'video' && clip.muted) && <Wave peaks={media.peaks} clip={clip} width={width} />}
      {clip.transIn && <span className="clip-trans" style={{ width: Math.min(width, clip.transIn.duration * pps) }} title={`${TRANSITIONS[clip.transIn.type]} transition`} />}
      <span className="clip-name">
        {clip.type === 'text' ? clip.text!.content.split('\n')[0] : clip.name}
        {clip.speed !== 1 && <em> {clip.speed}×</em>}
      </span>
      {!locked && <i className="trim l" data-trim="l" />}
      {!locked && <i className="trim r" data-trim="r" />}
    </div>
  );
});

function Playhead({ scroll }: { scroll: React.RefObject<HTMLDivElement | null> }) {
  const time = useStore((s) => s.time);
  const pps = useStore((s) => s.pxPerSec);
  const playing = useStore((s) => s.playing);
  const x = HEAD_W + time * pps;
  useEffect(() => {
    const el = scroll.current;
    if (!el || !playing) return;
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft + HEAD_W) el.scrollLeft = x - HEAD_W - 40;
  }, [x, playing, scroll]);
  return <div className="playhead" style={{ transform: `translateX(${x}px)` }} />;
}

function Ruler({ total, pps }: { total: number; pps: number }) {
  const step = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((s) => s * pps >= 70) ?? 600;
  const labels = [];
  for (let i = 0; i * step <= total; i++) {
    const t = i * step;
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    labels.push(
      <span key={i} style={{ left: t * pps }}>
        {m}:{step < 1 ? s.toFixed(2).padStart(5, '0') : String(Math.round(s)).padStart(2, '0')}
      </span>,
    );
  }
  const minor = (step / 5) * pps;
  return (
    <div className="ruler-ticks" style={{ backgroundSize: `${minor}px 6px, ${step * pps}px 12px` }}>
      {labels}
    </div>
  );
}

function TrackHead({ track }: { track: Track }) {
  const toggle = (key: 'muted' | 'hidden' | 'locked') => st().mutate((p) => void (p.tracks.find((t) => t.id === track.id)![key] = !track[key]));
  return (
    <div className="track-head" style={{ height: trackH(track) }}>
      <span className="track-name">{track.name}</span>
      <div className="track-btns">
        {track.kind === 'video' && <IconButton size={14} icon={track.hidden ? 'eyeOff' : 'eye'} title={track.hidden ? 'Show track' : 'Hide track'} active={track.hidden} onClick={() => toggle('hidden')} />}
        <IconButton size={14} icon={track.muted ? 'mute' : 'sound'} title={track.muted ? 'Unmute track' : 'Mute track'} active={track.muted} onClick={() => toggle('muted')} />
        <IconButton size={14} icon={track.locked ? 'lock' : 'unlock'} title={track.locked ? 'Unlock track' : 'Lock track'} active={track.locked} onClick={() => toggle('locked')} />
        <IconButton size={12} icon="close" title="Delete track" onClick={() => st().removeTrack(track.id)} />
      </div>
    </div>
  );
}

export function Timeline() {
  const project = useStore((s) => s.project);
  const media = useStore((s) => s.media);
  const selection = useStore((s) => s.selection);
  const pps = useStore((s) => s.pxPerSec);
  const snapping = useStore((s) => s.snapping);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const scroll = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);

  const duration = projectDuration(project);
  const total = Math.max(duration + 20, 60);
  const hasSel = selection.length > 0;

  const timeAt = (clientX: number) => Math.max(0, (clientX - content.current!.getBoundingClientRect().left - HEAD_W) / pps);

  const setZoom = (next: number, anchorX?: number) => {
    const el = scroll.current!;
    next = Math.min(MAX_PPS, Math.max(MIN_PPS, next));
    const ax = anchorX ?? HEAD_W + (el.clientWidth - HEAD_W) / 2;
    const t = (el.scrollLeft + ax - HEAD_W) / st().pxPerSec;
    useStore.setState({ pxPerSec: next });
    requestAnimationFrame(() => (el.scrollLeft = t * next - (ax - HEAD_W)));
  };

  useEffect(() => {
    const el = scroll.current!;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(st().pxPerSec * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - el.getBoundingClientRect().left);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const scrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    player.seek(timeAt(e.clientX));
  };
  const scrubMove = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) player.seek(timeAt(e.clientX));
  };

  const dragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };
  const drop = (trackId?: string) => (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    let start = timeAt(e.clientX);
    if (snapping) start = snapTo(start, snapPoints([]), 10 / pps);
    applyPayload(JSON.parse(raw) as DropPayload, { trackId, start });
  };

  return (
    <section className="timeline panel">
      <div className="tl-toolbar">
        <IconButton icon="undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => st().undo()} />
        <IconButton icon="redo" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={() => st().redo()} />
        <span className="sep" />
        <IconButton icon="split" title="Split at playhead (S)" onClick={() => st().splitAtPlayhead()} />
        <IconButton icon="trash" title="Delete (Del)" disabled={!hasSel} onClick={() => st().deleteSelected()} />
        <IconButton icon="ripple" title="Delete and close the gap (Shift+Del)" disabled={!hasSel} onClick={() => st().deleteSelected(true)} />
        <IconButton icon="copy" title="Duplicate (Ctrl+D)" disabled={!hasSel} onClick={() => st().duplicateSelected()} />
        <IconButton icon="detach" title="Detach audio from video" disabled={!hasSel} onClick={() => st().detachAudio()} />
        <span className="sep" />
        <IconButton icon="magnet" title="Snapping" active={snapping} onClick={() => useStore.setState({ snapping: !snapping })} />
        <span className="grow" />
        <button className="btn small" onClick={() => st().addTrack('video')}>
          + Video track
        </button>
        <button className="btn small" onClick={() => st().addTrack('audio')}>
          + Audio track
        </button>
        <span className="sep" />
        <IconButton icon="minus" title="Zoom out" onClick={() => setZoom(pps / 1.4)} />
        <input className="zoom" type="range" min={Math.log(MIN_PPS)} max={Math.log(MAX_PPS)} step={0.01} value={Math.log(pps)} aria-label="Timeline zoom" onChange={(e) => setZoom(Math.exp(Number(e.target.value)))} />
        <IconButton icon="plus" title="Zoom in" onClick={() => setZoom(pps * 1.4)} />
        <IconButton
          icon="fit"
          title="Fit the whole project"
          onClick={() => {
            useStore.setState({ pxPerSec: Math.min(MAX_PPS, Math.max(MIN_PPS, (scroll.current!.clientWidth - HEAD_W - 60) / Math.max(duration, 1))) });
            scroll.current!.scrollLeft = 0;
          }}
        />
      </div>

      <div className="tl-scroll" ref={scroll} onDragOver={dragOver} onDrop={drop()}>
        <div className="tl-content" ref={content} style={{ width: HEAD_W + total * pps }}>
          <div className="tl-row ruler">
            <div className="track-head corner" />
            <div className="ruler-lane" onPointerDown={scrub} onPointerMove={scrubMove}>
              <Ruler total={total} pps={pps} />
            </div>
          </div>
          {project.tracks.map((track) => (
            <div className={`tl-row ${track.kind}${track.locked ? ' locked' : ''}${track.hidden ? ' hidden' : ''}`} key={track.id}>
              <TrackHead track={track} />
              <div
                className="lane"
                data-track={track.id}
                style={{ height: trackH(track) }}
                onDrop={drop(track.id)}
                onPointerDown={(e) => {
                  if (e.target !== e.currentTarget || e.button !== 0) return;
                  st().select([]);
                  player.seek(timeAt(e.clientX));
                }}
              >
                {project.clips
                  .filter((c) => c.trackId === track.id)
                  .map((c) => (
                    <ClipView key={c.id} clip={c} pps={pps} selected={selection.includes(c.id)} media={media[c.mediaId ?? '']} locked={track.locked} />
                  ))}
              </div>
            </div>
          ))}
          <Playhead scroll={scroll} />
        </div>
      </div>
    </section>
  );
}
