import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Suppress WebGL extension errors in environments that block them (e.g. Brave Shields)
// This prevents the Vite red overlay from crashing the app UX for non-critical 3D components.
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.message && event.reason.message.includes('ANGLE_instanced_arrays')) {
    event.preventDefault();
    console.warn('WebGL ANGLE_instanced_arrays not supported by your browser/device. 3D features may be disabled.');
  }
});

createRoot(document.getElementById("root")!).render(<App />);
