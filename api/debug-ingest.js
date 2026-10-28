/**
 * Temporary debug ingest for iPhone Safari auth investigation.
 * Appends NDJSON to .cursor/debug-73d7f6.log when running locally.
 */
const fs = require("fs");
const path = require("path");

const LOG_PATH = path.join(__dirname, "..", ".cursor", "debug-73d7f6.log");

function allowedOrigin(origin) {
  if (!origin) return true;
  try {
    var host = new URL(origin).hostname;
    return (
      host === "mytalk.in" ||
      host === "www.mytalk.in" ||
      host.endsWith(".vercel.app") ||
      host === "127.0.0.1" ||
      host === "localhost" ||
      /^192\.168\.\d+\.\d+$/.test(host) ||
      /^10\.\d+\.\d+\.\d+$/.test(host)
    );
  } catch (err) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Debug-Session-Id");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.json({ ok: false });
  }

  if (!allowedOrigin(req.headers.origin)) {
    res.statusCode = 403;
    return res.json({ ok: false });
  }

  try {
    var body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    var line = JSON.stringify(
      Object.assign({}, body, {
        sessionId: body.sessionId || "73d7f6",
        receivedAt: Date.now(),
        via: "api/debug-ingest",
      })
    );
    try {
      fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
      fs.appendFileSync(LOG_PATH, line + "\n", "utf8");
    } catch (writeErr) {
      console.log("[debug-ingest]", line);
    }
    res.statusCode = 204;
    return res.end();
  } catch (err) {
    res.statusCode = 400;
    return res.json({ ok: false });
  }
};
