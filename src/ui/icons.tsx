const PATHS: Record<string, string> = {
  play: 'M7 4.5v15l12.5-7.5z',
  pause: 'M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z',
  start: 'M6 5h2v14H6zM19 5v14l-10-7z',
  end: 'M16 5h2v14h-2zM5 5l10 7-10 7z',
  prev: 'M15.5 5.5v13L6 12z',
  next: 'M8.5 5.5v13L18 12z',
  undo: 'M9 5 3.5 10.5 9 16v-3.6h4.5a3.6 3.6 0 0 1 0 7.2H8v2h5.5a5.6 5.6 0 0 0 0-11.2H9z',
  redo: 'M15 5l5.5 5.5L15 16v-3.6h-4.5a3.6 3.6 0 0 0 0 7.2H16v2h-5.500a5.6 5.6 0 0 1 0-11.2H15z',
  split: 'M11 2h2v20h-2zM3 7h6v10H3zM15 7h6v10h-6z',
  trash: 'M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7z',
  ripple: 'M3 6h8v12H3zM21 8l-6 4 6 4zM13 11h3v2h-3z',
  copy: 'M8 3h11v13h-2V5H8zM5 7h10v14H5z',
  detach: 'M3 5h18v7H3zM5 15h2v4H5zM9 14h2v6H9zM13 16h2v2h-2zM17 14h2v6h-2z',
  magnet: 'M5 3h5v9a2 2 0 0 0 4 0V3h5v9a7 7 0 0 1-14 0zM5 3h5v3H5zM14 3h5v3h-5z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  minus: 'M5 11h14v2H5z',
  fit: 'M3 5h18v14H3zm2 2v10h14V7zM8 10l-2 2 2 2zM16 10l2 2-2 2z',
  eye: 'M12 5c5 0 9 4.5 10 7-1 2.500-5 7-10 7S3 14.500 2 12c1-2.500 5-7 10-7zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  eyeOff: 'M3 4.300 4.300 3 21 19.700 19.700 21l-3-3A10.500 10.500 0 0 1 12 19C7 19 3 14.500 2 12a13 13 0 0 1 4-5zM12 5c5 0 9 4.500 10 7a13 13 0 0 1-2.700 3.700L9.500 5.300A10 10 0 0 1 12 5z',
  sound: 'M4 9h4l5-4v14l-5-4H4zM16 8.500a5 5 0 0 1 0 7zM18.500 6a8.500 8.500 0 0 1 0 12',
  mute: 'M4 9h4l5-4v14l-5-4H4zM16 9.400l1.400-1.400L19.500 10.100 21.600 8 23 9.400 20.900 11.500 23 13.600 21.600 15 19.500 12.900 17.400 15 16 13.600l2.100-2.100z',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3h2v11H5V10zm2 0h6V7a3 3 0 0 0-6 0z',
  unlock: 'M7 10V7a5 5 0 0 1 9.600-2l-1.800.800A3 3 0 0 0 9 7v3h10v11H5V10z',
  close: 'M6.400 5 12 10.600 17.600 5 19 6.400 13.400 12 19 17.600 17.600 19 12 13.400 6.400 19 5 17.600 10.600 12 5 6.400z',
  camera: 'M9 4h6l1.500 2H20v13H4V6h3.500zm3 4.500a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  full: 'M4 4h6v2H6v4H4zM14 4h6v6h-2V6h-4zM4 14h2v4h4v2H4zM18 14h2v6h-6v-2h4z',
  media: 'M3 5h18v14H3zm2 2v10h14V7zm5 2 5 3-5 3z',
  text: 'M5 5h14v3h-2V7h-4v10h2v2H9v-2h2V7H7v1H5z',
  trans: 'M3 5h8v14H3zM13 5h8v14h-8zm2 2v10l4-5z',
  fx: 'M12 3l2 5.500L20 9l-4.500 3.800L17 19l-5-3.200L7 19l1.500-6.200L4 9l6-.500z',
  sticker: 'M12 3a9 9 0 1 0 9 9c0-.300 0-.700-.100-1H15a3 3 0 0 1-3-3V3.100zM8.500 10.500a1.300 1.300 0 1 1 0 2.600 1.300 1.300 0 0 1 0-2.600zM8 15h6a3.500 3.500 0 0 1-6 0z',
  download: 'M11 4h2v8l3-3 1.400 1.400L12 15.800 6.600 10.400 8 9l3 3zM5 18h14v2H5z',
  upload: 'M11 16h2V8l3 3 1.400-1.400L12 4.200 6.600 9.600 8 11l3-3zM5 18h14v2H5z',
};

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden>
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

export function IconButton(props: { icon: string; title: string; onClick?: (e: React.MouseEvent) => void; active?: boolean; disabled?: boolean; size?: number }) {
  return (
    <button className={`icon-btn${props.active ? ' active' : ''}`} title={props.title} aria-label={props.title} onClick={props.onClick} disabled={props.disabled}>
      <Icon name={props.icon} size={props.size} />
    </button>
  );
}
