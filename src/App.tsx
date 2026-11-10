import { useEffect, useState } from 'react';
import { useStore } from './store';
import { clearStorage, importFiles, loadSaved } from './media';
import { player } from './engine/player';
import { projectDuration } from './types';
import { Library } from './ui/Library';
import { Preview } from './ui/Preview';
import { Inspector } from './ui/Inspector';
import { Timeline } from './ui/Timeline';
import { ExportDialog } from './ui/ExportDialog';
import { Icon } from './ui/icons';

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable || (el.tagName === 'INPUT' && !['range', 'checkbox', 'color'].includes((el as HTMLInputElement).type));
      const st = useStore.getState();
      if (typing || st.exportOpen) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const fps = st.project.fps;
      const done = () => e.preventDefault();
      if (key === ' ') return done(), (document.activeElement as HTMLElement)?.blur?.(), player.toggle();
      if (mod && key === 'z') return done(), e.shiftKey ? st.redo() : st.undo();
      if (mod && key === 'y') return done(), st.redo();
      if (mod && key === 'c') return st.copy();
      if (mod && key === 'v') return st.paste();
      if (mod && key === 'd') return done(), st.duplicateSelected();
      if (mod && key === 'a') return done(), st.select(st.project.clips.map((c) => c.id));
      if (mod && key === 'b') return done(), st.splitAtPlayhead();
      if (mod) return;
      if (key === 's') return st.splitAtPlayhead();
      if (key === 'delete' || key === 'backspace') return done(), st.deleteSelected(e.shiftKey);
      if (key === 'arrowleft' || key === 'arrowright') {
        if (el.tagName === 'INPUT') return;
        done();
        player.pause();
        const n = (key === 'arrowleft' ? -1 : 1) * (e.shiftKey ? fps : 1);
        return player.seek(Math.round(st.time * fps + n) / fps);
      }
      if (key === 'home') return player.seek(0);
      if (key === 'end') return player.seek(projectDuration(st.project));
      if (key === 'escape') return st.select([]);
      if (key === '=' || key === '+') return useStore.setState({ pxPerSec: Math.min(400, st.pxPerSec * 1.3) });
      if (key === '-') return useStore.setState({ pxPerSec: Math.max(4, st.pxPerSec / 1.3) });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function TopBar() {
  const name = useStore((s) => s.project.name);
  const [arming, setArming] = useState(false);
  const newProject = async () => {
    if (!arming) {
      setArming(true);
      setTimeout(() => setArming(false), 4000);
      return;
    }
    setArming(false);
    player.pause();
    for (const m of Object.values(useStore.getState().media)) URL.revokeObjectURL(m.url);
    useStore.getState().resetProject();
    await clearStorage();
  };
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">
          <Icon name="play" size={14} />
        </span>
        Cutlane
      </div>
      <input
        className="project-name"
        value={name}
        aria-label="Project name"
        onFocus={() => useStore.getState().checkpoint()}
        onChange={(e) => useStore.getState().mutate((p) => void (p.name = e.target.value), false)}
      />
      <span className="saved">Saved on this computer automatically</span>
      <span className="grow" />
      <button className="btn" onClick={newProject}>
        {arming ? 'Click again to clear everything' : 'New project'}
      </button>
      <button className="btn primary" onClick={() => useStore.setState({ exportOpen: true })}>
        <Icon name="download" /> Export
      </button>
    </header>
  );
}

export function App() {
  const loaded = useStore((s) => s.loaded);
  const exportOpen = useStore((s) => s.exportOpen);
  const toasts = useStore((s) => s.toasts);
  const [dropping, setDropping] = useState(false);
  useShortcuts();
  useEffect(() => void loadSaved(), []);

  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');
  if (!loaded) return <div className="loading">Loading…</div>;
  return (
    <div
      className="app"
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDropping(false)}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDropping(false);
        importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <TopBar />
      <main className="workspace">
        <Library />
        <Preview />
        <Inspector />
      </main>
      <Timeline />
      {exportOpen && <ExportDialog />}
      {dropping && <div className="drop-veil">Drop files to import</div>}
      <div className="toasts" role="status">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
