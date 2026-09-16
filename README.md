# 📖 Dumdum Viewer

The no-fuss Markdown viewer — built for people who just want to open a `.md` file and read it, no technical setup required.

**Live demo:** enable GitHub Pages (see below) and it'll be at `https://<your-username>.github.io/dumdum-viewer/`

## Features

- **Open a file or a whole folder** straight from your computer — nothing is uploaded anywhere, everything stays local in your browser.
- **Recent Files history** — remembers files you've opened, even after closing the browser (uses IndexedDB + the File System Access API).
- **Pretty View / Plain Text toggle** — a big, obvious switch between rendered Markdown and raw text.
- **Four themes** — Daylight, Midnight, Cozy Cream, Ocean Calm.
- **Built-in guide** — a friendly step-by-step walkthrough on first visit, re-openable any time via the ❓ HELP! button.
- **Zero build step** — plain HTML/CSS/JS, deploys straight to GitHub Pages.

## Browser support

Folder access and "remember my recent files" use the **File System Access API**, currently supported in Chromium-based browsers (Chrome, Edge, Opera, Brave). In other browsers (Firefox, Safari) you can still open single files via the fallback file picker — they just won't be remembered between visits.

## Deploying to GitHub Pages

1. Push this repo to GitHub (see below).
2. Go to **Settings → Pages** on the repo.
3. Under "Build and deployment", set **Source** to `Deploy from a branch`.
4. Pick the `main` branch and `/ (root)` folder, then Save.
5. Your site will be live at `https://<your-username>.github.io/<repo-name>/` within a minute or two.

## Local development

No build tools needed — just open `index.html` in a browser, or serve the folder locally:

```
npx serve .
```

## Privacy

Your files never leave your machine. There's no backend, no analytics, no uploads — everything (file contents, recent-file handles, theme choice) is stored locally in your own browser via IndexedDB and localStorage.
