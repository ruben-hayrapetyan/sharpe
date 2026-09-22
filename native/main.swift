import Cocoa
import WebKit

/// Serves the bundled web app over app://drill/… so localStorage has a stable, persistent origin.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL
    init(root: URL) { self.root = root.standardizedFileURL }

    private func mime(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html"
        case "js": return "text/javascript"
        case "css": return "text/css"
        case "webp": return "image/webp"
        case "png": return "image/png"
        case "svg": return "image/svg+xml"
        case "json": return "application/json"
        default: return "application/octet-stream"
        }
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var rel = url.path
        if rel.isEmpty || rel == "/" { rel = "/index.html" }
        let file = root.appendingPathComponent(String(rel.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
            task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: nil, headerFields: nil)!)
            task.didFinish(); return
        }
        let type = mime(file.pathExtension)
        let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": type.hasPrefix("text") ? "\(type); charset=utf-8" : type,
            "Content-Length": "\(data.count)",
            "Cache-Control": "no-cache"
        ])!
        task.didReceive(resp); task.didReceive(data); task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

/// "Ask Claude": runs the user's local Claude Code CLI (their existing login, no API key) with
/// no tools, on Sonnet at medium effort, sending the current problem's images inline, and
/// streams the CLI's stream-json lines back to the page.
final class ClaudeBridge: NSObject, WKScriptMessageHandler {
    var sink: (_ id: String, _ line: String) -> Void = { _, _ in }
    private let webRoot: URL
    private let queue = DispatchQueue(label: "sharpe.claude")
    private var procs: [String: Process] = [:]
    private var resolved: (claude: String?, path: String)?

