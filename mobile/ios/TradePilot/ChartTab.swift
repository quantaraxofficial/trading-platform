import SwiftUI
import WebKit

private let intervals = ["1min", "5min", "15min", "30min", "45min", "1h", "2h", "4h", "1day", "1week", "1month"]

// The chart, and TradingView's chart bar under it: symbol, timeframe | drawing, indicators, more | undo, redo
struct ChartTab: View {
    let web: WKWebView
    @EnvironmentObject var bridge: Bridge
    @EnvironmentObject var nav: AppNav
    @State private var intervalSheet = false
    @State private var more = false

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                WebViewHost(web: web).ignoresSafeArea(edges: .horizontal)
                if !bridge.ready {
                    VStack(spacing: 12) {
                        ProgressView().tint(Tp.purple)
                        Text("Opening the chart…").font(.subheadline).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity).background(Color(.systemBackground))
                }
            }
            Divider()
            HStack(spacing: 2) {
                Button { nav.search = .chart } label: {
                    Text(bridge.chart.symbol.isEmpty ? "—" : bridge.chart.symbol).font(.subheadline.weight(.semibold)).lineLimit(1).frame(width: 84, alignment: .leading)
                }.padding(.horizontal, 8)
                Button { intervalSheet = true } label: { Text(Fmt.interval(bridge.chart.interval)).font(.subheadline) }.padding(.horizontal, 6)
                Spacer()
                barButton("pencil.tip", active: bridge.chart.draw) { bridge.send("draw") }
                barButton("function") { bridge.send("indicators") }
                barButton("ellipsis") { more = true }
                Divider().frame(height: 22)
                barButton("arrow.uturn.backward") { bridge.send("undo") }
                barButton("arrow.uturn.forward") { bridge.send("redo") }
            }
            .foregroundStyle(.primary)
            .frame(height: 46)
            .padding(.horizontal, 4)
        }
        .sheet(isPresented: $intervalSheet) {
            VStack(alignment: .leading, spacing: 14) {
                Text("Timeframe").font(.headline)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 64))], spacing: 10) {
                    ForEach(intervals, id: \.self) { iv in
                        let on = iv == bridge.chart.interval
                        Button { bridge.setInterval(iv); intervalSheet = false } label: {
                            Text(Fmt.interval(iv)).font(.body.weight(.medium)).frame(maxWidth: .infinity).padding(.vertical, 10)
                                .background(on ? Tp.purple : Color(.secondarySystemBackground)).foregroundColor(on ? .white : .primary).clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                    }
                }
                Spacer()
            }
            .padding(20)
            .presentationDetents([.height(260)])
        }
        .confirmationDialog("More", isPresented: $more) {
            Button("Alerts") { bridge.send("alerts") }
            Button("Create alert") { bridge.send("createAlert") }
            Button("Bar replay") { bridge.send("replay") }
            Button(bridge.chart.bottom ? "Hide trading panel" : "Trading panel") { bridge.send(bridge.chart.bottom ? "bottom" : "trade", ["open": !bridge.chart.bottom]) }
            Button("Pine Editor") { bridge.send("pine") }
            Button("Object tree") { bridge.send("objectTree") }
            Button("Snapshot") { bridge.send("snapshot") }
            Button("Chart settings") { bridge.send("settings") }
            Button(bridge.chart.theme == "light" ? "Dark theme" : "Light theme") { bridge.send("theme", ["theme": bridge.chart.theme == "light" ? "dark" : "light"]) }
        }
    }

    private func barButton(_ icon: String, active: Bool = false, _ action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: icon).font(.system(size: 18)).frame(width: 40, height: 40).foregroundStyle(active ? Tp.purple : .primary) }
    }
}
