# TradePilot for Windows

The TradePilot site in its own app window, built like TradingView Desktop (Electron 45):

- A 34px title bar of our own: chart tabs showing each chart's symbol, price and change, "+" for a new
  tab, a new-window button, the main menu (⋯), and Windows' own minimise / maximise / close (with Snap
  layouts). Drag tabs to reorder; middle-click closes; right-click: reload, duplicate, copy link, move
  to a new window, close / close others / close to the right.
- Main menu: Settings, New tab, New window, Reopen closed tab, Open link from clipboard, Zoom, theme
  (System / Dark / Light, for the app and the charts), Exit.
- Keys: Ctrl+T new tab, Ctrl+W close, Ctrl+Tab / Ctrl+Shift+Tab, Ctrl+1…9, Ctrl+N new window,
  Ctrl+Shift+T reopen, Ctrl + / − / 0 zoom, Ctrl+, settings, F11 full screen, Ctrl+R / F5 reload,
  Ctrl+Shift+Q exit.
- Settings: start with Windows, restore tabs and windows, theme, zoom, hardware acceleration, clear
  cache, check for updates.
- Tabs and windows (and their size and place) come back as they were. One app at a time: opening it
  again (or a `tradepilot://chart?symbol=XAU/USD` link) goes to the open window.
- Each tab is its own sandboxed view; tabs in the background are throttled, so many charts stay light.
  The site's own links open as tabs, sign-in pop-ups (Google) as windows, other sites in the browser.
  Microphone (voice assistant), notifications and the clipboard are allowed for TradePilot only.

## Build

    cd desktop
    npm install
    npm run icon            # build/icon.png from the TradePilot mark (uses the site's Playwright)
    npm start               # run it (TRADEPILOT_URL=http://localhost:3006 for a local site)
    npm run dist            # dist/TradePilot-Setup-<version>.exe (one-click, per-user install)

Updates: the app checks `https://<site>/desktop/latest.yml` (electron-updater, generic provider).
Publishing a version = uploading `dist/latest.yml`, the Setup .exe and its .blockmap there.
The installer isn't code-signed yet, so Windows SmartScreen shows "More info → Run anyway".
