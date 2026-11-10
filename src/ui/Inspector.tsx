import { useStore, defaultColor } from '../store';
import { Clip, Motion, ShapeKind, TextAnim, TextProps, TransitionType } from '../types';
import { FILTER_PRESETS, TRANSITIONS } from '../engine/render';
import { FONTS, SHAPES } from '../presets';
import { RATIOS, setProjectSize } from './Preview';

const st = () => useStore.getState();

function Slider(props: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number, record: boolean) => void }) {
  const { label, value, min, max, step = 1, unit = '' } = props;
  const shown = Math.round(value * 100) / 100;
  return (
    <label className="row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={() => st().checkpoint()}
        onKeyDown={() => st().checkpoint()}
        onChange={(e) => props.onChange(Number(e.target.value), false)}
      />
      <input
        className="num"
        type="number"
        step={step}
        value={shown}
        aria-label={label}
        onChange={(e) => e.target.value !== '' && props.onChange(Number(e.target.value), true)}
      />
      <em>{unit}</em>
    </label>
  );
}

function Select<T extends string>(props: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <label className="row">
      <span>{props.label}</span>
      <select value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Color(props: { label: string; value: string; onChange: (v: string, record: boolean) => void; optional?: boolean }) {
  const on = !!props.value;
  return (
    <label className="row">
      <span>{props.label}</span>
      {props.optional && <input type="checkbox" checked={on} onChange={(e) => props.onChange(e.target.checked ? '#000000' : '', true)} />}
      {on && (
        <input
          type="color"
          value={props.value.slice(0, 7)}
          onPointerDown={() => st().checkpoint()}
          onChange={(e) => props.onChange(e.target.value + (props.value.length === 9 ? props.value.slice(7) : ''), false)}
        />
      )}
    </label>
  );
}

function Section(props: { title: string; children: React.ReactNode; onReset?: () => void }) {
  return (
    <section className="insp-section">
      <header>
        <h4>{props.title}</h4>
        {props.onReset && (
          <button className="link" onClick={props.onReset}>
            Reset
          </button>
        )}
      </header>
      {props.children}
    </section>
  );
}

const ANIMS: [TextAnim, string][] = [
  ['none', 'None'],
  ['fade', 'Fade'],
  ['slideUp', 'Slide up'],
  ['slideDown', 'Slide down'],
  ['pop', 'Pop'],
  ['typewriter', 'Typewriter'],
];

const BLENDS: [GlobalCompositeOperation, string][] = [
  ['source-over', 'Normal'],
  ['screen', 'Screen'],
  ['multiply', 'Multiply'],
  ['overlay', 'Overlay'],
  ['lighten', 'Lighten'],
  ['darken', 'Darken'],
  ['difference', 'Difference'],
];

function ClipInspector({ clip }: { clip: Clip }) {
  const media = useStore((s) => s.media[clip.mediaId ?? '']);
  const set = (patch: Partial<Clip>, record = true) => st().updateClip(clip.id, patch, record);
  const setText = (patch: Partial<TextProps>, record = true) => set({ text: { ...clip.text!, ...patch } }, record);
  const setColor = (patch: Partial<Clip['color']>, record = true) => set({ color: { ...clip.color, ...patch } }, record);
  const setCrop = (patch: Partial<Clip['crop']>, record = true) => set({ crop: { ...clip.crop, ...patch } }, record);
  const visual = clip.type !== 'audio';
  const sound = clip.type === 'audio' || clip.type === 'video';
  const t = clip.text;

  return (
    <>
      <div className="insp-title">
        <span className={`chip ${clip.type}`}>{clip.type}</span>
        <b title={clip.name}>{clip.name}</b>
      </div>

      {t && (
        <Section title="Text">
          <textarea value={t.content} rows={3} aria-label="Text" onFocus={() => st().checkpoint()} onChange={(e) => setText({ content: e.target.value }, false)} />
          <Select label="Font" value={t.font} options={FONTS.map(([label, stack]) => [stack, label] as [string, string])} onChange={(font) => setText({ font })} />
          <Slider label="Size" value={t.size} min={10} max={400} onChange={(size, r) => setText({ size }, r)} />
          <div className="row">
            <span>Style</span>
            <div className="seg">
              <button className={t.bold ? 'on' : ''} onClick={() => setText({ bold: !t.bold })} title="Bold">
                <b>B</b>
              </button>
              <button className={t.italic ? 'on' : ''} onClick={() => setText({ italic: !t.italic })} title="Italic">
                <i>I</i>
              </button>
              {(['left', 'center', 'right'] as const).map((a) => (
                <button key={a} className={t.align === a ? 'on' : ''} onClick={() => setText({ align: a })} title={`Align ${a}`}>
                  {a[0].toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <Color label="Colour" value={t.color} onChange={(color, r) => setText({ color }, r)} />
          <Slider label="Outline" value={t.strokeWidth} min={0} max={30} onChange={(strokeWidth, r) => setText({ strokeWidth }, r)} />
          {t.strokeWidth > 0 && <Color label="Outline colour" value={t.stroke} onChange={(stroke, r) => setText({ stroke }, r)} />}
          <Slider label="Shadow" value={t.shadowBlur} min={0} max={80} onChange={(shadowBlur, r) => setText({ shadowBlur }, r)} />
          {t.shadowBlur > 0 && <Color label="Shadow colour" value={t.shadow} onChange={(shadow, r) => setText({ shadow }, r)} />}
          <Color label="Background" value={t.bg} optional onChange={(bg, r) => setText({ bg }, r)} />
          <Select label="Animate in" value={t.animIn} options={ANIMS} onChange={(animIn) => setText({ animIn })} />
          <Select label="Animate out" value={t.animOut} options={ANIMS.filter(([a]) => a !== 'typewriter')} onChange={(animOut) => setText({ animOut })} />
        </Section>
      )}

      {clip.shape && (
        <Section title="Shape">
          <Select label="Shape" value={clip.shape.kind} options={SHAPES.map((s) => [s, s[0].toUpperCase() + s.slice(1)] as [ShapeKind, string])} onChange={(kind) => set({ shape: { ...clip.shape!, kind } })} />
          <Color label="Fill" value={clip.shape.fill} onChange={(fill, r) => set({ shape: { ...clip.shape!, fill } }, r)} />
          <Slider label="Width" value={clip.shape.w} min={4} max={3000} onChange={(w, r) => set({ shape: { ...clip.shape!, w } }, r)} />
          <Slider label="Height" value={clip.shape.h} min={4} max={3000} onChange={(h, r) => set({ shape: { ...clip.shape!, h } }, r)} />
        </Section>
      )}

      {visual && (
        <Section title="Transform" onReset={() => set({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipH: false, flipV: false, blend: 'source-over' })}>
          <Slider label="X" value={clip.x} min={-2000} max={2000} onChange={(x, r) => set({ x }, r)} />
          <Slider label="Y" value={clip.y} min={-2000} max={2000} onChange={(y, r) => set({ y }, r)} />
          <Slider label="Scale" value={Math.round(clip.scale * 100)} min={5} max={400} unit="%" onChange={(v, r) => set({ scale: Math.max(0.01, v / 100) }, r)} />
          <Slider label="Rotate" value={clip.rotation} min={-180} max={180} unit="°" onChange={(rotation, r) => set({ rotation }, r)} />
          <Slider label="Opacity" value={Math.round(clip.opacity * 100)} min={0} max={100} unit="%" onChange={(v, r) => set({ opacity: Math.min(1, Math.max(0, v / 100)) }, r)} />
          <div className="row">
            <span>Flip</span>
            <div className="seg">
              <button className={clip.flipH ? 'on' : ''} onClick={() => set({ flipH: !clip.flipH })}>
                Horizontal
              </button>
              <button className={clip.flipV ? 'on' : ''} onClick={() => set({ flipV: !clip.flipV })}>
                Vertical
              </button>
            </div>
          </div>
          {media && (
            <Select
              label="Fit"
              value={clip.fit}
              options={[
                ['contain', 'Fit inside frame'],
                ['cover', 'Fill frame'],
              ]}
              onChange={(fit) => set({ fit })}
            />
          )}
          <Select label="Blend" value={clip.blend} options={BLENDS} onChange={(blend) => set({ blend })} />
        </Section>
      )}

      {visual && media && (
        <Section title="Crop" onReset={() => set({ crop: { l: 0, t: 0, r: 0, b: 0 } })}>
          {(['l', 't', 'r', 'b'] as const).map((side) => (
            <Slider
              key={side}
              label={{ l: 'Left', t: 'Top', r: 'Right', b: 'Bottom' }[side]}
              value={Math.round(clip.crop[side] * 100)}
              min={0}
              max={45}
              unit="%"
              onChange={(v, r) => setCrop({ [side]: Math.min(0.45, Math.max(0, v / 100)) }, r)}
            />
          ))}
        </Section>
      )}

      {visual && (
        <Section title="Transition in">
          <Select
            label="Type"
            value={(clip.transIn?.type ?? 'none') as TransitionType | 'none'}
            options={[['none', 'None'], ...(Object.entries(TRANSITIONS) as [TransitionType, string][])]}
            onChange={(v) => set({ transIn: v === 'none' ? undefined : { type: v, duration: clip.transIn?.duration ?? Math.min(1, clip.duration / 2) } })}
          />
          {clip.transIn && (
            <Slider
              label="Length"
              value={clip.transIn.duration}
              min={0.1}
              max={Math.max(0.2, Math.min(5, clip.duration))}
              step={0.1}
              unit="s"
              onChange={(duration, r) => set({ transIn: { ...clip.transIn!, duration: Math.max(0.1, duration) } }, r)}
            />
          )}
        </Section>
      )}

      {visual && (
        <Section title="Colour" onReset={() => set({ color: defaultColor() })}>
          <Select label="Look" value={clip.color.preset} options={Object.entries(FILTER_PRESETS).map(([id, f]) => [id, f.label] as [string, string])} onChange={(preset) => setColor({ preset })} />
          <Slider label="Brightness" value={clip.color.brightness} min={0} max={200} onChange={(brightness, r) => setColor({ brightness }, r)} />
          <Slider label="Contrast" value={clip.color.contrast} min={0} max={200} onChange={(contrast, r) => setColor({ contrast }, r)} />
          <Slider label="Saturation" value={clip.color.saturation} min={0} max={200} onChange={(saturation, r) => setColor({ saturation }, r)} />
          <Slider label="Hue" value={clip.color.hue} min={-180} max={180} unit="°" onChange={(hue, r) => setColor({ hue }, r)} />
          <Slider label="Blur" value={clip.color.blur} min={0} max={40} onChange={(blur, r) => setColor({ blur }, r)} />
        </Section>
      )}

      {visual && clip.type !== 'text' && (
        <Section title="Motion">
          <Select
            label="Move"
            value={clip.motion}
            options={
              [
                ['none', 'None'],
                ['zoomIn', 'Slow zoom in'],
                ['zoomOut', 'Slow zoom out'],
                ['panLeft', 'Pan left'],
                ['panRight', 'Pan right'],
              ] as [Motion, string][]
            }
            onChange={(motion) => set({ motion })}
          />
        </Section>
      )}

      {sound && (
        <Section title="Speed">
          <div className="row">
            <span>Speed</span>
            <div className="seg">
              {[0.25, 0.5, 1, 1.5, 2, 4].map((v) => (
                <button key={v} className={clip.speed === v ? 'on' : ''} onClick={() => st().setSpeed(clip.id, v)}>
                  {v}×
                </button>
              ))}
            </div>
          </div>
        </Section>
      )}

      {sound && (
        <Section title="Audio">
          {clip.type === 'video' && media && !media.hasAudio && <p className="hint">No sound was found in this file.</p>}
          <Slider label="Volume" value={Math.round(clip.volume * 100)} min={0} max={200} unit="%" onChange={(v, r) => set({ volume: Math.max(0, v / 100) }, r)} />
          <Slider label="Fade in" value={clip.fadeIn} min={0} max={Math.min(10, clip.duration)} step={0.1} unit="s" onChange={(fadeIn, r) => set({ fadeIn: Math.max(0, fadeIn) }, r)} />
          <Slider label="Fade out" value={clip.fadeOut} min={0} max={Math.min(10, clip.duration)} step={0.1} unit="s" onChange={(fadeOut, r) => set({ fadeOut: Math.max(0, fadeOut) }, r)} />
          <label className="row">
            <span>Mute clip</span>
            <input type="checkbox" checked={clip.muted} onChange={(e) => set({ muted: e.target.checked })} />
          </label>
        </Section>
      )}

      <Section title="Timing">
        <p className="hint">
          Starts at {clip.start.toFixed(2)}s · lasts {clip.duration.toFixed(2)}s
        </p>
      </Section>
    </>
  );
}

function ProjectInspector() {
  const project = useStore((s) => s.project);
  return (
    <>
      <div className="insp-title">
        <b>Project</b>
      </div>
      <Section title="Frame">
        <Select
          label="Shape"
          value={`${project.width}x${project.height}`}
          options={RATIOS.map(([l, w, h]) => [`${w}x${h}`, l] as [string, string])}
          onChange={(v) => {
            const [w, h] = v.split('x').map(Number);
            setProjectSize(w, h);
          }}
        />
        <Select
          label="Frame rate"
          value={String(project.fps)}
          options={[24, 25, 30, 50, 60].map((f) => [String(f), `${f} fps`] as [string, string])}
          onChange={(v) => st().mutate((p) => void (p.fps = Number(v)))}
        />
        <p className="hint">
          {project.width} × {project.height} pixels
        </p>
      </Section>
      <Section title="Shortcuts">
        <dl className="keys">
          {[
            ['Space', 'Play / pause'],
            ['S', 'Split at playhead'],
            ['Delete', 'Delete clip'],
            ['Shift + Delete', 'Delete and close gap'],
            ['Ctrl + Z / Y', 'Undo / redo'],
            ['Ctrl + C / V / D', 'Copy / paste / duplicate'],
            ['← →', 'Step one frame'],
            ['Ctrl + scroll', 'Zoom timeline'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <p className="hint pad">Select a clip on the timeline to edit it here.</p>
    </>
  );
}

export function Inspector() {
  const clip = useStore((s) => s.project.clips.find((c) => c.id === s.selection[0]));
  const count = useStore((s) => s.selection.length);
  return (
    <aside className="inspector panel">
      {count > 1 && <p className="hint pad">{count} clips selected. Showing the first one.</p>}
      {clip ? <ClipInspector key={clip.id} clip={clip} /> : <ProjectInspector />}
    </aside>
  );
}
