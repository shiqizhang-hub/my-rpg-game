# Deploy To Google Apps Script

This project now supports a Google Apps Script deployment flow.

## What changed

- `npm run build:gas` builds a single-file Vite bundle.
- The built HTML is copied to `gas/Index.html`.
- `gas/Code.gs` and `gas/appsscript.json` are ready for a web app deployment.
- Camera control was changed to drag-to-rotate so the app does not depend on pointer lock.

## One-time setup

1. Install dependencies:
   `npm install`
2. Install clasp globally if you want CLI deployment:
   `npm install -g @google/clasp`
3. Log in to Google:
   `clasp login`

## Build the GAS files

Run:

`npm run build:gas`

This produces:

- `dist/index.html`
- `gas/Index.html`

## Create the Apps Script project

Option A: Use the browser

1. Open `https://script.google.com`
2. Create a new standalone project.
3. Add these files from the local `gas` folder:
   - `Code.gs`
   - `Index.html`
   - `appsscript.json`
4. Save the project.
5. Deploy as a Web App.

Option B: Use clasp

1. Create a new Apps Script project:
   `clasp create --type standalone --title "Hospital Exploration Prototype" --rootDir gas`
2. If you already have a GAS project, copy `.clasp.json.example` to `.clasp.json` and set your `scriptId`.
3. Push the local `gas` folder:
   `clasp push`
4. Create a deployment:
   `clasp deploy --description "initial web app deployment"`

## Deploy as a web app in the Apps Script UI

1. Click `Deploy`.
2. Click `New deployment`.
3. Select `Web app`.
4. Set `Execute as` to `Me`.
5. Set access to `Anyone` or `Anyone with Google account`.
6. Deploy and open the URL.

## Notes

- GAS HTML Service runs in a sandboxed iframe, so drag camera is safer than pointer-lock camera.
- If you edit the game, rebuild before pushing again:
  `npm run build:gas`
- The local source files are still `index.html` and `main.js`. Do not edit `gas/Index.html` by hand unless you really need to.
