# fnirs-webpipe

fnirs-webpipe is a browser based, client side pipeline for exploratory and reproducible fNIRS data analysis.

All computation occurs locally in the user's browser. Data are never uploaded to a server.

Desktop-only scope: this project does not target mobile layouts or mobile capture.

## Usage
Open the web app and load a NIRx data folder as a zip file.

## Local UI workflow
For faster visual iteration:

1. Install tooling:
`npm install`

2. Install Playwright browser:
`npm run ui:install`

3. Run local app server:
`npm run serve`

4. Capture desktop screenshot (dark mode default):
`npm run ui:capture`

Optional light mode capture:
`npm run ui:capture:light`

By default, capture will try to auto-load the newest ZIP from `../NIRx` (fallback: `%USERPROFILE%/Desktop/NIRx`) before taking screenshots.

Optional overrides:
- `node scripts/capture-ui.mjs --zip=../NIRx/2026-02-18_002.zip`
- `node scripts/capture-ui.mjs --nirx-dir=../NIRx`

Screenshots are written to `screenshots/`.

## Status
Active development.

License: CC BY-NC 4.0
