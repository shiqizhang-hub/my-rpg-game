# Deploy To Google Apps Script

This project is ready to be deployed to Google Apps Script as a Web App. The repository contains the required GAS wrapper files and now includes a CLI helper for build, push, and deploy.

## What is ready

- `npm run build:gas` builds the Vite app and copies the generated HTML to `gas/Index.html`.
- `gas/Code.gs` serves the built page through Apps Script HTML Service.
- `gas/appsscript.json` is already configured for Web App deployment.
- `npm run gas:push` builds the app and pushes the GAS files with `clasp`.
- `npm run gas:deploy` builds, pushes, and creates a deployment with `clasp`.

## One-time setup

1. Install project dependencies:
   `npm install`
2. Install `clasp` globally:
   `npm install -g @google/clasp`
3. Log in to Google:
   `clasp login`
4. Create a standalone Apps Script project in `https://script.google.com`
5. Copy the Script ID from the Apps Script project settings

## Fastest CLI path

Run this command once with your Script ID:

`npm run gas:deploy -- --script-id=YOUR_SCRIPT_ID --description="initial web app deployment"`

What the helper does:

1. Runs `npm run build:gas`
2. Creates `.clasp.json` automatically if it does not exist yet
3. Runs `clasp push`
4. Runs `clasp deploy`

## Push updates without creating a new deployment

Use this when you only want to upload the latest files:

`npm run gas:push -- --script-id=YOUR_SCRIPT_ID`

## Manual browser-based fallback

If you do not want to use `clasp`, you can still deploy manually:

1. Run `npm run build:gas`
2. Open `https://script.google.com`
3. Create a standalone Apps Script project
4. Copy these local files into the Apps Script editor:
   - `gas/Code.gs`
   - `gas/Index.html`
   - `gas/appsscript.json`
5. Deploy as a Web App

## Recommended Web App settings

1. Choose `Web app`
2. Set `Execute as` to `Me`
3. Set access to `Anyone with Google account` for internal use, or `Anyone` only if that is intentional

## Notes

- GAS HTML Service runs inside a sandboxed iframe, so drag-based camera control is safer than pointer lock.
- Rebuild from source instead of editing `gas/Index.html` by hand.
- The source of truth remains `index.html`, `main.js`, and any imported modules.
- If `.clasp.json` already exists, the helper reuses it and does not overwrite it.
