# Cutlane

A video editor that runs entirely in the browser. Nothing is uploaded: media stays on the computer, the project autosaves to the browser's storage, and export is encoded locally.

Desktop only for now. Use a current Chrome or Edge (export needs WebCodecs).

## Features

- **Media**: import video, audio and images (file picker or drag and drop), thumbnails and waveforms
- **Timeline**: multiple video and audio tracks, drag to move between tracks, trim handles, split, delete, ripple delete, duplicate, copy and paste, snapping, zoom, track mute / hide / lock, undo and redo
- **Preview**: real-time playback with sound, frame stepping, move / scale / rotate directly on the picture, snapshot to PNG, full screen
- **Titles**: presets, fonts, colour, outline, shadow, background, in and out animations (fade, slide, pop, typewriter)
- **Transitions**: cross fade, dip to black, wipes, slides, zoom, iris
- **Effects**: colour looks plus brightness, contrast, saturation, hue and blur; blend modes; crop; flip; slow zoom and pan
- **Stickers**: shapes and emoji
- **Audio**: volume, fades, mute, detach audio from video, speed 0.25× to 4×
- **Frame shapes**: 16:9, 9:16, 1:1, 4:5, 4:3, 21:9
- **Export**: MP4 (H.264) or WebM (VP9), 480p to 4K, 24 to 60 fps, three quality levels

Not built yet: keyframe animation, screen and voice recording, stock media, reverse playback, mobile layout.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## Layout

```
src/types.ts          project, track and clip model
src/store.ts          state, undo history and every editing action (zustand + immer)
src/media.ts          import, thumbnails, waveforms, IndexedDB autosave
src/engine/render.ts  draws one frame of the project to a canvas (shared by preview and export)
src/engine/player.ts  real-time preview: keeps media elements in step with the playhead
src/engine/export.ts  frame-by-frame render, WebCodecs encode, MP4 / WebM mux
src/ui/               library, preview, inspector, timeline, export dialog
```
