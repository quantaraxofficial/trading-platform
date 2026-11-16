import SwiftUI

// Which PC to connect to: the merge site runs on the user's PC (TradePilot's merge app, with
// "Use TradePilot on your phone" on), and the phone reaches it over the same Wi-Fi
struct ConnectView: View {
    let initial: Connection?
    let onDone: (Connection) -> Void
    @State private var host = ""
    @State private var sitePort = "3007"
    @State private var backendPort = "8000"
    @State private var checking = false
    @State private var site: Bool?
    @State private var backend: Bool?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                RoundedRectangle(cornerRadius: 14).fill(Tp.gradient).frame(width: 56, height: 56)
                    .overlay(Text("TP").font(.title3.bold()).foregroundColor(.white))
                Text("Connect to your PC").font(.largeTitle.bold())
                Text("TradePilot on your phone runs from TradePilot on your PC.").foregroundStyle(.secondary)
                step(1, "On your PC, open TradePilot (the merge edition).")
                step(2, "Menu → Settings → Phone app: turn on \"Use TradePilot on your phone\" and restart it. Allow it on Private networks when Windows asks.")
                step(3, "Keep your phone on the same Wi-Fi, and enter the address Settings shows (like 192.168.0.104).")
                TextField("PC address", text: $host).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .padding(12).background(Color(.secondarySystemBackground)).clipShape(RoundedRectangle(cornerRadius: 10))
                DisclosureGroup("Ports") {
                    HStack {
                        TextField("Site", text: $sitePort).keyboardType(.numberPad)
                        TextField("Backend", text: $backendPort).keyboardType(.numberPad)
                    }
                    .textFieldStyle(.roundedBorder)
                }
                .tint(Tp.purple)
                if let site {
                    check("The site (port \(sitePort))", site)
                    check("The backend (port \(backendPort))", backend == true)
                }
                Button { connect() } label: {
                    Group { if checking { ProgressView().tint(.white) } else { Text("Connect").font(.headline) } }
                        .frame(maxWidth: .infinity).frame(height: 50)
                }
                .buttonStyle(.borderedProminent).tint(Tp.purple)
                .disabled(host.trimmingCharacters(in: .whitespaces).isEmpty || checking)
            }
            .padding(24)
        }
        .onAppear { if let initial { host = initial.host; sitePort = String(initial.sitePort); backendPort = String(initial.backendPort) } }
    }

    private func connect() {
        var h = host.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "http://", with: "")
        h = String(h.split(separator: "/").first ?? ""); h = String(h.split(separator: ":").first ?? "")
        let c = Connection(host: h, sitePort: Int(sitePort) ?? 3007, backendPort: Int(backendPort) ?? 8000)
        checking = true; site = nil; backend = nil
        Task {
            let s = await Net.status("\(c.site)/").map { (200...399).contains($0) } ?? false
            let b = await Net.status("\(c.backend)/admin/login/").map { (200...399).contains($0) } ?? false
            site = s; backend = b; checking = false
            if s && b { onDone(c) }
        }
    }

    private func step(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(n)").font(.caption.bold()).frame(width: 24, height: 24).background(Color(.secondarySystemBackground)).clipShape(Circle())
            Text(text).font(.subheadline)
        }
    }

    private func check(_ label: String, _ ok: Bool) -> some View {
        Label(label + (ok ? ": answering" : ": not answering"), systemImage: ok ? "checkmark.circle" : "exclamationmark.circle")
            .foregroundStyle(ok ? Tp.up : Tp.down).font(.subheadline)
    }
}
