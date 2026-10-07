// Built-in indicators written in Pine and run by our engine (pineScriptEngine.ts), each as its own
// instance on the chart with its own settings. Our own scripts, from the indicators' standard
// published formulas; options and default colors follow TradingView's versions.

export interface PineIndicator { name: string; code: string }

const VWAP = `//@version=6
indicator("Volume Weighted Average Price", shorttitle = "VWAP", overlay = true)
hideOnDWM = input.bool(false, "Hide VWAP on 1D or above", group = "VWAP settings")
anchor = input.string("Session", "Anchor period", options = ["Session", "Week", "Month", "Quarter", "Year", "Decade", "Century"], group = "VWAP settings")
src = input.source(hlc3, "Source", group = "VWAP settings")
offset = input.int(0, "Offset", minval = 0, group = "VWAP settings")
mode = input.string("Standard Deviation", "Bands calculation mode", options = ["Standard Deviation", "Percentage"], group = "Bands settings")
show1 = input.bool(true, "Band #1", group = "Bands settings")
mult1 = input.float(1.0, "Bands multiplier #1", step = 0.5, minval = 0, group = "Bands settings")
show2 = input.bool(false, "Band #2", group = "Bands settings")
mult2 = input.float(2.0, "Bands multiplier #2", step = 0.5, minval = 0, group = "Bands settings")
show3 = input.bool(false, "Band #3", group = "Bands settings")
mult3 = input.float(3.0, "Bands multiplier #3", step = 0.5, minval = 0, group = "Bands settings")

newPeriod = switch anchor
    "Session" => timeframe.change("D")
    "Week" => timeframe.change("W")
    "Month" => timeframe.change("M")
    "Quarter" => timeframe.change("3M")
    "Year" => timeframe.change("12M")
    "Decade" => timeframe.change("12M") and year % 10 == 0
    "Century" => timeframe.change("12M") and year % 100 == 0
    => false
if na(src[1])
    newPeriod := true

float v = na
float u1 = na
float l1 = na
float u2 = na
float l2 = na
float u3 = na
float l3 = na
if not (hideOnDWM and timeframe.isdwm)
    [w, upper, _] = ta.vwap(src, newPeriod, 1)
    basis = mode == "Standard Deviation" ? upper - w : w * 0.01
    v := w
    u1 := w + basis * mult1
    l1 := w - basis * mult1
    u2 := w + basis * mult2
    l2 := w - basis * mult2
    u3 := w + basis * mult3
    l3 := w - basis * mult3

plot(v, "VWAP", color = #2962FF, offset = offset)
pu1 = plot(u1, "Upper Band #1", color = #4CAF50, offset = offset, display = show1 ? display.all : display.none)
pl1 = plot(l1, "Lower Band #1", color = #4CAF50, offset = offset, display = show1 ? display.all : display.none)
fill(pu1, pl1, color = color.new(#4CAF50, 95), title = "Bands Fill #1", display = show1 ? display.all : display.none)
pu2 = plot(u2, "Upper Band #2", color = #808000, offset = offset, display = show2 ? display.all : display.none)
pl2 = plot(l2, "Lower Band #2", color = #808000, offset = offset, display = show2 ? display.all : display.none)
fill(pu2, pl2, color = color.new(#808000, 95), title = "Bands Fill #2", display = show2 ? display.all : display.none)
pu3 = plot(u3, "Upper Band #3", color = #00897B, offset = offset, display = show3 ? display.all : display.none)
pl3 = plot(l3, "Lower Band #3", color = #00897B, offset = offset, display = show3 ? display.all : display.none)
fill(pu3, pl3, color = color.new(#00897B, 95), title = "Bands Fill #3", display = show3 ? display.all : display.none)
`;

