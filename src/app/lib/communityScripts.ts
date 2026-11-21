// Community scripts from TradingView's Editors' Picks, each published by its author as open source
// under the Mozilla Public License 2.0. Their source is served unchanged (with its licence notice)
// from /pine-community/<file>; this list names each one's author and where it was published.

// calcBars: a heavy script runs on the last this many bars by default (Settings → Calculated bars)
export interface CommunityScript { name: string; author: string; file: string; url: string; kind: "indicator" | "strategy"; calcBars?: number }

export const COMMUNITY_LICENSE = "Mozilla Public License 2.0";

export const COMMUNITY_SCRIPTS: CommunityScript[] = [
  {"name": "Adaptive Trend Classification: Moving Averages [InvestorUnknown]", "author": "InvestorUnknown", "file": "35c95ee61cd24dd09da740176b372203.pine", "url": "https://www.tradingview.com/script/L6NreqzB/", "kind": "indicator"},
  {"name": "Breakout Volume Delta | Flux Charts", "author": "fluxchart", "file": "aa1f1df5f3674130a549581bf813d403.pine", "url": "https://www.tradingview.com/script/BsWaPtEz/", "kind": "indicator"},
  {"name": "Bull Vs. Bear Market Intraday Sessions [Kioseff Trading]", "author": "KioseffTrading", "file": "0999ba6cd86e4709ad54bfa93034f5db.pine", "url": "https://www.tradingview.com/script/3mKewfnN/", "kind": "indicator"},
  {"name": "Central Bank Liquidity Gap Indicator", "author": "HenriqueCentieiro", "file": "19b5574bd1a045b68f53a21e9460c406.pine", "url": "https://www.tradingview.com/script/udTI2IUw/", "kind": "indicator"},
  {"name": "Chess", "author": "SimpleCryptoLife", "file": "329c24cf187a486e930b41e6252bda81.pine", "url": "https://www.tradingview.com/script/HmMDG0mr/", "kind": "indicator"},
  {"name": "Confluence Profile", "author": "Uncle_the_shooter", "file": "11389b59c18043daa2acf70cb5d333a3.pine", "url": "https://www.tradingview.com/script/ERScIMjp/", "kind": "indicator"},
  {"name": "CVD Profiles [TradingIQ]", "author": "Trading-IQ", "file": "40c3ad5b0fbe4ca487e7d24553b1f44f.pine", "url": "https://www.tradingview.com/script/zHFJQYwG/", "kind": "indicator"},
  {"name": "Delta Ladder [Kioseff Trading]", "author": "KioseffTrading", "file": "6afc58b73b28413097711c67c11b5b4c.pine", "url": "https://www.tradingview.com/script/EkBUz93v/", "kind": "indicator"},
  {"name": "FlowScope [Hapharmonic]", "author": "hapharmonic", "file": "fa948758017a45948ec2b0b40509ee12.pine", "url": "https://www.tradingview.com/script/0j7OWDAT/", "kind": "indicator"},
  {"name": "Focus Bars [Kioseff Trading]", "author": "KioseffTrading", "file": "476d976353d84805a9b87cd085c9c864.pine", "url": "https://www.tradingview.com/script/I0MhUmSK/", "kind": "indicator"},
  {"name": "Innovation Adaptive Kalman Filter Oscillator", "author": "jdehorty", "file": "781874de08bb4241b8584a6cd295d6ad.pine", "url": "https://www.tradingview.com/script/06GCx5qL/", "kind": "indicator"},
  {"name": "Intrabar Profile [Kioseff Trading]", "author": "KioseffTrading", "file": "f8b6df85e8cc440f84c04efb527f12fe.pine", "url": "https://www.tradingview.com/script/j38vuAvW/", "kind": "indicator"},
  {"name": "Intraday Spark Chart [AstrideUnicorn]", "author": "AstrideUnicorn", "file": "7f41f4924459414e821f38f9938e908e.pine", "url": "https://www.tradingview.com/script/k2bR8xoL/", "kind": "indicator"},
  {"name": "IQ Trend Beams [TradingIQ]", "author": "Trading-IQ", "file": "d27f40984ff94ffbbc7e3b5b1d04dcad.pine", "url": "https://www.tradingview.com/script/SG7Vk6uH/", "kind": "indicator", "calcBars": 250},
  {"name": "Kalman D7", "author": "et20tradeview", "file": "807bfbf7b139432c86d7eec612ed1cb9.pine", "url": "https://www.tradingview.com/script/c75aF3t1/", "kind": "indicator"},
  {"name": "Kinetic Slippage Index (KSI)", "author": "HPotter", "file": "1f2eeb5c0a4e4b21958387277cf8c6d5.pine", "url": "https://www.tradingview.com/script/CUjAnbtS/", "kind": "indicator"},
  {"name": "MACD with HTF Panels [theUltimator5]", "author": "TheUltimator5", "file": "8f868383ab3d43c98faba7767b72e544.pine", "url": "https://www.tradingview.com/script/pUwmpOyc/", "kind": "indicator"},
  {"name": "Machine Learning Pivot Points (KNN) [SS]", "author": "Steversteves", "file": "7b70a66734e242e381cf0922661fcc9c.pine", "url": "https://www.tradingview.com/script/PwVoxMSo/", "kind": "indicator"},
  {"name": "Market Cap Landscape 3D", "author": "hapharmonic", "file": "d30c3daa306e47289d71313e2302002f.pine", "url": "https://www.tradingview.com/script/WFCBSK6s/", "kind": "indicator"},
  {"name": "Market Structure Dashboard | Flux Charts", "author": "fluxchart", "file": "20572cf632f4435b9eb2a5551b4f5768.pine", "url": "https://www.tradingview.com/script/vXui7vrm/", "kind": "indicator"},
  {"name": "Market Structure Volume Profiles [Kioseff Trading]", "author": "KioseffTrading", "file": "3618b12a8f774c3b94a03205c3de3638.pine", "url": "https://www.tradingview.com/script/shy8kACw/", "kind": "indicator"},
  {"name": "Markov Chain [3D] | Fractalyst", "author": "Fractalyst", "file": "18a19d3c9ff249d3bdfb868a45234b57.pine", "url": "https://www.tradingview.com/script/yA0KOPDO/", "kind": "indicator"},
  {"name": "Match Finder [theUltimator5]", "author": "TheUltimator5", "file": "e537a3f7115345c59cc2c9b1deacfd9e.pine", "url": "https://www.tradingview.com/script/ddvP5qAZ/", "kind": "indicator"},
  {"name": "Multi Timeframe Volume Profiles [TradingIQ]", "author": "Trading-IQ", "file": "8dc2341311684048a062c31b10668cdd.pine", "url": "https://www.tradingview.com/script/qnX9nxw0/", "kind": "indicator"},
  {"name": "Multi-Ticker Anchored Candles", "author": "SamRecio", "file": "1d57cddd07dc47d0b5e55a8f66626c2b.pine", "url": "https://www.tradingview.com/script/ipvS7b7x/", "kind": "indicator"},
  {"name": "Options Max Pain Calculator [BackQuant]", "author": "BackQuant", "file": "c904837c16f243dba8ca6882b3368b34.pine", "url": "https://www.tradingview.com/script/vsPwh0vN/", "kind": "indicator"},
  {"name": "Pong", "author": "SamRecio", "file": "5d4a6bf71f96450a9d4cf51a8c61a537.pine", "url": "https://www.tradingview.com/script/SlrgQcx5/", "kind": "indicator"},
  {"name": "Pumori", "author": "et20tradeview", "file": "6d4006b89c2e4fbcb0551e6e00bfe691.pine", "url": "https://www.tradingview.com/script/yHpgAu7A/", "kind": "indicator"},
  {"name": "RedK DualTF Volume-Accelerated CCI", "author": "RedKTrader", "file": "c2fda830909b48d2b4f2bed289296549.pine", "url": "https://www.tradingview.com/script/lygT3bP0/", "kind": "indicator"},
  {"name": "RedK Indicator Amplifier v1.0", "author": "RedKTrader", "file": "b3b978fddf914d6d84dea1ad7b8fddd0.pine", "url": "https://www.tradingview.com/script/1cv4PUad/", "kind": "indicator"},
  {"name": "RedK Multi-Modal TrailingStop v1.0", "author": "RedKTrader", "file": "be8f3d9e32ca46e1b5d042f8f159d73a.pine", "url": "https://www.tradingview.com/script/ZxCXrnij/", "kind": "indicator"},
  {"name": "RSI Radar Multi Time Frame", "author": "LonesomeTheBlue", "file": "3d0adcd8588247bbadbc07068fc9d1ab.pine", "url": "https://www.tradingview.com/script/8UtWhfo3/", "kind": "indicator"},
  {"name": "Session Edge Profiler | Flux Charts", "author": "fluxchart", "file": "74d7271fe8b94ddf8ea8c8f59315d370.pine", "url": "https://www.tradingview.com/script/T1V41Bl5/", "kind": "indicator"},
  {"name": "Simple Decision Matrix Classification Algorithm [SS]", "author": "Steversteves", "file": "74ccf200a430478ead7e389c6fcfb6ea.pine", "url": "https://www.tradingview.com/script/WPbrh5SQ/", "kind": "indicator", "calcBars": 300},
  {"name": "Simplified Percentile Clustering", "author": "InvestorUnknown", "file": "53c863aae2cd439a9d1a24612b29c3d3.pine", "url": "https://www.tradingview.com/script/mdGJq4j5/", "kind": "indicator"},
  {"name": "Smooth Theil-Sen", "author": "The_Peaceful_Lizard", "file": "aa781c2985c94e5fa6ac73007f60973a.pine", "url": "https://www.tradingview.com/script/ewWysgGk/", "kind": "indicator"},
  {"name": "Stop Loss Clustering (Breakouts) [Kioseff Trading]", "author": "KioseffTrading", "file": "c6388de20b7b4c068127ad3b7518ddce.pine", "url": "https://www.tradingview.com/script/CJX3k6l2/", "kind": "indicator"},
  {"name": "Swing Structure Forecast [BOSWaves]", "author": "BOSWaves", "file": "265b5fa74bc64c099ba60a75a57df35d.pine", "url": "https://www.tradingview.com/script/Ft4zyO1F/", "kind": "indicator"},
  {"name": "T-Virus Sentiment [hapharmonic]", "author": "hapharmonic", "file": "854458ba330042c5a7bd73ff39dbdf2e.pine", "url": "https://www.tradingview.com/script/jpbq3J0S/", "kind": "indicator"},
  {"name": "Tick CVD [Kioseff Trading]", "author": "KioseffTrading", "file": "ab500ae4e4254689acd9c7ceabb81bc7.pine", "url": "https://www.tradingview.com/script/moMbNm8e/", "kind": "indicator"},
  {"name": "Time & Sales (Tape) [By MUQWISHI]", "author": "MUQWISHI", "file": "d4e05769407d4bcda4f16ec5a69df766.pine", "url": "https://www.tradingview.com/script/IZnarK90/", "kind": "indicator"},
  {"name": "Trend Target Ribbon [BOSWaves]", "author": "BOSWaves", "file": "9ba1c817ad4f49a1870aaf877d6836de.pine", "url": "https://www.tradingview.com/script/tnQ7FvvW/", "kind": "indicator"},
  {"name": "Vdubus Pattern Gen V2 [Restored & Refined]", "author": "vdubus", "file": "66dc68412e0548f4bd73df9177febb7b.pine", "url": "https://www.tradingview.com/script/fi2LLSGz/", "kind": "indicator"},
  {"name": "Vol-Control Fund Positioning", "author": "EdgeTools", "file": "67ca00ab997a4caea983a2b6898bd5ad.pine", "url": "https://www.tradingview.com/script/5gHQJXjj/", "kind": "indicator"},
  {"name": "Volatility Risk Premium", "author": "EdgeTools", "file": "579c41b76d4d497ba94eccd958f0e96a.pine", "url": "https://www.tradingview.com/script/UJgVgUvT/", "kind": "indicator"},
  {"name": "Volume Spread Analysis IQ [TradingIQ]", "author": "Trading-IQ", "file": "2eccde8d8fb44f7287d91c53fec1664d.pine", "url": "https://www.tradingview.com/script/9MpC4ifP/", "kind": "indicator"},
  {"name": "VWAP Price Channel", "author": "SamRecio", "file": "61fc0dbb24854b5788c601d0f3a6818d.pine", "url": "https://www.tradingview.com/script/Psnjpa2Y/", "kind": "indicator"},
  {"name": "Whale Liquidity and Absorption Profile [AlgoAlpha]", "author": "AlgoAlpha", "file": "f799214ad7f14c1ba35f5ce04ab7c640.pine", "url": "https://www.tradingview.com/script/cWm8UcfQ/", "kind": "indicator"},
  {"name": "Wyckoff Schematic by Kingshuk Ghosh", "author": "kingshukghosh71", "file": "2294300b883341df98a4a7d7213579b3.pine", "url": "https://www.tradingview.com/script/gQynUonZ/", "kind": "indicator"},
];

export const communityScriptByName = (name: string) => COMMUNITY_SCRIPTS.find((s) => s.name === name);
