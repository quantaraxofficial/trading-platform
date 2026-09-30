// "Open built-in script": TradingView's classic built-ins, as Pine v6 source this app's Pine
// engine runs (each one is checked against the engine; built-ins it can't run aren't listed).

export interface BuiltinScript { name: string; type: "indicator" | "strategy"; code: string }

const src = (s: string) => s.replace(/^\n/, "");

export const BUILTIN_SCRIPTS: BuiltinScript[] = [
  { name: "Average True Range", type: "indicator", code: src(`
//@version=6
indicator(title="Average True Range", shorttitle="ATR", overlay=false, timeframe="", timeframe_gaps=true)
length = input.int(title="Length", defval=14, minval=1)
plot(ta.atr(length), title = "ATR", color=color.new(#B71C1C, 0))
`) },
  { name: "Awesome Oscillator", type: "indicator", code: src(`
//@version=6
indicator(title="Awesome Oscillator", shorttitle="AO", timeframe="", timeframe_gaps=true)
ao = ta.sma(hl2,5) - ta.sma(hl2,34)
diff = ao - ao[1]
plot(ao, color = diff <= 0 ? #F44336 : #009688, style = plot.style_columns)
changeToGreen = ta.crossover(diff, 0)
changeToRed = ta.crossunder(diff, 0)
alertcondition(changeToGreen, title = "AO color changed to green", message = "Awesome Oscillator's bars has changed to green")
alertcondition(changeToRed, title = "AO color changed to red", message = "Awesome Oscillator's bars has changed to red")
`) },
  { name: "Bull Bear Power", type: "indicator", code: src(`
//@version=6
indicator(title="Bull Bear Power", shorttitle="BBPower", overlay=false, format=format.price, precision=2, timeframe="", timeframe_gaps=true)
lengthInput = input.int(13, title="Length")
bullPower = high - ta.ema(close, lengthInput)
bearPower = low - ta.ema(close, lengthInput)
plot(bullPower + bearPower, title="BBPower", color=#2962FF, style=plot.style_columns)
`) },
  { name: "Donchian Channels", type: "indicator", code: src(`
//@version=6
indicator(title="Donchian Channels", shorttitle="DC", overlay=true, timeframe="", timeframe_gaps=true)
length = input.int(20, minval = 1)
lower = ta.lowest(length)
upper = ta.highest(length)
basis = math.avg(upper, lower)
plot(basis, "Basis", color = #FF6D00)
u = plot(upper, "Upper", color = #2962FF)
l = plot(lower, "Lower", color = #2962FF)
fill(u, l, color = color.rgb(33, 150, 243, 95), title = "Background")
`) },
  { name: "MACD", type: "indicator", code: src(`
//@version=6
indicator(title="Moving Average Convergence Divergence", shorttitle="MACD", timeframe="", timeframe_gaps=true)
fast_length = input(title = "Fast Length", defval = 12)
slow_length = input(title = "Slow Length", defval = 26)
src = input(title = "Source", defval = close)
signal_length = input.int(title = "Signal Smoothing",  minval = 1, maxval = 50, defval = 9)
fast_ma = ta.ema(src, fast_length)
slow_ma = ta.ema(src, slow_length)
macd = fast_ma - slow_ma
signal = ta.ema(macd, signal_length)
hist = macd - signal
hline(0, "Zero Line", color = color.new(#787B86, 50))
plot(hist, title = "Histogram", style = plot.style_columns, color = (hist >= 0 ? (hist[1] < hist ? #26A69A : #B2DFDB) : (hist[1] < hist ? #FFCDD2 : #FF5252)))
plot(macd,   title = "MACD",   color = #2962FF)
plot(signal, title = "Signal", color = #FF6D00)
`) },
  { name: "Momentum", type: "indicator", code: src(`
//@version=6
indicator(title="Momentum", shorttitle="Mom", timeframe="", timeframe_gaps=true)
len = input.int(10, minval=1, title="Length")
src = input(close, title="Source")
mom = src - src[len]
plot(mom, color=#2962FF, title="MOM")
`) },
  { name: "Moving Average Exponential", type: "indicator", code: src(`
//@version=6
indicator(title="Moving Average Exponential", shorttitle="EMA", overlay=true, timeframe="", timeframe_gaps=true)
len = input.int(9, minval=1, title="Length")
src = input(close, title="Source")
out = ta.ema(src, len)
plot(out, title="EMA", color=color.blue)
`) },
  { name: "Moving Average Simple", type: "indicator", code: src(`
//@version=6
indicator(title="Moving Average Simple", shorttitle="SMA", overlay=true, timeframe="", timeframe_gaps=true)
len = input.int(9, minval=1, title="Length")
src = input(close, title="Source")
out = ta.sma(src, len)
plot(out, color=color.blue, title="MA")
`) },
  { name: "Price Channel", type: "indicator", code: src(`
//@version=6
indicator("Price Channel", shorttitle="PC", overlay=true)
length = input.int(20, minval=1)
hh = ta.highest(high, length)
ll = ta.lowest(low, length)
plot(hh, color=#F50057, title="Highest High")
plot(ll, color=#F50057, title="Lowest Low")
plot(math.avg(hh, ll), color=#2962FF, title="Mid")
`) },
  { name: "Rate Of Change", type: "indicator", code: src(`
//@version=6
indicator(title="Rate Of Change", shorttitle="ROC", format=format.price, precision=2, timeframe="", timeframe_gaps=true)
length = input.int(9, minval=1)
source = input(close, "Source")
roc = 100 * (source - source[length])/source[length]
plot(roc, color=#2962FF, title="ROC")
hline(0, color=#787B86, title="Zero Line")
`) },
  { name: "Relative Strength Index", type: "indicator", code: src(`
//@version=6
indicator(title="Relative Strength Index", shorttitle="RSI", format=format.price, precision=2, timeframe="", timeframe_gaps=true)
rsiLengthInput = input.int(14, minval=1, title="RSI Length")
rsiSourceInput = input.source(close, "Source")
rsi = ta.rsi(rsiSourceInput, rsiLengthInput)
plot(rsi, "RSI", color=#7E57C2)
rsiUpperBand = hline(70, "RSI Upper Band", color=#787B86)
hline(50, "RSI Middle Band", color=color.new(#787B86, 50))
rsiLowerBand = hline(30, "RSI Lower Band", color=#787B86)
fill(rsiUpperBand, rsiLowerBand, color=color.rgb(126, 87, 194, 90), title="RSI Background Fill")
`) },
  { name: "Volume", type: "indicator", code: src(`
//@version=6
indicator(title="Volume", shorttitle="Vol", format=format.volume)
plot(volume, color = close >= open ? color.new(#26A69A, 50) : color.new(#EF5350, 50), style=plot.style_columns, title="Volume")
`) },
  { name: "Williams %R", type: "indicator", code: src(`
//@version=6
indicator("Williams Percent Range", shorttitle="Williams %R", format=format.price, precision=2, timeframe="", timeframe_gaps=true)
length = input(title="Length", defval=14)
src = input(close, "Source")
_pr(length) =>
	max = ta.highest(length)
	min = ta.lowest(length)
	100 * (src - max) / (max - min)
percentR = _pr(length)
obPlot = hline(-20, title="Upper Band", color=#787B86)
hline(-50, title="Middle Level", linestyle=hline.style_dotted, color=#787B86)
osPlot = hline(-80, title="Lower Band", color=#787B86)
fill(obPlot, osPlot, title="Background", color=color.rgb(126, 87, 194, 90))
plot(percentR, title="%R", color=#7E57C2)
`) },
  { name: "InSide Bar Strategy", type: "strategy", code: src(`
//@version=6
strategy("InSide Bar Strategy", overlay=true)
if (high < high[1] and low > low[1])
	if (close > open)
		strategy.entry("InsBarLE", strategy.long, comment="InsBarLE")
	if (close < open)
		strategy.entry("InsBarSE", strategy.short, comment="InsBarSE")
`) },
  { name: "MACD Strategy", type: "strategy", code: src(`
//@version=6
strategy("MACD Strategy", overlay=true)
fastLength = input(12)
slowlength = input(26)
MACDLength = input(9)
MACD = ta.ema(close, fastLength) - ta.ema(close, slowlength)
aMACD = ta.ema(MACD, MACDLength)
delta = MACD - aMACD
if (ta.crossover(delta, 0))
	strategy.entry("MacdLE", strategy.long, comment="MacdLE")
if (ta.crossunder(delta, 0))
	strategy.entry("MacdSE", strategy.short, comment="MacdSE")
`) },
  { name: "MovingAvg Cross", type: "strategy", code: src(`
//@version=6
strategy("MovingAvg Cross", overlay=true)
length = input(9)
confirmBars = input(1)
price = close
ma = ta.sma(price, length)
bcond = price > ma
bcount = 0
bcount := bcond ? nz(bcount[1]) + 1 : 0
if (bcount == confirmBars)
	strategy.entry("MACrossLE", strategy.long, comment="MACrossLE")
scond = price < ma
scount = 0
scount := scond ? nz(scount[1]) + 1 : 0
if (scount == confirmBars)
	strategy.entry("MACrossSE", strategy.short, comment="MACrossSE")
`) },
  { name: "MovingAvg2Line Cross", type: "strategy", code: src(`
//@version=6
strategy("MovingAvg2Line Cross", overlay=true)
fastLength = input(9)
slowLength = input(18)
price = close
mafast = ta.sma(price, fastLength)
maslow = ta.sma(price, slowLength)
if (ta.crossover(mafast, maslow))
	strategy.entry("MA2CrossLE", strategy.long, comment="MA2CrossLE")
if (ta.crossunder(mafast, maslow))
	strategy.entry("MA2CrossSE", strategy.short, comment="MA2CrossSE")
`) },
  { name: "Outside Bar Strategy", type: "strategy", code: src(`
//@version=6
strategy("Outside Bar Strategy", overlay=true)
if (high > high[1] and low < low[1])
	if (close > open)
		strategy.entry("OutBarLE", strategy.long, comment="OutBarLE")
	if (close < open)
		strategy.entry("OutBarSE", strategy.short, comment="OutBarSE")
`) },
  { name: "RSI Strategy", type: "strategy", code: src(`
//@version=6
strategy("RSI Strategy", overlay=true)
length = input( 14 )
overSold = input( 30 )
overBought = input( 70 )
price = close
vrsi = ta.rsi(price, length)
co = ta.crossover(vrsi, overSold)
cu = ta.crossunder(vrsi, overBought)
if (not na(vrsi))
	if (co)
		strategy.entry("RsiLE", strategy.long, comment="RsiLE")
	if (cu)
		strategy.entry("RsiSE", strategy.short, comment="RsiSE")
`) },
];
