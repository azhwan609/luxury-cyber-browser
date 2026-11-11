const express = require("express");
const session = require("express-session");
const http = require("http");
const net = require("net");
const { WebSocketServer, WebSocket } = require("ws");
const cookie = require("cookie");
const signature = require("cookie-signature");
const { spawn } = require("child_process");
const path = require("path");

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT || 10000);
const ACCESS_CODE = process.env.ACCESS_CODE;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!ACCESS_CODE || !SESSION_SECRET) {
  console.error("ACCESS_CODE and SESSION_SECRET must be configured.");
  process.exit(1);
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: false, limit: "10kb" }));

const sessionMiddleware = session({
  name: "luxury.browser.sid",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: "auto", sameSite: "strict", maxAge: 7 * 24 * 60 * 60 * 1000 }
});
app.use(sessionMiddleware);

const loginPage = (csrf, error = "") => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#090b10"><title>Luxury Cyber Browser · Secure Access</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 0%,#1c2735 0,#0b0e14 48%,#07080b 100%);color:#eef3fa;font:15px Inter,system-ui,sans-serif}
.panel{width:min(92vw,430px);padding:38px;border:1px solid #35404e;border-radius:25px;background:linear-gradient(145deg,#151b24ee,#0b0e14f5);box-shadow:0 28px 90px #0009}
.mark{width:46px;height:46px;border:1px solid #9fb4c9;border-radius:14px;display:grid;place-items:center;color:#dbe8f5;font-size:22px;margin-bottom:28px}
.kicker{color:#91a6bb;letter-spacing:.22em;text-transform:uppercase;font-size:10px}.title{font-size:27px;letter-spacing:-.04em;margin:10px 0 8px}.muted{color:#8793a1;line-height:1.6;font-size:13px}
input{width:100%;margin:24px 0 12px;padding:15px 16px;border-radius:12px;border:1px solid #3a4655;background:#090d13;color:#fff;font-size:16px;outline:none}input:focus{border-color:#9db6ce}
button{width:100%;padding:15px;border:0;border-radius:12px;background:linear-gradient(110deg,#dce7f1,#8fa9c1);color:#101722;font-weight:700;font-size:14px}
.error{color:#f0a6a6;font-size:12px;min-height:18px}.foot{margin-top:26px;color:#667382;font-size:10px;letter-spacing:.12em;text-align:center}
</style></head><body><main class="panel"><div class="mark">◈</div><div class="kicker">Private session gateway</div><h1 class="title">Luxury Cyber Browser</h1><p class="muted">A private remote browsing workspace. Enter your access code to continue.</p>
<form method="post" action="/login"><input type="hidden" name="csrf" value="${csrf}"><input name="code" type="password" autocomplete="current-password" placeholder="Access code" required autofocus><div class="error">${error}</div><button type="submit">Unlock workspace</button></form><div class="foot">ENCRYPTED SESSION · PRIVATE ACCESS</div></main></body></html>`;


async function getActivePage() {
  const response = await fetch("http://127.0.0.1:9222/json");
  if (!response.ok) throw new Error("Chromium debugging endpoint unavailable");
  const pages = await response.json();
  const page = pages.find(item => item.type === "page" && item.webSocketDebuggerUrl);
  if (!page) throw new Error("No active browser tab");
  return page.webSocketDebuggerUrl;
}
async function cdp(method, params = {}) {
  const endpoint = await getActivePage();
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoint);
    const timer = setTimeout(() => { ws.close(); reject(new Error("Chromium command timed out")); }, 5000);
    ws.on("open", () => ws.send(JSON.stringify({ id: 1, method, params })));
    ws.on("message", raw => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.id !== 1) return;
      clearTimeout(timer); ws.close();
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result || {});
    });
    ws.on("error", error => { clearTimeout(timer); reject(error); });
  });
}
app.post("/api/browser/:action", requireAuth, async (req, res) => {
  try {
    const action = req.params.action;
    if (action === "navigate") {
      const url = req.body.url;
      if (typeof url !== "string" || url.length > 2048) return res.status(400).json({ error: "Invalid URL" });
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) return res.status(400).json({ error: "Only HTTP and HTTPS are allowed" });
      await cdp("Page.navigate", { url: parsed.href });
    } else if (action === "back") {
      await cdp("Runtime.evaluate", { expression: "history.back()" });
    } else if (action === "forward") {
      await cdp("Runtime.evaluate", { expression: "history.forward()" });
    } else if (action === "reload") {
      await cdp("Page.reload", { ignoreCache: true });
    } else if (action === "bookmark") {
      await cdp("Runtime.evaluate", { expression: "document.execCommand('bookmark')" });
    } else {
      return res.status(404).json({ error: "Unknown browser action" });
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.get("/health", (_req, res) => res.status(200).json({ status: "ok", service: "luxury-cyber-browser" }));

app.get("/login", (req, res) => {
  if (req.session.authenticated) return res.redirect("/");
  req.session.csrf = require("crypto").randomBytes(24).toString("hex");
  res.type("html").send(loginPage(req.session.csrf));
});

app.post("/login", (req, res, next) => {
  if (!req.session.csrf || req.body.csrf !== req.session.csrf) return res.status(403).send("Invalid session. Reload and try again.");
  if (typeof req.body.code !== "string" || req.body.code.length > 256 || req.body.code !== ACCESS_CODE) {
    req.session.csrf = require("crypto").randomBytes(24).toString("hex");
    return res.status(401).type("html").send(loginPage(req.session.csrf, "Access code not accepted."));
  }
  req.session.regenerate(err => {
    if (err) return next(err);
    req.session.authenticated = true;
    res.redirect("/");
  });
});

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect("/login");
}

app.post("/logout", requireAuth, (req, res) => req.session.destroy(() => res.redirect("/login")));

app.get("/", requireAuth, (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.use("/novnc", requireAuth, express.static("/usr/share/novnc", { fallthrough: false, index: false }));

const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
server.on("upgrade", (req, socket, head) => {
  if (req.url.split("?")[0] !== "/websockify") return socket.destroy();
  const fakeRes = new http.ServerResponse(req);
  sessionMiddleware(req, fakeRes, () => {
    if (!req.session || !req.session.authenticated) return socket.destroy();
    wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws));
  });
});

wss.on("connection", browserSocket => {
  const upstream = net.connect(6080, "127.0.0.1");
  upstream.on("connect", () => {
    browserSocket.on("message", data => { if (upstream.writable) upstream.write(data); });
    upstream.on("data", data => { if (browserSocket.readyState === WebSocket.OPEN) browserSocket.send(data); });
  });
  const closeBoth = () => { browserSocket.close(); upstream.destroy(); };
  browserSocket.on("close", closeBoth);
  browserSocket.on("error", closeBoth);
  upstream.on("error", closeBoth);
  upstream.on("close", () => { if (browserSocket.readyState === WebSocket.OPEN) browserSocket.close(); });
});

server.listen(PORT, "0.0.0.0", () => {
  const dataDir = process.env.BROWSER_DATA_DIR || "/data/chromium";
  const child = spawn("runuser", ["-u", "browser", "--", "chromium", "--no-sandbox",
    "--disable-dev-shm-usage", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--password-store=basic", "--user-data-dir=" + dataDir, "--start-maximized",
    "--remote-debugging-port=9222", "--remote-debugging-address=127.0.0.1", "https://www.google.com"], { env: { ...process.env, DISPLAY: ":99", HOME: "/home/browser" }, stdio: "ignore" });
  child.on("error", err => console.error("Chromium launch failed:", err.message));
  console.log(`Luxury Cyber Browser listening on ${PORT}`);
});