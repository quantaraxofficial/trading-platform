import SwiftUI

// TradingView's watchlist: the list's name (switch lists, make one), sections that fold, a row per
// symbol with its price and change. Tap for the symbol's page; swipe to remove.
struct WatchlistView: View {
    @EnvironmentObject var bridge: Bridge
    @EnvironmentObject var nav: AppNav
    @State private var newList = false
    @State private var newName = ""

    var body: some View {
        NavigationStack {
            Group {
                if !bridge.ready && bridge.lists.isEmpty {
                    VStack(spacing: 12) { ProgressView().tint(Tp.purple); Text("Connecting to your PC…").foregroundStyle(.secondary) }
                } else if (bridge.activeList?.items ?? []).isEmpty {
                    VStack(spacing: 8) {
                        Text("This list is empty").font(.headline)
                        Text("Add the symbols you follow: their prices show here, live.").font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        Button("Add symbol") { nav.search = .watchlist }.tint(Tp.purple).padding(.top, 8)
                    }.padding(32)
                } else {
                    List {
                        ForEach(shownItems) { item in
                            switch item {
                            case .section(let id, let name, let collapsed):
                                Button { bridge.send("toggleSection", ["id": id]) } label: {
                                    HStack(spacing: 6) {
                                        Image(systemName: collapsed ? "chevron.right" : "chevron.down").font(.caption).foregroundStyle(.secondary)
                                        Text(name.capitalized).font(.footnote.weight(.semibold))
                                    }
                                }
                                .listRowSeparator(.hidden)
                            case .symbol(let s):
                                Button { nav.symbol = s } label: { SymbolRow(symbol: s, q: bridge.quotes[s]) }
                                    .swipeActions { Button(role: .destructive) { bridge.send("removeSymbol", ["symbol": s]) } label: { Label("Remove", systemImage: "trash") } }
                            }
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Menu {
                        ForEach(bridge.lists) { l in
                            Button { bridge.send("openList", ["id": l.id]) } label: { if l.id == bridge.activeList?.id { Label(l.name, systemImage: "checkmark") } else { Text(l.name) } }
                        }
                        Divider()
                        Button { newList = true } label: { Label("New list…", systemImage: "plus") }
                    } label: {
                        HStack(spacing: 4) { Text(bridge.activeList?.name ?? "Watchlist").font(.headline); Image(systemName: "chevron.down").font(.caption) }
                            .foregroundStyle(.primary)
                    }
                }
                ToolbarItemGroup(placement: .navigationBarTrailing) {
                    Button { nav.search = .chart } label: { Image(systemName: "magnifyingglass") }
                    Button { nav.search = .watchlist } label: { Image(systemName: "plus") }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .alert("New list", isPresented: $newList) {
                TextField("Name", text: $newName)
                Button("Create") { if !newName.trimmingCharacters(in: .whitespaces).isEmpty { bridge.send("createList", ["name": newName]) }; newName = "" }
                Button("Cancel", role: .cancel) { newName = "" }
            }
        }
    }

    // Sections fold away what's under them
    private var shownItems: [WlItem] {
        var hidden = false
        return (bridge.activeList?.items ?? []).filter { it in
            if case .section(_, _, let c) = it { hidden = c; return true }
            return !hidden
        }
    }
}

struct SymbolRow: View {
    let symbol: String
    let q: Quote?
    var body: some View {
        HStack(spacing: 12) {
            SymbolBadge(symbol: symbol)
            VStack(alignment: .leading, spacing: 2) {
                Text(symbol).font(.body.weight(.semibold)).foregroundStyle(.primary)
                Text(q?.name ?? " ").font(.footnote).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(Fmt.price(q?.last)).font(.body.weight(.medium)).foregroundStyle(.primary)
                Text(q == nil ? " " : "\(Fmt.change(q?.change, price: q?.last))  \(Fmt.pct(q?.changePct))").font(.footnote).foregroundStyle(Tp.changeColor(q?.change))
            }
        }
        .padding(.vertical, 4)
    }
}
