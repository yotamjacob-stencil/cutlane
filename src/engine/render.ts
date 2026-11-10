import { Clip, MediaItem, Project, TransitionType, clipEnd } from '../types';

export type Source = HTMLVideoElement | HTMLImageElement | ImageBitmap | HTMLCanvasElement;
export type GetSource = (clip: Clip) => Source | null;

export const FILTER_PRESETS: Record<string, { label: string; css: string }> = {
  none: { label: 'None', css: '' },
  mono: { label: 'Mono', css: 'grayscale(1) contrast(1.1)' },
  sepia: { label: 'Sepia', css: 'sepia(0.85)' },
  vivid: { label: 'Vivid', css: 'saturate(1.6) contrast(1.1)' },
  warm: { label: 'Warm', css: 'sepia(0.3) saturate(1.3) hue-rotate(-10deg)' },
  cool: { label: 'Cool', css: 'saturate(1.1) hue-rotate(15deg) brightness(1.03)' },
  faded: { label: 'Faded', css: 'contrast(0.8) brightness(1.1) saturate(0.8)' },
  noir: { label: 'Noir', css: 'grayscale(1) contrast(1.5) brightness(0.9)' },
  dream: { label: 'Dream', css: 'blur(2px) brightness(1.1) saturate(1.3)' },
  retro: { label: 'Retro', css: 'sepia(0.5) contrast(1.2) saturate(1.4) hue-rotate(-20deg)' },
  invert: { label: 'Invert', css: 'invert(1)' },
  punch: { label: 'Punch', css: 'contrast(1.4) saturate(1.3)' },
};

