import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { ExportOpts, ExportResult, exportSupported, exportVideo } from '../engine/export';
import { player } from '../engine/player';
import { formatTime, projectDuration } from '../types';
import { Icon } from './icons';
import { saveFile } from '../save';

export function ExportDialog() {
  const project = useStore((s) => s.project);
  const duration = projectDuration(project);
  const [opts, setOpts] = useState<ExportOpts>({ height: Math.min(project.height, 1080), fps: project.fps, format: 'mp4', quality: 'medium' });
  const [progress, setProgress] = useState<{ p: number; stage: string } | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);

  const close = () => {
    abort.current?.abort();
    useStore.setState({ exportOpen: false });
  };
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const start = async () => {
    setError('');
    setResult(null);
    player.silence();
    abort.current = new AbortController();
    setProgress({ p: 0, stage: 'Starting' });
    try {
      const r = await exportVideo(opts, (p, stage) => setProgress({ p, stage }), abort.current.signal);
      setResult(r);
      setUrl(URL.createObjectURL(r.blob));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message || 'Export failed.');
    }
    setProgress(null);
  };

  const heights = [...new Set([480, 720, 1080, 1440, 2160, project.height])].sort((a, b) => a - b);
  const widthFor = (h: number) => Math.round((h * project.width) / project.height / 2) * 2;
  const set = <K extends keyof ExportOpts>(k: K, v: ExportOpts[K]) => setOpts((o) => ({ ...o, [k]: v }));

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && !progress && close()}>
      <div className="modal" role="dialog" aria-label="Export video">
        <header>
          <h3>Export video</h3>
          <button className="icon-btn" onClick={close} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>

        {!exportSupported() && <p className="error">This browser can't encode video. Open Cutlane in a current Chrome or Edge on a computer.</p>}

        {result ? (
          <div className="export-done">
            <video src={url} controls />
            {result.note && <p className="hint">{result.note}</p>}
            <div className="modal-actions">
              <button className="btn" onClick={() => setResult(null)}>
                Export again
              </button>
              <button className="btn primary" onClick={() => saveFile(result.blob, result.filename)}>
                <Icon name="download" /> Download {result.filename} ({(result.blob.size / 1048576).toFixed(1)} MB)
              </button>
            </div>
          </div>
        ) : progress ? (
          <div className="export-progress">
            <p>
              {progress.stage}… {Math.round(progress.p * 100)}%
            </p>
            <div className="bar">
              <i style={{ width: `${progress.p * 100}%` }} />
            </div>
            <p className="hint">Keep this tab open and in front until it finishes.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => abort.current?.abort()}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="form">
              <label>
                <span>Format</span>
                <select value={opts.format} onChange={(e) => set('format', e.target.value as ExportOpts['format'])}>
                  <option value="mp4">MP4 (plays everywhere)</option>
                  <option value="webm">WebM</option>
                </select>
              </label>
              <label>
                <span>Size</span>
                <select value={opts.height} onChange={(e) => set('height', Number(e.target.value))}>
                  {heights.map((h) => (
                    <option key={h} value={h}>
                      {widthFor(h)} × {h}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Frame rate</span>
                <select value={opts.fps} onChange={(e) => set('fps', Number(e.target.value))}>
                  {[...new Set([24, 25, 30, 50, 60, project.fps])].sort((a, b) => a - b).map((f) => (
                    <option key={f} value={f}>
                      {f} fps
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Quality</span>
                <select value={opts.quality} onChange={(e) => set('quality', e.target.value as ExportOpts['quality'])}>
                  <option value="low">Smaller file</option>
                  <option value="medium">Balanced</option>
                  <option value="high">Best quality</option>
                </select>
              </label>
            </div>
            <p className="hint">Length {formatTime(duration, project.fps)}. The video is made on this computer; nothing is uploaded.</p>
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button className="btn" onClick={close}>
                Cancel
              </button>
              <button className="btn primary" onClick={start} disabled={duration <= 0 || !exportSupported()}>
                Export
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