    init(webRoot: URL) { self.webRoot = webRoot.standardizedFileURL }

    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        guard let d = m.body as? [String: Any], let type = d["type"] as? String else { return }
        let id = d["id"] as? String ?? ""
        switch type {
        case "probe":
            queue.async {
                let r = self.resolve()
                self.emit(id, ["type": "__probe", "ok": r.claude != nil, "path": r.claude ?? ""])
            }
        case "cancel": queue.async { self.procs[id]?.terminate() }
        case "ask": queue.async { self.ask(id: id, d) }
        default: break
        }
    }

    private func emit(_ id: String, _ obj: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: obj), let s = String(data: data, encoding: .utf8) { sink(id, s) }
    }

    /// GUI apps don't inherit the shell PATH, so ask a login shell where `claude` (and node) live.
    private func resolve() -> (claude: String?, path: String) {
        if let r = resolved { return r }
        var path = ProcessInfo.processInfo.environment["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin"
        var claude: String?
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/zsh")
        p.arguments = ["-lic", "printf '__SHARPE_CLAUDE__%s\\n' \"$(command -v claude)\"; printf '__SHARPE_PATH__%s\\n' \"$PATH\""]
        let out = Pipe(); p.standardOutput = out; p.standardError = Pipe(); p.standardInput = FileHandle.nullDevice
        if (try? p.run()) != nil {
            DispatchQueue.global().asyncAfter(deadline: .now() + 10) { if p.isRunning { p.terminate() } }
            let data = out.fileHandleForReading.readDataToEndOfFile()
            p.waitUntilExit()
            for line in String(decoding: data, as: UTF8.self).split(separator: "\n") {
                if line.hasPrefix("__SHARPE_CLAUDE__") { claude = String(line.dropFirst("__SHARPE_CLAUDE__".count)) }
                if line.hasPrefix("__SHARPE_PATH__") { path = String(line.dropFirst("__SHARPE_PATH__".count)) }
            }
        }
        let fm = FileManager.default
        if claude == nil || !fm.isExecutableFile(atPath: claude!) {
            let home = fm.homeDirectoryForCurrentUser.path
            claude = ["\(home)/.local/bin/claude", "/opt/homebrew/bin/claude", "/usr/local/bin/claude", "\(home)/.claude/local/claude"]
                .first { fm.isExecutableFile(atPath: $0) }
        }
        if let c = claude { path = (URL(fileURLWithPath: c).deletingLastPathComponent().path) + ":" + path }
        resolved = (claude, path)
        return resolved!
    }

    private func png(from url: URL) -> Data? {
        guard let data = try? Data(contentsOf: url), let img = NSImage(data: data),
              let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { return nil }
        return rep.representation(using: .png, properties: [:])
    }

    func ask(id: String, _ d: [String: Any]) {
        let r = resolve()
        guard let claude = r.claude else {
            emit(id, ["type": "__error", "code": "no-claude",
                      "message": "Couldn't find the Claude Code CLI. Install it and sign in (run `claude` once in Terminal), then try again."])
            return
        }
        let system = d["system"] as? String ?? ""
        let prompt = d["prompt"] as? String ?? ""
        let images = d["images"] as? [[String: String]] ?? []
        let fm = FileManager.default

        // Images ride inline in the user message (no Read-tool round trip, no tool definitions).
        var content: [[String: Any]] = []
        for img in images {
            guard let src = img["src"], let label = img["label"] else { continue }
            let file = webRoot.appendingPathComponent(src).standardizedFileURL
            guard file.path.hasPrefix(webRoot.path), let data = png(from: file) else { continue }
            content.append(["type": "text", "text": "[\(label)]"])
            content.append(["type": "image", "source": ["type": "base64", "media_type": "image/png", "data": data.base64EncodedString()]])
        }
        content.append(["type": "text", "text": prompt])
        let msg: [String: Any] = ["type": "user", "message": ["role": "user", "content": content]]
        guard var payload = try? JSONSerialization.data(withJSONObject: msg) else {
            emit(id, ["type": "__error", "code": "encode", "message": "Couldn't encode the request."]); return
        }
        payload.append(10)

        // Empty scratch directory so the CLI never picks up a project's CLAUDE.md or settings.
        let work = fm.temporaryDirectory.appendingPathComponent("sharpe-chat-\(id)")
        try? fm.createDirectory(at: work, withIntermediateDirectories: true)

        let p = Process()
        p.executableURL = URL(fileURLWithPath: claude)
        p.currentDirectoryURL = work
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = r.path
        p.environment = env
        p.arguments = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
                       "--model", "sonnet", "--effort", "medium",
                       "--tools", "", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence",
                       "--system-prompt", system]
        let inp = Pipe(), out = Pipe(), err = Pipe()
        p.standardInput = inp; p.standardOutput = out; p.standardError = err

        var buf = Data()
        let flush: (Bool) -> Void = { final in
            while let r = buf.firstIndex(of: 10) {
                let line = String(decoding: buf[buf.startIndex..<r], as: UTF8.self)
                buf.removeSubrange(buf.startIndex...r)
                if !line.isEmpty { self.sink(id, line) }
            }
            if final, !buf.isEmpty { self.sink(id, String(decoding: buf, as: UTF8.self)); buf.removeAll() }
        }
        out.fileHandleForReading.readabilityHandler = { h in
            let data = h.availableData
            if data.isEmpty { return }
            buf.append(data); flush(false)
        }
        p.terminationHandler = { proc in
            out.fileHandleForReading.readabilityHandler = nil
            buf.append(out.fileHandleForReading.readDataToEndOfFile()); flush(true)
            let errText = String(decoding: err.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
            self.emit(id, ["type": "__exit", "code": Int(proc.terminationStatus), "stderr": String(errText.suffix(600))])
            self.queue.async { self.procs[id] = nil }
            try? fm.removeItem(at: work)
        }
        do {
            try p.run()
            procs[id] = p
            inp.fileHandleForWriting.write(payload)
            try? inp.fileHandleForWriting.close()
        } catch {
            emit(id, ["type": "__error", "code": "launch", "message": "Couldn't start Claude: \(error.localizedDescription)"])
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var bridge: ClaudeBridge!

    private func jsString(_ s: String) -> String {
        guard let d = try? JSONSerialization.data(withJSONObject: [s]), let t = String(data: d, encoding: .utf8) else { return "\"\"" }
        return String(t.dropFirst().dropLast())
    }

    func applicationDidFinishLaunching(_ note: Notification) {
        let res = Bundle.main.resourceURL!.appendingPathComponent("web")
        bridge = ClaudeBridge(webRoot: res)
        if ProcessInfo.processInfo.environment["SHARPE_SELFTEST"] != nil { selfTest(); return }

        buildMenu()
        let conf = WKWebViewConfiguration()
        conf.setURLSchemeHandler(BundleSchemeHandler(root: res), forURLScheme: "app")
        conf.userContentController.add(bridge, name: "claude")
        conf.websiteDataStore = .default()
        web = WKWebView(frame: .zero, configuration: conf)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.setValue(false, forKey: "drawsBackground")
        bridge.sink = { [weak self] id, line in
            guard let self = self else { return }
            DispatchQueue.main.async {
                self.web.evaluateJavaScript("window.__sharpeClaude&&window.__sharpeClaude(\(self.jsString(id)),\(self.jsString(line)))")
            }
        }

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1240, height: 840),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Sharpe"
        window.minSize = NSSize(width: 520, height: 520)
        window.contentView = web
        window.setFrameAutosaveName("SharpeMain")
        if !window.setFrameUsingName("SharpeMain") { window.center() }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        web.load(URLRequest(url: URL(string: "app://drill/index.html")!))
    }

    /// `SHARPE_SELFTEST=1 Sharpe.app/Contents/MacOS/Sharpe` runs one Ask-Claude round trip headlessly.
    private func selfTest() {
        var text = ""
        bridge.sink = { _, line in
            guard let d = line.data(using: .utf8), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return }
            let t = o["type"] as? String
            if t == "stream_event", let e = o["event"] as? [String: Any], let dl = e["delta"] as? [String: Any], dl["type"] as? String == "text_delta" {
                text += dl["text"] as? String ?? ""
            } else if t == "__exit" || t == "__error" {
                print("[\(t ?? "")] \(o["message"] ?? o["code"] ?? "")\n\(o["stderr"] ?? "")\n---\n\(text)")
                exit(0)
            }
        }
        bridge.ask(id: "selftest", [
            "system": "You are a concise tutor. Look at the attached image first. Reply in at most 3 sentences.",
            "prompt": "What problem does the attached image show? Do not solve it.",
            "images": [["label": "question", "src": "img/q081q.webp"]]
        ])
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool { true }

    // Anything that isn't the bundled app opens in the default browser.
    func webView(_ w: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let u = action.request.url, u.scheme != "app", u.scheme != "about" {
            NSWorkspace.shared.open(u); decisionHandler(.cancel)
        } else { decisionHandler(.allow) }
    }

    private func buildMenu() {
        let main = NSMenu()
        func add(_ title: String, _ items: [NSMenuItem]) {
            let item = NSMenuItem(); main.addItem(item)
            let m = NSMenu(title: title); items.forEach { m.addItem($0) }; item.submenu = m
        }
        func mi(_ t: String, _ sel: Selector?, _ key: String = "", _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let i = NSMenuItem(title: t, action: sel, keyEquivalent: key); i.keyEquivalentModifierMask = mods; return i
        }
        add("Sharpe", [
            mi("About Sharpe", #selector(NSApplication.orderFrontStandardAboutPanel(_:))),
            .separator(),
            mi("Hide Sharpe", #selector(NSApplication.hide(_:)), "h"),
            mi("Quit Sharpe", #selector(NSApplication.terminate(_:)), "q")
        ])
        add("Edit", [
            mi("Undo", Selector(("undo:")), "z"), mi("Redo", Selector(("redo:")), "Z", [.command, .shift]),
            .separator(),
            mi("Cut", #selector(NSText.cut(_:)), "x"), mi("Copy", #selector(NSText.copy(_:)), "c"),
            mi("Paste", #selector(NSText.paste(_:)), "v"), mi("Select All", #selector(NSText.selectAll(_:)), "a")
        ])
        add("View", [
            mi("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]),
            mi("Reload", #selector(reload), "r")
        ])
        add("Window", [mi("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"), mi("Close", #selector(NSWindow.performClose(_:)), "w")])
        NSApp.mainMenu = main
    }
    @objc func reload() { web.reload() }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