export const TRANSITIONS: Record<TransitionType, string> = {
  fade: 'Cross fade',
  dip: 'Dip to black',
  wipeRight: 'Wipe right',
  wipeLeft: 'Wipe left',
  wipeUp: 'Wipe up',
  wipeDown: 'Wipe down',
  slideLeft: 'Slide left',
  slideRight: 'Slide right',
  slideUp: 'Slide up',
  slideDown: 'Slide down',
  zoom: 'Zoom in',
  iris: 'Iris',
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

function srcSize(src: Source): [number, number] {
  if (src instanceof HTMLVideoElement) return [src.videoWidth, src.videoHeight];
  if (src instanceof HTMLImageElement) return [src.naturalWidth, src.naturalHeight];
  return [src.width, src.height];
}

export function filterCss(clip: Clip): string {
  const c = clip.color;
  const parts: string[] = [];
  const preset = FILTER_PRESETS[c.preset]?.css;
  if (preset) parts.push(preset);
  if (c.brightness !== 100) parts.push(`brightness(${c.brightness}%)`);
  if (c.contrast !== 100) parts.push(`contrast(${c.contrast}%)`);
  if (c.saturation !== 100) parts.push(`saturate(${c.saturation}%)`);
  if (c.hue) parts.push(`hue-rotate(${c.hue}deg)`);
  if (c.blur) parts.push(`blur(${c.blur}px)`);
  return parts.join(' ') || 'none';
}

let measureCtx: CanvasRenderingContext2D | null = null;
const fontOf = (clip: Clip) => {
  const t = clip.text!;
  return `${t.italic ? 'italic ' : ''}${t.bold ? '700' : '400'} ${t.size}px ${t.font}`;
};

function layoutText(clip: Clip) {
  const t = clip.text!;
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  measureCtx.font = fontOf(clip);
  const lines = t.content.split('\n');
  const widths = lines.map((l) => measureCtx!.measureText(l).width);
  const lineHeight = t.size * 1.2;
  const pad = t.bg ? t.size * 0.3 : 0;
  return { lines, widths, lineHeight, pad, w: Math.max(10, ...widths) + pad * 2, h: lines.length * lineHeight + pad * 2 };
}

/** Size of a clip on the canvas, in project pixels, before its own scale is applied. */
export function clipBox(clip: Clip, project: Project, media: Record<string, MediaItem>): { w: number; h: number } {
  if (clip.type === 'text') return layoutText(clip);
  if (clip.type === 'shape') return { w: clip.shape!.w, h: clip.shape!.h };
  const m = media[clip.mediaId ?? ''];
  if (!m || !m.width || !m.height) return { w: project.width, h: project.height };
  const cw = m.width * (1 - clip.crop.l - clip.crop.r);
  const ch = m.height * (1 - clip.crop.t - clip.crop.b);
  const s = clip.fit === 'cover' ? Math.max(project.width / cw, project.height / ch) : Math.min(project.width / cw, project.height / ch);
  return { w: cw * s, h: ch * s };
}

function applyTransition(ctx: CanvasRenderingContext2D, type: TransitionType, p: number, W: number, H: number): number {
  const e = ease(p);
  ctx.beginPath();
  switch (type) {
    case 'fade':
      return e;
    case 'dip':
      return clamp01(p * 2 - 1);
    case 'wipeRight':
      ctx.rect(0, 0, W * e, H);
      ctx.clip();
      return 1;
    case 'wipeLeft':
      ctx.rect(W * (1 - e), 0, W * e, H);
      ctx.clip();
      return 1;
    case 'wipeDown':
      ctx.rect(0, 0, W, H * e);
      ctx.clip();
      return 1;
    case 'wipeUp':
      ctx.rect(0, H * (1 - e), W, H * e);
      ctx.clip();
      return 1;
    case 'slideLeft':
      ctx.translate((1 - e) * W, 0);
      return 1;
    case 'slideRight':
      ctx.translate(-(1 - e) * W, 0);
      return 1;
    case 'slideUp':
      ctx.translate(0, (1 - e) * H);
      return 1;
    case 'slideDown':
      ctx.translate(0, -(1 - e) * H);
      return 1;
    case 'zoom': {
      const s = 0.4 + 0.6 * e;
      ctx.translate(W / 2, H / 2);
      ctx.scale(s, s);
      ctx.translate(-W / 2, -H / 2);
      return e;
    }
    case 'iris':
      ctx.arc(W / 2, H / 2, (e * Math.hypot(W, H)) / 2, 0, Math.PI * 2);
      ctx.clip();
      return 1;
  }
}

function shapePath(ctx: CanvasRenderingContext2D, kind: string, w: number, h: number) {
  const x = -w / 2;
  const y = -h / 2;
  ctx.beginPath();
  switch (kind) {
    case 'ellipse':
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.moveTo(0, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.42 : 1;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        ctx.lineTo((Math.cos(a) * r * w) / 2, (Math.sin(a) * r * h) / 2);
      }
      ctx.closePath();
      break;
    case 'arrow': {
      const head = Math.min(w * 0.4, h);
      ctx.moveTo(x, -h * 0.2);
      ctx.lineTo(x + w - head, -h * 0.2);
      ctx.lineTo(x + w - head, y);
      ctx.lineTo(x + w, 0);
      ctx.lineTo(x + w - head, y + h);
      ctx.lineTo(x + w - head, h * 0.2);
      ctx.lineTo(x, h * 0.2);
      ctx.closePath();
      break;
    }
    default:
      ctx.rect(x, y, w, h);
  }
}

function drawText(ctx: CanvasRenderingContext2D, clip: Clip, t: number, alpha: number) {
  const tx = clip.text!;
  const L = layoutText(clip);
  const lt = t - clip.start;
  const total = tx.content.length;
  const durIn = tx.animIn === 'typewriter' ? Math.min(clip.duration * 0.7, Math.max(0.5, total * 0.06)) : 0.5;
  const pin = tx.animIn === 'none' ? 1 : clamp01(lt / Math.min(durIn, clip.duration / 2));
  const pout = tx.animOut === 'none' ? 1 : clamp01((clip.duration - lt) / Math.min(0.5, clip.duration / 2));
  let chars = Infinity;
  const anim = (kind: string, p: number) => {
    const e = easeOut(p);
    if (kind === 'fade') alpha *= e;
    else if (kind === 'slideUp') (ctx.translate(0, (1 - e) * tx.size), (alpha *= e));
    else if (kind === 'slideDown') (ctx.translate(0, -(1 - e) * tx.size), (alpha *= e));
    else if (kind === 'pop') {
      const s = p >= 1 ? 1 : 0.3 + 0.7 * e + Math.sin(p * Math.PI) * 0.12;
      ctx.scale(s, s);
      alpha *= clamp01(p * 3);
    } else if (kind === 'typewriter') chars = Math.min(chars, Math.floor(p * total + 1e-6));
  };
  if (pin < 1) anim(tx.animIn, pin);
  if (pout < 1) anim(tx.animOut, pout);

  ctx.globalAlpha = alpha;
  if (tx.bg) {
    ctx.fillStyle = tx.bg;
    ctx.beginPath();
    ctx.roundRect(-L.w / 2, -L.h / 2, L.w, L.h, tx.size * 0.15);
    ctx.fill();
  }
  ctx.font = fontOf(clip);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  const inner = L.w - L.pad * 2;
  let used = 0;
  L.lines.forEach((full, i) => {
    const line = chars === Infinity ? full : full.slice(0, Math.max(0, chars - used));
    used += full.length + 1;
    if (!line) return;
    const x = -inner / 2 + (tx.align === 'center' ? (inner - L.widths[i]) / 2 : tx.align === 'right' ? inner - L.widths[i] : 0);
    const y = -L.h / 2 + L.pad + L.lineHeight * (i + 0.5);
    if (tx.shadowBlur > 0) {
      ctx.shadowColor = tx.shadow;
      ctx.shadowBlur = tx.shadowBlur;
      ctx.shadowOffsetY = tx.shadowBlur * 0.15;
    }
    if (tx.strokeWidth > 0) {
      ctx.strokeStyle = tx.stroke;
      ctx.lineWidth = tx.strokeWidth * 2;
      ctx.strokeText(line, x, y);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = tx.color;
    ctx.fillText(line, x, y);
    ctx.shadowColor = 'transparent';
  });
}

function drawClip(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  t: number,
  project: Project,
  media: Record<string, MediaItem>,
  getSource: GetSource,
  alpha: number,
  trans?: { type: TransitionType; p: number },
) {
  const { width: W, height: H } = project;
  ctx.save();
  if (trans) alpha *= applyTransition(ctx, trans.type, trans.p, W, H);
  alpha *= clip.opacity;
  if (alpha <= 0.001) return ctx.restore();

  const box = clipBox(clip, project, media);
  let scale = clip.scale;
  let dx = 0;
  const q = clamp01((t - clip.start) / Math.max(0.001, clip.duration));
  if (clip.motion === 'zoomIn') scale *= 1 + 0.25 * q;
  else if (clip.motion === 'zoomOut') scale *= 1.25 - 0.25 * q;
  else if (clip.motion === 'panLeft' || clip.motion === 'panRight') {
    scale *= 1.2;
    dx = box.w * clip.scale * 0.1 * (1 - 2 * q) * (clip.motion === 'panLeft' ? 1 : -1);
  }

  ctx.translate(W / 2 + clip.x + dx, H / 2 + clip.y);
  ctx.rotate((clip.rotation * Math.PI) / 180);
  ctx.scale(scale * (clip.flipH ? -1 : 1), scale * (clip.flipV ? -1 : 1));
  ctx.globalCompositeOperation = clip.blend;
  ctx.filter = filterCss(clip);
  ctx.globalAlpha = alpha;

  if (clip.type === 'text') drawText(ctx, clip, t, alpha);
  else if (clip.type === 'shape') {
    shapePath(ctx, clip.shape!.kind, box.w, box.h);
    ctx.fillStyle = clip.shape!.fill;
    ctx.fill();
  } else {
    const src = getSource(clip);
    if (src) {
      const [sw, sh] = srcSize(src);
      if (sw && sh) {
        const { l, t: top, r, b } = clip.crop;
        try {
          ctx.drawImage(src, sw * l, sh * top, sw * (1 - l - r), sh * (1 - top - b), -box.w / 2, -box.h / 2, box.w, box.h);
        } catch {
          /* source not ready yet */
        }
      }
    }
  }
  ctx.restore();
}

/** Visual clips to draw at time t, bottom layer first, with any transition state. */
export function visibleAt(project: Project, t: number) {
  const out: { clip: Clip; alpha: number; trans?: { type: TransitionType; p: number } }[] = [];
  for (let i = project.tracks.length - 1; i >= 0; i--) {
    const track = project.tracks[i];
    if (track.kind !== 'video' || track.hidden) continue;
    const clips = project.clips.filter((c) => c.trackId === track.id);
    const cur = clips.find((c) => t >= c.start && t < clipEnd(c));
    if (!cur) continue;
    const tr = cur.transIn;
    if (tr && t < cur.start + tr.duration) {
      const p = clamp01((t - cur.start) / tr.duration);
      const prev = clips.find((c) => c.id !== cur.id && Math.abs(clipEnd(c) - cur.start) < 0.05);
      // The outgoing clip keeps running underneath for the length of the transition.
      if (prev) out.push({ clip: prev, alpha: tr.type === 'dip' ? clamp01(1 - p * 2) : 1 });
      out.push({ clip: cur, alpha: 1, trans: { type: tr.type, p } });
    } else out.push({ clip: cur, alpha: 1 });
  }
  return out;
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  project: Project,
  media: Record<string, MediaItem>,
  t: number,
  getSource: GetSource,
  scale = 1,
) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, project.width, project.height);
  for (const v of visibleAt(project, t)) drawClip(ctx, v.clip, t, project, media, getSource, v.alpha, v.trans);
}

