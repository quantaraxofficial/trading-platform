import SwiftUI

private let popular: [Net.Hit] = [
    .init(symbol: "XAU/USD", name: "Gold Spot / US Dollar", type: "", exchange: "FOREX"),
    .init(symbol: "EUR/USD", name: "Euro / US Dollar", type: "", exchange: "FOREX"),
    .init(symbol: "GBP/USD", name: "British Pound / US Dollar", type: "", exchange: "FOREX"),
    .init(symbol: "BTC/USD", name: "Bitcoin / US Dollar", type: "", exchange: "Coinbase Pro"),
    .init(symbol: "ETH/USD", name: "Ethereum / US Dollar", type: "", exchange: "Coinbase Pro"),
    .init(symbol: "AAPL", name: "Apple Inc.", type: "", exchange: "NASDAQ"),
    .init(symbol: "NVDA", name: "NVIDIA Corporation", type: "", exchange: "NASDAQ"),
    .init(symbol: "TSLA", name: "Tesla, Inc.", type: "", exchange: "NASDAQ"),
]

// Symbol search, over the site's own search
struct SearchView: View {
    let purpose: SearchFor
    @EnvironmentObject var nav: AppNav
    @EnvironmentObject var prefs: Prefs
    @State private var q = ""
    @State private var hits: [Net.Hit]?
    @State private var busy = false
    @State private var failed = false
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            List {
                if let hits {
                    if hits.isEmpty && !busy {
                        Text(failed ? "Couldn't reach the site on your PC." : "Nothing found for \"\(q)\"").foregroundStyle(.secondary)
                    }
                    ForEach(hits) { h in row(h) }
                } else {
                    if !prefs.recentSymbols.isEmpty {
                        Section("Recent") { ForEach(prefs.recentSymbols, id: \.self) { s in row(.init(symbol: s, name: "", type: "", exchange: "")) } }
                    }
                    Section("Popular") { ForEach(popular) { h in row(h) } }
                }
            }
            .listStyle(.plain)
            .overlay(alignment: .top) { if busy { ProgressView().tint(Tp.purple).padding(.top, 8) } }
            .searchable(text: $q, placement: .navigationBarDrawer(displayMode: .always), prompt: purpose == .watchlist ? "Add a symbol" : "Search")
            .textInputAutocapitalization(.characters)
            .onSubmit(of: .search) { if let f = hits?.first { pick(f.symbol) } }
            .task(id: q) {
                let t = q.trimmingCharacters(in: .whitespaces)
                if t.isEmpty { hits = nil; busy = false; failed = false; return }
                try? await Task.sleep(nanoseconds: 300_000_000)
                if Task.isCancelled { return }
                busy = true
                let got = await Net.search(site: prefs.connection?.site ?? "", q: t)
                failed = got == nil; hits = got ?? []; busy = false
            }
            .navigationTitle(purpose == .watchlist ? "Add symbol" : "Symbol search")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { nav.search = nil } } }
        }
    }

    private func row(_ h: Net.Hit) -> some View {
        Button { pick(h.symbol) } label: {
            HStack(spacing: 12) {
                SymbolBadge(symbol: h.symbol, size: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text(h.symbol).font(.body.weight(.semibold)).foregroundStyle(.primary)
                    if !h.name.isEmpty { Text(h.name).font(.footnote).foregroundStyle(.secondary).lineLimit(1) }
                }
                Spacer()
                if !h.exchange.isEmpty { Text(h.exchange).font(.caption).foregroundStyle(.tertiary) }
            }
        }
    }

    private func pick(_ s: String) {
        prefs.remember(s)
        if purpose == .watchlist { Bridge.shared.send("addSymbol", ["symbol": s]); nav.search = nil }
        else { nav.chart(s) }
    }
}
