import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { player } from '../engine/player';
import { clipBox, hitTest } from '../engine/render';
import { clipEnd, formatTime, projectDuration } from '../types';
import { IconButton } from './icons';
import { saveFile } from '../save';

function TimeReadout() {
  const time = useStore((s) => s.time);
  const fps = useStore((s) => s.project.fps);
  const dur = useStore((s) => projectDuration(s.project));
  return (
    <div className="timecode">
      <b>{formatTime(time, fps)}</b> / {formatTime(dur, fps)}
    </div>
  );
}

/** Move / scale / rotate box drawn over the selected clip. */
function SelectionBox({ k }: { k: number }) {
  const project = useStore((s) => s.project);
  const media = useStore((s) => s.media);
  const id = useStore((s) => s.selection[0]);
  const time = useStore((s) => s.time);
  const clip = project.clips.find((c) => c.id === id);
  if (!clip || clip.type === 'audio' || time < clip.start || time >= clipEnd(clip)) return null;
  const box = clipBox(clip, project, media);
  const w = box.w * clip.scale * k;
  const h = box.h * clip.scale * k;
  const cx = (project.width / 2 + clip.x) * k;
  const cy = (project.height / 2 + clip.y) * k;

  const drag = (mode: 'scale' | 'rotate') => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const stage = (e.currentTarget as HTMLElement).closest('.stage')!.getBoundingClientRect();
    const ox = stage.left + cx;
    const oy = stage.top + cy;
    const d0 = Math.hypot(e.clientX - ox, e.clientY - oy) || 1;
    const a0 = Math.atan2(e.clientY - oy, e.clientX - ox);
    const st = useStore.getState();
    st.checkpoint();
    const move = (ev: PointerEvent) => {
      if (mode === 'scale') {
        const s = Math.max(0.02, (clip.scale * Math.hypot(ev.clientX - ox, ev.clientY - oy)) / d0);
        st.updateClip(clip.id, { scale: Math.round(s * 1000) / 1000 }, false);
      } else {
        let r = clip.rotation + ((Math.atan2(ev.clientY - oy, ev.clientX - ox) - a0) * 180) / Math.PI;
        r = ((((r + 180) % 360) + 360) % 360) - 180;
        if (Math.abs(r % 90) < 3 || Math.abs(r % 90) > 87) r = Math.round(r / 90) * 90;
        st.updateClip(clip.id, { rotation: Math.round(r * 10) / 10 }, false);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="sel-box" style={{ left: cx, top: cy, width: w, height: h, transform: `translate(-50%, -50%) rotate(${clip.rotation}deg)` }}>
      {['nw', 'ne', 'sw', 'se'].map((c) => (
        <span key={c} className={`handle ${c}`} onPointerDown={drag('scale')} />
      ))}
      <span className="handle rot" onPointerDown={drag('rotate')} title="Rotate" />
    </div>
  );
}

const RATIOS: [string, number, number][] = [
  ['16:9 Widescreen', 1920, 1080],
  ['9:16 Vertical', 1080, 1920],
  ['1:1 Square', 1080, 1080],
  ['4:5 Portrait', 1080, 1350],
  ['4:3 Classic', 1440, 1080],
  ['21:9 Cinema', 2560, 1080],
];

export function setProjectSize(w: number, h: number) {
  const st = useStore.getState();
  const f = h / st.project.height;
  st.mutate((p) => {
    // Keep layouts in place when the frame changes size.
    for (const c of p.clips) {
      c.x *= w / p.width;
      c.y *= f;
      if (c.text) c.text.size = Math.round(c.text.size * f);
      if (c.shape) (c.shape.w *= f), (c.shape.h *= f);
    }
    p.width = w;
    p.height = h;
  });
}

export { RATIOS };

export function Preview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 360 });
  const pw = useStore((s) => s.project.width);
  const ph = useStore((s) => s.project.height);
  const fps = useStore((s) => s.project.fps);
  const playing = useStore((s) => s.playing);
  const empty = useStore((s) => s.project.clips.length === 0);

  useEffect(() => {
    player.attach(canvas.current);
    return () => player.attach(null);
  }, []);

  useLayoutEffect(() => {
    const el = wrap.current!;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const k = Math.min((r.width - 24) / pw, (r.height - 24) / ph);
      setSize({ w: Math.max(40, Math.floor(pw * k)), h: Math.max(40, Math.floor(ph * k)) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pw, ph]);

  const k = size.w / pw;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const st = useStore.getState();
    const px = (e.clientX - rect.left) / k;
    const py = (e.clientY - rect.top) / k;
    const id = hitTest(st.project, st.media, st.time, px, py);
    st.select(id ? [id] : []);
    if (!id) return;
    const clip = st.project.clips.find((c) => c.id === id)!;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - e.clientX) / k;
      const dy = (ev.clientY - e.clientY) / k;
      if (!moved && Math.hypot(dx, dy) * k < 3) return;
      if (!moved) st.checkpoint();
      moved = true;
      let x = clip.x + dx;
      let y = clip.y + dy;
      // Snap to the centre lines.
      if (Math.abs(x) < 8 / k) x = 0;
      if (Math.abs(y) < 8 / k) y = 0;
      st.updateClip(id, { x: Math.round(x), y: Math.round(y) }, false);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const step = (n: number) => {
    player.pause();
    player.seek(Math.round(useStore.getState().time * fps + n) / fps);
  };

  const snapshot = async () => {
    const blob = await player.snapshot();
    if (!blob) return;
    saveFile(blob, 'snapshot.png');
  };

  return (
    <section className="preview panel" ref={shell}>
      <div className="stage-wrap" ref={wrap}>
        <div className="stage" style={{ width: size.w, height: size.h }} onPointerDown={onPointerDown}>
          <canvas ref={canvas} style={{ width: size.w, height: size.h }} />
          <SelectionBox k={k} />
          {empty && <div className="stage-empty">Add media, a title or a shape to the timeline to start</div>}
        </div>
      </div>
      <div className="transport">
        <TimeReadout />
        <div className="transport-buttons">
          <IconButton icon="start" title="Go to start (Home)" onClick={() => player.seek(0)} />
          <IconButton icon="prev" title="Previous frame (←)" onClick={() => step(-1)} />
          <button className="play-btn" title="Play / pause (Space)" aria-label="Play or pause" onClick={() => player.toggle()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d={playing ? 'M6.500 4.500h4v15h-4zM13.500 4.500h4v15h-4z' : 'M7 4.500v15l12.500-7.500z'} />
            </svg>
          </button>
          <IconButton icon="next" title="Next frame (→)" onClick={() => step(1)} />
          <IconButton icon="end" title="Go to end (End)" onClick={() => player.seek(projectDuration(useStore.getState().project))} />
        </div>
        <div className="transport-right">
          <select
            title="Frame shape"
            aria-label="Frame shape"
            value={`${pw}x${ph}`}
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number);
              setProjectSize(w, h);
            }}
          >
            {RATIOS.map(([label, w, h]) => (
              <option key={label} value={`${w}x${h}`}>
                {label}
              </option>
            ))}
          </select>
          <IconButton icon="camera" title="Save this frame as a PNG" onClick={snapshot} />
          <IconButton icon="full" title="Full screen" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : shell.current?.requestFullscreen())} />
        </div>
      </div>
    </section>
  );
}
