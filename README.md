# Artale EXP Tracker

A browser-based EXP efficiency tracker for Artale in MapleStory Worlds. Captures your game screen, reads the EXP bar via OCR, and shows real-time leveling stats.

**Live:** https://chipicocoa.github.io/artale-efficiency/

## Features

- **Screen capture** — shares your game window via browser API
- **OCR** — reads EXP text like `101767108[72.89%]` using Tesseract.js
- **Crop region** — zoom in and select just the EXP numbers for accurate reading
- **Dashboard** — current EXP, EXP/10min, EXP/hour, time to level, session stats
- **EXP rate chart** — line chart showing EXP/hour over time
- **Picture-in-Picture** — pop out a compact overlay to float over your game
- **Outlier filter** — automatically discards OCR misreads
- **Configurable interval** — sample every 0.5s to 60s

## Usage

1. Open the app in **Chrome or Edge**
2. Click **Start Tracking** and share your game window
3. Open **Settings** → **Set Region** → scroll to zoom in → drag to select the EXP numbers
4. Watch the dashboard update in real time
5. Optionally click **Pop Out** for an always-on-top overlay

## Requirements

- Chromium browser (Chrome / Edge) — required for `getDisplayMedia` and Document Picture-in-Picture API
- No server needed — runs entirely in the browser

## Dev

```bash
pnpm install
pnpm run dev
```

## Build

```bash
pnpm run build
```

## Test

```bash
pnpm run test
```

## Tech Stack

- React + TypeScript + Vite
- Tesseract.js (WASM OCR)
- Recharts
- Document Picture-in-Picture API
