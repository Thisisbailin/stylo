import React from 'react';
import ReactDOM from 'react-dom/client';
import { LandingPage } from './components/LandingPage';
import './styles/tailwind.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

const isDesktop = Boolean(
  (window as Window & { qalamDesktop?: { isDesktop?: boolean } }).qalamDesktop?.isDesktop
);

document.documentElement.classList.add(isDesktop ? 'stylo-desktop-runtime' : 'stylo-web-runtime');

if (isDesktop) {
  Promise.all([import('./App'), import('./lib/auth')]).then(([{ default: App }, { AuthProvider }]) => {
    root.render(
      <React.StrictMode>
        <AuthProvider>
          <App />
        </AuthProvider>
      </React.StrictMode>
    );
  });
} else {
  root.render(
    <React.StrictMode>
      <LandingPage />
    </React.StrictMode>
  );
}