/** Topmost visual clip under a point given in project pixels. */
export function hitTest(project: Project, media: Record<string, MediaItem>, t: number, px: number, py: number): string | null {
  const locked = new Set(project.tracks.filter((x) => x.locked).map((x) => x.id));
  const vis = visibleAt(project, t).reverse();
  for (const { clip } of vis) {
    if (locked.has(clip.trackId)) continue;
    const box = clipBox(clip, project, media);
    const dx = px - (project.width / 2 + clip.x);
    const dy = py - (project.height / 2 + clip.y);
    const a = (-clip.rotation * Math.PI) / 180;
    const rx = dx * Math.cos(a) - dy * Math.sin(a);
    const ry = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(rx) <= (box.w * clip.scale) / 2 && Math.abs(ry) <= (box.h * clip.scale) / 2) return clip.id;
  }
  return null;
}

/** Position inside the source media for a clip at timeline time t. */
export const sourceTime = (clip: Clip, t: number) => clip.offset + (t - clip.start) * clip.speed;

/** Audio gain for a clip at time t (0 outside the clip). */
export function gainAt(clip: Clip, t: number): number {
  const lt = t - clip.start;
  if (lt < 0 || lt >= clip.duration || clip.muted) return 0;
  let g = clip.volume;
  if (clip.fadeIn > 0) g *= clamp01(lt / clip.fadeIn);
  if (clip.fadeOut > 0) g *= clamp01((clip.duration - lt) / clip.fadeOut);
  return g;
}
