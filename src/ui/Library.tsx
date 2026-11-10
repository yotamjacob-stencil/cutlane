import { useRef, useState } from 'react';
import { useStore } from '../store';
import { deleteStoredMedia, importFiles } from '../media';
import { DRAG_TYPE, DropPayload, EMOJI, SHAPES, TITLE_PRESETS, applyPayload } from '../presets';
import { FILTER_PRESETS, TRANSITIONS } from '../engine/render';
import { TransitionType } from '../types';
import { Icon } from './icons';

const TABS = [
  ['media', 'Media', 'media'],
  ['titles', 'Titles', 'text'],
  ['transitions', 'Transitions', 'trans'],
  ['effects', 'Effects', 'fx'],
  ['stickers', 'Stickers', 'sticker'],
] as const;

type Tab = (typeof TABS)[number][0];

function Tile(props: { payload: DropPayload; label: string; children: React.ReactNode; className?: string; onRemove?: () => void; hint?: string }) {
  return (
    <div
      className={`tile ${props.className ?? ''}`}
      draggable
      title={props.hint ?? 'Drag to the timeline, or double-click to add'}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(props.payload));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onDoubleClick={() => applyPayload(props.payload)}
    >
      <div className="tile-art">{props.children}</div>
      <div className="tile-label">{props.label}</div>
      <button className="tile-add" title="Add" aria-label={`Add ${props.label}`} onClick={() => applyPayload(props.payload)}>
        <Icon name="plus" size={14} />
      </button>
      {props.onRemove && (
        <button className="tile-remove" title="Remove from project" aria-label={`Remove ${props.label}`} onClick={props.onRemove}>
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  );
}

const fmt = (d: number) => `${Math.floor(d / 60)}:${String(Math.floor(d % 60)).padStart(2, '0')}`;

function MediaTab() {
  const media = useStore((s) => s.media);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const items = Object.values(media);
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    await importFiles(Array.from(files));
    setBusy(false);
  };
  return (
    <>
      <input ref={input} type="file" multiple accept="video/*,audio/*,image/*" hidden onChange={(e) => (pick(e.target.files), (e.target.value = ''))} />
      <button className="btn wide" onClick={() => input.current?.click()} disabled={busy}>
        <Icon name="upload" /> {busy ? 'Importing…' : 'Import media'}
      </button>
      {!items.length && (
        <div className="empty">
          <b>No media yet</b>
          Import videos, photos or audio, or drop files anywhere on this window. Files stay on this computer.
        </div>
      )}
      <div className="grid">
        {items.map((m) => (
          <Tile
            key={m.id}
            payload={{ kind: 'media', id: m.id }}
            label={m.name}
            onRemove={() => {
              useStore.getState().removeMedia(m.id);
              deleteStoredMedia(m.id);
            }}
          >
            {m.thumb ? <img src={m.thumb} alt="" draggable={false} /> : <Icon name="sound" size={28} />}
            {m.kind !== 'image' && <span className="badge">{fmt(m.duration)}</span>}
          </Tile>
        ))}
      </div>
    </>
  );
}

export function Library() {
  const [tab, setTab] = useState<Tab>('media');
  return (
    <aside className="library panel">
      <nav className="tabs" role="tablist">
        {TABS.map(([id, label, icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            <Icon name={icon} size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="library-body">
        {tab === 'media' && <MediaTab />}
        {tab === 'titles' && (
          <div className="grid">
            {TITLE_PRESETS.map((p, i) => (
              <Tile key={p.label} payload={{ kind: 'title', index: i }} label={p.label}>
                <span style={p.css}>{p.text.content?.split('\n')[0].slice(0, 14)}</span>
              </Tile>
            ))}
          </div>
        )}
        {tab === 'transitions' && (
          <>
            <p className="hint">Drag onto a clip. The transition plays at the start of that clip, blending from the clip before it.</p>
            <div className="grid">
              {(Object.keys(TRANSITIONS) as TransitionType[]).map((t) => (
                <Tile key={t} payload={{ kind: 'transition', type: t }} label={TRANSITIONS[t]} hint="Drag onto a clip, or double-click to apply to the selected clip">
                  <span className={`trans-demo t-${t}`} />
                </Tile>
              ))}
            </div>
          </>
        )}
        {tab === 'effects' && (
          <>
            <p className="hint">Drag a look onto a clip. Fine-tune it under Color in the panel on the right.</p>
            <div className="grid">
              {Object.entries(FILTER_PRESETS).map(([id, f]) => (
                <Tile key={id} payload={{ kind: 'filter', preset: id }} label={f.label} hint="Drag onto a clip, or double-click to apply to the selected clip">
                  <span className="fx-demo" style={{ filter: f.css || 'none' }} />
                </Tile>
              ))}
            </div>
          </>
        )}
        {tab === 'stickers' && (
          <>
            <h4>Shapes</h4>
            <div className="grid small">
              {SHAPES.map((s) => (
                <Tile key={s} payload={{ kind: 'shape', shape: s }} label={s} className="compact">
                  <span className={`shape-demo s-${s}`} />
                </Tile>
              ))}
            </div>
            <h4>Emoji</h4>
            <div className="grid small">
              {EMOJI.map((c) => (
                <Tile key={c} payload={{ kind: 'emoji', char: c }} label="" className="compact">
                  <span style={{ fontSize: 26 }}>{c}</span>
                </Tile>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
