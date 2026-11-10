import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useStore } from './store';
import { player } from './engine/player';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// Handy for debugging and automated checks.
Object.assign(window, { cutlane: { useStore, player } });
