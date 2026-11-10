import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import './styles.css';
import App from './App';

if (Capacitor.isNativePlatform()) {
  import('./lib/clavier').then(({ gererClavier }) => gererClavier());
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#0B2A66' }).catch(() => {});
  });
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
