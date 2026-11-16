import SwiftUI
import Charts

// TradingView's ranges, each from a timeframe that gives it enough points
private enum Range: String, CaseIterable, Identifiable {
    case d1 = "1D", d5 = "5D", m1 = "1M", m3 = "3M", m6 = "6M", ytd = "YTD", y1 = "1Y", y5 = "5Y", all = "All"
    var id: String { rawValue }
    var interval: String { switch self { case .d1: "5min"; case .d5: "30min"; case .m1: "2h"; case .m3, .m6, .ytd, .y1: "1day"; case .y5: "1week"; case .all: "1month" } }
    var days: Int { switch self { case .d1: 1; case .d5: 5; case .m1: 31; case .m3: 92; case .m6: 183; case .ytd: -1; case .y1: 366; case .y5: 1830; case .all: 0 } }
}

// A symbol's page: price and change, the range's chart, Chart and Trade, key stats
struct SymbolView: View {
    let symbol: String
    @EnvironmentObject var bridge: Bridge
    @EnvironmentObject var nav: AppNav
    @State private var range: Range = .d1
    @State private var bars: [Bar]?
    @State private var daily: [Bar]?

    var body: some View {
        let q = bridge.quotes[symbol]
        let inList = bridge.activeList?.symbols.contains(symbol) ?? false
        let last = q?.last ?? daily?.last?.c
        let prev = q?.prevClose ?? (daily.map { $0.count >= 2 ? $0[$0.count - 2].c : nil } ?? nil)
        let change = q?.change ?? ((last != nil && prev != nil) ? last! - prev! : nil)
        let pct = q?.changePct ?? ((change != nil && prev != nil && prev! != 0) ? change! / prev! * 100 : nil)

        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 12) {
                        SymbolBadge(symbol: symbol, size: 40)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(q?.name.isEmpty == false ? q!.name : symbol).font(.title3.weight(.semibold)).lineLimit(1)
                            Text([symbol, q?.exchange ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    HStack(alignment: .lastTextBaseline, spacing: 6) {
                        Text(Fmt.price(last)).font(.system(size: 34, weight: .bold))
                        Text(q?.currency ?? "").font(.subheadline).foregroundStyle(.secondary)
                    }
                    HStack(spacing: 8) {
                        Text("\(Fmt.change(change, price: last))  \(Fmt.pct(pct))").font(.subheadline.weight(.medium)).foregroundStyle(Tp.changeColor(change))
                        Text(q?.marketOpen == true ? "market open" : "at close").font(.footnote).foregroundStyle(.secondary)
                    }

                    Group {
                        if let bars {
                            if bars.count < 2 { Text("No data for this range").foregroundStyle(.secondary) }
                            else { AreaChart(bars: bars) }
                        } else { ProgressView().tint(Tp.purple) }
                    }
                    .frame(maxWidth: .infinity, minHeight: 230, maxHeight: 230)

                    HStack {
                        ForEach(Range.allCases) { r in
                            Button { range = r } label: {
                                Text(r.rawValue).font(.footnote.weight(r == range ? .semibold : .regular))
                                    .foregroundStyle(r == range ? .primary : .secondary)
                                    .padding(.horizontal, 7).padding(.vertical, 6)
                                    .background(r == range ? Color(.secondarySystemBackground) : .clear).clipShape(RoundedRectangle(cornerRadius: 6))
                            }
                            if r != .all { Spacer(minLength: 0) }
                        }
                    }

                    HStack(spacing: 10) {
                        Button { nav.chart(symbol) } label: { Text("Chart").font(.headline).frame(maxWidth: .infinity).frame(height: 46) }
                            .buttonStyle(.bordered).tint(.primary)
                        Button { nav.toChart("trade"); Bridge.shared.setSymbol(symbol) } label: { Text("Trade").font(.headline).frame(maxWidth: .infinity).frame(height: 46) }
                            .buttonStyle(.borderedProminent).tint(Tp.purple)
                    }
                    .padding(.vertical, 6)

                    Text("Key stats").font(.headline).padding(.top, 6)
                    stat("Open", Fmt.price(q?.open ?? daily?.last?.o))
                    stat("Day's high", Fmt.price(q?.high ?? daily?.last?.h))
                    stat("Day's low", Fmt.price(q?.low ?? daily?.last?.l))
                    stat("Previous close", Fmt.price(prev))
                    if let v = q?.volume, v > 0 { stat("Volume", Fmt.volume(v)) }
                }
                .padding(16)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button { nav.symbol = nil } label: { Image(systemName: "chevron.down") } }
                ToolbarItem(placement: .primaryAction) {
                    Button { bridge.send(inList ? "removeSymbol" : "addSymbol", ["symbol": symbol]) } label: {
                        Image(systemName: inList ? "star.fill" : "star").foregroundStyle(inList ? .yellow : .primary)
                    }
                }
            }
            .task(id: range) {
                bars = nil
                let all = await bridge.series(symbol, range.interval)
                bars = cut(all, range)
            }
            .task(id: symbol) { if bridge.quotes[symbol] == nil { daily = await bridge.series(symbol, "1day") } }
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(spacing: 10) {
            HStack { Text(label).foregroundStyle(.secondary); Spacer(); Text(value).fontWeight(.medium) }.font(.subheadline)
            Divider()
        }
    }

    private func cut(_ all: [Bar], _ r: Range) -> [Bar] {
        guard let end = all.last?.t, r.days != 0 else { return all }
        var from = end - Double(r.days) * 86400
        if r.days < 0 {
            var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "UTC")!
            let y = cal.component(.year, from: Date(timeIntervalSince1970: end))
            from = cal.date(from: DateComponents(year: y, month: 1, day: 1))?.timeIntervalSince1970 ?? from
        }
        return all.filter { $0.t >= from }
    }
}

// TradingView's symbol-page chart: a line over a fading fill, green when the range rose, red when it fell
private struct AreaChart: View {
    let bars: [Bar]
    var body: some View {
        let up = (bars.last?.c ?? 0) >= (bars.first?.c ?? 0)
        let color = up ? Tp.up : Tp.down
        let lo = bars.map(\.c).min() ?? 0, hi = bars.map(\.c).max() ?? 1
        Chart {
            ForEach(Array(bars.enumerated()), id: \.offset) { i, b in
                AreaMark(x: .value("i", i), yStart: .value("lo", lo), yEnd: .value("c", b.c))
                    .foregroundStyle(LinearGradient(colors: [color.opacity(0.28), color.opacity(0)], startPoint: .top, endPoint: .bottom))
                LineMark(x: .value("i", i), y: .value("c", b.c)).foregroundStyle(color).lineStyle(StrokeStyle(lineWidth: 2))
            }
            RuleMark(y: .value("first", bars.first?.c ?? 0)).foregroundStyle(.secondary.opacity(0.6)).lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
        }
        .chartYScale(domain: lo...(hi > lo ? hi : lo + 1))
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
    }
}
