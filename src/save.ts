import { useStore } from './store';

type Downloads = { save(r: { filename: string; data: Blob }): Promise<unknown> };
const host = () => (window as unknown as { claude?: { use(name: string): Promise<Downloads | null> } }).claude;

/** Save a generated file: through the host page's save prompt when embedded, else a normal browser download. */
export async function saveFile(blob: Blob, filename: string) {
  const downloads = await host()?.use('downloads').catch(() => null);
  if (downloads) {
    try {
      await downloads.save({ filename, data: blob });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'declined') useStore.getState().toast(code === 'rate_limited' ? 'A save prompt is already open. Try again in a moment.' : "The file couldn't be saved here.");
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
