// The site's tabs: nothing of the app is reachable from the page; it can only tell it's running
// in TradePilot for Windows (window.tradepilotDesktop), e.g. to show desktop-only options later
"use strict";
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("tradepilotDesktop", Object.freeze({ isDesktop: true, platform: process.platform }));
