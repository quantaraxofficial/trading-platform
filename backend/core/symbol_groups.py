"""Symbols as the leaderboard groups them: one name per instrument whatever the broker or data feed
calls it (XAUUSD+, XAU/USD, OANDA:XAUUSD, XAUUSD.r, xauusdm, GOLD → XAUUSD), and its market:
forex, metals, crypto, indices, energies, or stocks & others."""
import re

CURRENCIES = {"USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "SEK", "NOK", "DKK", "ZAR", "MXN", "SGD", "HKD", "TRY", "PLN",
              "CNH", "CNY", "HUF", "CZK", "ILS", "INR", "RUB", "THB", "KRW", "BRL"}
METALS = ("XAU", "XAG", "XPT", "XPD")
CRYPTO = ("BTC", "ETH", "SOL", "XRP", "LTC", "DOGE", "ADA", "BNB", "DOT", "AVAX", "LINK", "TRX", "MATIC", "SHIB", "BCH", "XLM", "TON", "PEPE")
INDICES = ("US30", "US500", "US100", "NAS100", "USTEC", "SPX", "SPX500", "NDX", "DJI", "DJ30", "GER40", "GER30", "DE40", "DE30", "DAX",
           "UK100", "FTSE", "JP225", "JPN225", "NIK225", "HK50", "HSI", "FRA40", "CAC40", "AUS200", "ASX200", "US2000", "RUSSELL", "EU50",
           "STOXX50", "ESP35", "IT40", "CHINA50", "CN50", "NIFTY", "BANKNIFTY", "SENSEX", "VIX")
ENERGIES = ("USOIL", "UKOIL", "WTI", "BRENT", "XTIUSD", "XBRUSD", "XNGUSD", "NGAS", "NATGAS", "CL", "OIL", "GASOLINE")
ALIASES = {"GOLD": "XAUUSD", "SILVER": "XAGUSD", "PLATINUM": "XPTUSD", "PALLADIUM": "XPDUSD", "BITCOIN": "BTCUSD", "ETHEREUM": "ETHUSD",
           "SP500": "US500", "SPX500": "US500", "SPX": "US500", "NAS100": "US100", "USTEC": "US100", "NDX": "US100", "DJ30": "US30",
           "DJI": "US30", "GER30": "GER40", "DE40": "GER40", "DE30": "GER40", "DAX": "GER40", "XTIUSD": "USOIL", "WTI": "USOIL",
           "XBRUSD": "UKOIL", "BRENT": "UKOIL"}
GROUPS = [("forex", "Forex (currencies)"), ("metals", "Metals"), ("crypto", "Crypto"), ("indices", "Indices"), ("energies", "Energies"),
          ("other", "Stocks & others")]
GROUP_NAMES = dict(GROUPS)


def normalize(sym):
    """One name per instrument: XAU/USD, OANDA:XAUUSD, XAUUSD+, XAUUSD.r, xauusdm, GOLD → XAUUSD"""
    s = str(sym or "").strip()
    if not s:
        return ""
    s = s.split(":")[-1].strip()
    s = re.sub(r"^([A-Za-z]{2,6})[/\- ]([A-Za-z]{3,4})", r"\1\2", s)   # XAU/USD, BTC-USD
    s = re.sub(r"[.+#!_][A-Za-z0-9]{0,4}$", "", s)                       # a broker's suffix: .r .pro .cash + _i
    # (a lowercase suffix a broker adds to an upper-case name: EURUSDm, XAUUSDpro)
    m = re.match(r"^([A-Z0-9]{3,})([a-z]{1,4})$", s)
    if m:
        s = m.group(1)
    s = re.sub(r"[^A-Za-z0-9]", "", s).upper()
    # (a pair with a broker's letters after it: GBPJPYM, XAUUSDPRO → GBPJPY, XAUUSD)
    if 6 < len(s) <= 10 and s[6:].isalpha() and (s[:3] in CURRENCIES or s[:3] in METALS) and s[3:6] in CURRENCIES:
        s = s[:6]
    if s.endswith("USDT") and s[:-4] in CRYPTO:
        s = s[:-4] + "USD"
    return ALIASES.get(s, s)


def group_of(sym):
    s = normalize(sym)
    if not s:
        return "other"
    if s.startswith(METALS):
        return "metals"
    if s.startswith(CRYPTO):
        return "crypto"
    if s in INDICES or s.startswith(("US30", "US500", "US100", "GER40", "UK100", "JP225", "HK50")):
        return "indices"
    if s in ENERGIES or s in ("USOIL", "UKOIL"):
        return "energies"
    if len(s) == 6 and s[:3] in CURRENCIES and s[3:] in CURRENCIES:
        return "forex"
    return "other"


def matches(sym, market):
    """market: '' (all), a group id, or a symbol"""
    if not market:
        return True
    if market in GROUP_NAMES:
        return group_of(sym) == market
    return normalize(sym) == normalize(market)
