import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tailwind.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

const hasDesktopBridge = Boolean(
  (window as Window & {
    styloDesktop?: { isDesktop?: boolean };
    qalamDesktop?: { isDesktop?: boolean };
  }).styloDesktop?.isDesktop ||
  (window as Window & { qalamDesktop?: { isDesktop?: boolean } }).qalamDesktop?.isDesktop
);
const hasElectronUserAgent = /\bElectron\/\d+/i.test(window.navigator.userAgent);
const isDesktop = hasDesktopBridge || hasElectronUserAgent;

document.documentElement.classList.remove(isDesktop ? 'stylo-web-runtime' : 'stylo-desktop-runtime');
document.documentElement.classList.add(isDesktop ? 'stylo-desktop-runtime' : 'stylo-web-runtime');

if (isDesktop) {
  const bootScreen = document.getElementById('stylo-desktop-boot');
  const dismissBootScreen = () => {
    if (!bootScreen || bootScreen.classList.contains('stylo-desktop-boot--exit')) return;
    bootScreen.classList.add('stylo-desktop-boot--exit');
    window.setTimeout(() => bootScreen.remove(), 240);
  };
  const readyObserver = new MutationObserver(() => {
    if (rootElement.childElementCount === 0) return;
    readyObserver.disconnect();
    window.requestAnimationFrame(() => window.requestAnimationFrame(dismissBootScreen));
  });
  readyObserver.observe(rootElement, { childList: true });

  Promise.all([import('./App'), import('./lib/auth')]).then(([{ default: App }, { AuthProvider }]) => {
    root.render(
      <React.StrictMode>
        <AuthProvider>
          <App />
        </AuthProvider>
      </React.StrictMode>
    );
  }).catch((error) => {
    readyObserver.disconnect();
    console.error('Stylo desktop failed to load', error);
  });
} else {
  import('./components/LandingPage').then(({ LandingPage }) => {
    root.render(
      <React.StrictMode>
        <LandingPage />
      </React.StrictMode>
    );
  }).catch((error) => {
    console.error('Stylo website failed to load', error);
  });
}
