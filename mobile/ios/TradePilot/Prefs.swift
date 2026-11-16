import Foundation

// Where the merge site runs (the user's PC on their Wi-Fi) and the app's own choices
struct Connection: Equatable {
    var host: String
    var sitePort = 3007
    var backendPort = 8000
    var site: String { "http://\(host):\(sitePort)" }
    var backend: String { "http://\(host):\(backendPort)" }
}

final class Prefs: ObservableObject {
    static let shared = Prefs()
    private let d = UserDefaults.standard

    @Published var connection: Connection?
    @Published var guideSeen: Bool { didSet { d.set(guideSeen, forKey: "guideSeen") } }

    private init() {
        let host = d.string(forKey: "host") ?? ""
        connection = host.isEmpty ? nil : Connection(host: host, sitePort: d.object(forKey: "sitePort") as? Int ?? 3007, backendPort: d.object(forKey: "backendPort") as? Int ?? 8000)
        guideSeen = d.bool(forKey: "guideSeen")
    }

    func save(_ c: Connection) {
        d.set(c.host, forKey: "host"); d.set(c.sitePort, forKey: "sitePort"); d.set(c.backendPort, forKey: "backendPort")
        connection = c
    }

    var recentSymbols: [String] {
        get { (d.string(forKey: "recent") ?? "").split(separator: "|").map(String.init) }
        set { d.set(newValue.prefix(12).joined(separator: "|"), forKey: "recent") }
    }

    func remember(_ s: String) { recentSymbols = [s] + recentSymbols.filter { $0 != s } }
}

enum Net {
    static func status(_ url: String) async -> Int? {
        guard let u = URL(string: url) else { return nil }
        var r = URLRequest(url: u); r.timeoutInterval = 5
        do { let (_, resp) = try await URLSession.shared.data(for: r); return (resp as? HTTPURLResponse)?.statusCode } catch { return nil }
    }

    struct Hit: Identifiable, Hashable { var symbol: String; var name: String; var type: String; var exchange: String; var id: String { symbol } }

    // The site's /api/symbol-search (the chart's own search)
    static func search(site: String, q: String) async -> [Hit]? {
        let enc = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q
        guard let u = URL(string: "\(site)/api/symbol-search?q=\(enc)") else { return nil }
        do {
            let (data, _) = try await URLSession.shared.data(from: u)
            let j = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            let a = j?["data"] as? [[String: Any]] ?? []
            return a.map { Hit(symbol: $0["symbol"] as? String ?? "", name: $0["name"] as? String ?? "", type: $0["type"] as? String ?? "", exchange: $0["exchange"] as? String ?? "") }
        } catch { return nil }
    }
}
