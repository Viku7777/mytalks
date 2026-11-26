/**
 * Email admin@mytalk.in once for a new IP or a new account.
 * The address always comes from this request, never from the JSON body.
 */
const crypto = require("crypto");
const { sendAdminNotice } = require("../mail/send-admin");

const PROJECT_ID = "location-461df";
const API_KEY = "AIzaSyBj8PA7Eq04bV3TTL2bC4XmX4a6Ob6F8YQ";

function allowedOrigin(origin) {
  if (!origin) return true;
  try {
    var host = new URL(origin).hostname;
    return (
      host === "mytalk.in" ||
      host === "www.mytalk.in" ||
      host.endsWith(".vercel.app") ||
      host === "127.0.0.1" ||
      host === "localhost"
    );
  } catch (err) {
    return false;
  }
}

function isPublicIp(value) {
  var ip = String(value || "").trim();
  if (!ip || ip === "127.0.0.1" || ip === "::1") return false;
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(ip)) return false;
  return true;
}

function clientIp(req) {
  var forwarded = String(req.headers["x-forwarded-for"] || "");
  var parts = forwarded.split(",").map(function (part) {
    return part.trim();
  }).filter(Boolean);
  var candidates = parts.concat([
    req.headers["x-real-ip"],
    req.socket && req.socket.remoteAddress,
  ]);
  for (var i = 0; i < candidates.length; i++) {
    var ip = String(candidates[i] || "").replace(/^::ffff:/, "").trim();
    if (ip) return ip;
  }
  return "";
}

function noticeId(kind, value) {
  return crypto.createHash("sha256").update(kind + ":" + value).digest("hex").slice(0, 24);
}

function docUrl(name) {
  return (
    "https://firestore.googleapis.com/v1/projects/" +
    PROJECT_ID +
    "/databases/(default)/documents/" +
    name
  );
}

async function firestoreRequest(name, options) {
  options = options || {};
  var url = new URL(docUrl(name));
  url.searchParams.set("key", API_KEY);
  var res = await fetch(url, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: res.status };
}

async function claimOnce(id, kind, label) {
  var current = await firestoreRequest("mail_notices/" + id);
  if (current.status === 200) return false;
  var created = await firestoreRequest("mail_notices?documentId=" + id, {
    method: "POST",
    body: {
      fields: {
        kind: { stringValue: kind },
        label: { stringValue: String(label || "").slice(0, 120) },
        createdAt: { stringValue: new Date().toISOString() },
      },
    },
  });
  return created.status >= 200 && created.status < 300;
}

function visitCount(value) {
  var count = Math.round(Number(value));
  if (!isFinite(count) || count < 1) return 1;
  if (count > 1000000) return 1000000;
  return count;
}

async function sendNewIp(ip, path, page, hits) {
  if (!isPublicIp(ip)) return false;
  var claimed = await claimOnce(noticeId("ip", ip), "ip", ip);
  if (!claimed) return false;
  await sendAdminNotice("New IP on MyTalk", [
    "A new address opened the site.",
    "IP: " + ip,
    "Visits: " + visitCount(hits),
    page ? "Page: " + page : "",
    path ? "Path: " + path : "",
    "Time: " + new Date().toISOString(),
  ]);
  return true;
}

async function lookupAccount(idToken) {
  var res = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + API_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: idToken }),
    }
  );
  if (!res.ok) return null;
  var data = await res.json();
  return data && data.users && data.users[0] ? data.users[0] : null;
}

async function sendNewUser(account, phone) {
  var uid = account && account.localId ? String(account.localId) : "";
  if (!uid) return false;
  var claimed = await claimOnce(noticeId("user", uid), "user", account.email || uid);
  if (!claimed) return false;
  var name = String(account.displayName || "").trim();
  var email = String(account.email || "").trim();
  var number = String(phone || account.phoneNumber || "").trim();
  await sendAdminNotice("New MyTalk account", [
    "Someone created an account.",
    "Name: " + (name || "Not provided"),
    "Email: " + (email || "Not provided"),
    "Phone: " + (number || "Not provided"),
    "Time: " + new Date().toISOString(),
  ]);
  return true;
}

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.json({ ok: false, error: "Use POST." });
  }
  if (!allowedOrigin(req.headers.origin)) {
    res.statusCode = 403;
    return res.json({ ok: false, error: "Origin not allowed." });
  }

  var body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  var kind = String(body.kind || "");
  var header = String(req.headers.authorization || "");
  var token = header.toLowerCase().indexOf("bearer ") === 0 ? header.slice(7).trim() : "";

  try {
    if (kind === "ip") {
      if (!token) {
        res.statusCode = 401;
        return res.json({ ok: false, error: "Sign-in required." });
      }
      var account = await lookupAccount(token);
      if (!account) {
        res.statusCode = 401;
        return res.json({ ok: false, error: "Sign-in could not be checked." });
      }
      var sentIp = await sendNewIp(
        clientIp(req),
        String(body.path || "").slice(0, 300),
        String(body.page || "").slice(0, 80),
        body.hits
      );
      return res.json({ ok: true, sent: sentIp });
    }
    if (kind === "user") {
      if (!token) {
        res.statusCode = 401;
        return res.json({ ok: false, error: "Sign-in required." });
      }
      var userAccount = await lookupAccount(token);
      if (!userAccount) {
        res.statusCode = 401;
        return res.json({ ok: false, error: "Sign-in could not be checked." });
      }
      if (body.name && !userAccount.displayName) userAccount.displayName = String(body.name).slice(0, 120);
      var sentUser = await sendNewUser(userAccount, body.phone);
      return res.json({ ok: true, sent: sentUser });
    }
    res.statusCode = 400;
    return res.json({ ok: false, error: "Unknown notice." });
  } catch (err) {
    console.error("admin notice failed:", err);
    res.statusCode = 500;
    return res.json({ ok: false, error: "Could not send the notice." });
  }
}

handler.sendNewIp = sendNewIp;
module.exports = handler;
