# Stylo Electron Desktop Shell

This desktop shell intentionally keeps the web architecture intact:

- React/Vite remains the only UI application.
- Cloudflare Pages Functions remain the backend.
- Electron only provides a native app window and installer packaging.

## Development

Run the Vite app inside Electron:

```bash
npm run desktop:dev
```

## Local Packaged App

Build the Vite app and open the bundled `dist/index.html` in Electron:

```bash
npm run desktop
```

When using a bundled local build, set `VITE_API_BASE` during build if the
desktop app should call the deployed Cloudflare backend instead of same-origin
`/api/*`.

Example:

```bash
VITE_API_BASE=https://your-stylo-domain.example npm run desktop
```

## Remote Web App Shell

Packaged builds load the bundled Vite app by default. To make packaged builds
behave like a native wrapper around the deployed Cloudflare Pages app, set
`defaultRemoteUrl` in `electron/desktop.config.cjs` before building.

To override the target URL at runtime, set `STYLO_DESKTOP_URL`:

```bash
STYLO_DESKTOP_URL=https://your-stylo-domain.example npx electron .
```

This mode gives users a native installed app while still loading the exact deployed web app.

## Installer Builds

Create an unpacked desktop app:

```bash
npm run desktop:pack
```

Create installer artifacts:

```bash
npm run desktop:dist
```

Installer output is written to `release/`.

The default installer build disables automatic code-signing so local builds do
not block on Keychain prompts. Use this command when you are ready to build with
the configured signing identity:

```bash
npm run desktop:dist:signed
```