const ICHIMOKU = `//@version=6
indicator("Ichimoku Cloud", shorttitle = "Ichimoku", overlay = true)
conversionLength = input.int(9, "Conversion Line length", minval = 1)
baseLength = input.int(26, "Base Line length", minval = 1)
spanBLength = input.int(52, "Leading Span B length", minval = 1)
displacement = input.int(26, "Lagging Span", minval = 1)

midpoint(len) => math.avg(ta.lowest(len), ta.highest(len))
conversion = midpoint(conversionLength)
base = midpoint(baseLength)
spanA = math.avg(conversion, base)
spanB = midpoint(spanBLength)

plot(conversion, "Conversion Line", color = #2962FF)
plot(base, "Base Line", color = #B71C1C)
plot(close, "Lagging Span", color = #43A047, offset = -displacement + 1)
a = plot(spanA, "Leading Span A", color = #A5D6A7, offset = displacement - 1)
b = plot(spanB, "Leading Span B", color = #EF9A9A, offset = displacement - 1)
fill(a, b, color = spanA > spanB ? color.rgb(67, 160, 71, 90) : color.rgb(244, 67, 54, 90), title = "Kumo Cloud")
`;

const PIVOTS = `//@version=6
indicator("Pivot Points Standard", shorttitle = "Pivots", overlay = true, max_lines_count = 500, max_labels_count = 500)
pivotType = input.string("Traditional", "Type", options = ["Traditional", "Fibonacci", "Woodie", "Classic", "DM", "Camarilla"])
anchorInput = input.string("Auto", "Pivots timeframe", options = ["Auto", "Daily", "Weekly", "Monthly", "Quarterly", "Yearly"])
maxBack = input.int(15, "Number of pivots back", minval = 1, maxval = 200)
showLabels = input.bool(true, "Show labels", group = "Labels")
showPrices = input.bool(true, "Show prices", group = "Labels")
labelSide = input.string("Left", "Labels position", options = ["Left", "Right"], group = "Labels")
lineWidth = input.int(1, "Line width", minval = 1, maxval = 10, group = "Levels")
levelColor = input.color(#FB8C00, "Color", group = "Levels")

pivotTf = switch anchorInput
    "Daily" => "D"
    "Weekly" => "W"
    "Monthly" => "M"
    "Quarterly" => "3M"
    "Yearly" => "12M"
    => timeframe.isintraday ? (timeframe.multiplier <= 15 ? "D" : "W") : timeframe.isdaily ? "M" : "12M"

type level
    line ln
    label lb

newPeriod = timeframe.change(pivotTf)
levels = ta.pivot_point_levels(pivotType, newPeriod)
names = array.from("P", "R1", "S1", "R2", "S2", "R3", "S3", "R4", "S4", "R5", "S5")
var matrix<level> drawn = matrix.new<level>()

// Ends the last period's lines at the start of the new one
closeLast(int endTime) =>
    if drawn.rows() > 0
        for g in drawn.row(drawn.rows() - 1)
            g.ln.set_x2(endTime)
            if labelSide == "Right"
                g.lb.set_x(endTime)

if newPeriod and bar_index > 0
    closeLast(time)
    endTime = time_close(pivotTf)
    row = array.new<level>()
    for [i, v] in levels
        if not na(v)
            txt = (showLabels ? names.get(i) + " " : "") + (showPrices ? "(" + str.tostring(v, format.mintick) + ")" : "")
            ln = line.new(time, v, endTime, v, xloc = xloc.bar_time, color = levelColor, width = lineWidth)
            lb = label.new(labelSide == "Left" ? time : endTime, v, txt, xloc = xloc.bar_time, style = labelSide == "Left" ? label.style_label_right : label.style_label_left, color = #00000000, textcolor = levelColor)
            row.push(level.new(ln, lb))
    if row.size() > 0
        drawn.add_row(array_id = row)
        if drawn.rows() > maxBack
            for g in drawn.remove_row(0)
                g.ln.delete()
                g.lb.delete()
`;

export const PINE_INDICATORS: PineIndicator[] = [
  { name: "Volume Weighted Average Price", code: VWAP },
  { name: "Ichimoku Cloud", code: ICHIMOKU },
  { name: "Pivot Points Standard", code: PIVOTS },
];

export const pineIndicatorByName = (name: string) => PINE_INDICATORS.find((i) => i.name === name);
