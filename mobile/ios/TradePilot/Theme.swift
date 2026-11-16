import SwiftUI

// TradingView's app colours with TradePilot's purple where TradingView has its blue
enum Tp {
    static let purple = Color(red: 0x7c / 255, green: 0x3a / 255, blue: 0xed / 255)
    static let purpleLight = Color(red: 0xa7 / 255, green: 0x8b / 255, blue: 0xfa / 255)
    static let up = Color(red: 0x08 / 255, green: 0x99 / 255, blue: 0x81 / 255)
    static let down = Color(red: 0xf2 / 255, green: 0x36 / 255, blue: 0x45 / 255)
    static let gradient = LinearGradient(colors: [Color(red: 0xa8 / 255, green: 0x55 / 255, blue: 0xf7 / 255), Color(red: 0x63 / 255, green: 0x66 / 255, blue: 0xf1 / 255)], startPoint: .topLeading, endPoint: .bottomTrailing)

    static func changeColor(_ v: Double?) -> Color {
        guard let v, v != 0 else { return .secondary }
        return v > 0 ? up : down
    }
}

enum Fmt {
    private static func decimals(_ a: Double) -> Int { a >= 10 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : 8 }
    private static func format(_ v: Double, _ d: Int) -> String {
        let f = NumberFormatter(); f.numberStyle = .decimal; f.minimumFractionDigits = d; f.maximumFractionDigits = d; f.locale = Locale(identifier: "en_US")
        return f.string(from: NSNumber(value: v)) ?? String(v)
    }
    static func price(_ v: Double?) -> String { guard let v else { return "—" }; return format(v, decimals(abs(v))) }
    // A change in its price's decimals (EUR/USD's -0.0009, not -0.00093000)
    static func change(_ v: Double?, price p: Double? = nil) -> String { guard let v else { return "" }; return (v > 0 ? "+" : "") + format(v, decimals(abs(p ?? v))) }
    static func pct(_ v: Double?) -> String { guard let v else { return "" }; return String(format: "%@%.2f%%", v > 0 ? "+" : "", v) }
    static func volume(_ v: Double?) -> String {
        guard let v else { return "—" }
        if v >= 1e9 { return String(format: "%.2fB", v / 1e9) }
        if v >= 1e6 { return String(format: "%.2fM", v / 1e6) }
        if v >= 1e3 { return String(format: "%.2fK", v / 1e3) }
        return String(format: "%.0f", v)
    }
    static func interval(_ iv: String) -> String {
        ["1min": "1m", "5min": "5m", "15min": "15m", "30min": "30m", "45min": "45m", "1h": "1h", "2h": "2h", "4h": "4h", "1day": "1D", "1week": "1W", "1month": "1M"][iv] ?? iv
    }
}

func assetKind(_ sym: String) -> String {
    let s = sym.uppercased()
    guard s.contains("/") else { return "stock" }
    let base = String(s.split(separator: "/").first ?? "")
    if ["BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "BNB", "LTC", "DOT", "AVAX", "LINK", "TRX", "TON", "BCH"].contains(base) { return "crypto" }
    if ["XAU", "XAG", "XPT", "XPD", "WTI", "BRENT"].contains(base) { return "commodity" }
    return "forex"
}

// A symbol's round badge: its letters on its market's colour (no copied company logos)
struct SymbolBadge: View {
    let symbol: String
    var size: CGFloat = 36
    var body: some View {
        let kind = assetKind(symbol)
        let bg: Color = kind == "crypto" ? .orange : kind == "commodity" ? Color(red: 0.83, green: 0.63, blue: 0.09) : kind == "forex" ? Color(red: 0.18, green: 0.49, blue: 0.2) : Tp.purple
        let letters = String((symbol.split(separator: "/").first ?? "").prefix(kind == "stock" ? 2 : 3))
        Circle().fill(bg).frame(width: size, height: size)
            .overlay(Text(letters).font(.system(size: size * 0.32, weight: .bold)).foregroundColor(.white).lineLimit(1))
    }
}
