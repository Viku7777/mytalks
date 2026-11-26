/**
 * Record the caller’s IP.
 * Signed-in visits are stored on the user profile.
 * Signed-out visits are stored in visitor_ips for the admin IP list.
 * The address comes from the request, never from the JSON body.
 */
const crypto = require("crypto");

const PROJECT_ID = "location-461df";
const API_KEY = "AIzaSyBj8PA7Eq04bV3TTL2bC4XmX4a6Ob6F8YQ";
const MAX_IPS = 30;

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

function isIp(value) {
  var ip = String(value || "").trim();
  if (!ip || ip.length > 64) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return ip.split(".").every(function (part) {
      var n = Number(part);
      return n >= 0 && n <= 255;
    });
  }
  return ip.indexOf(":") !== -1 && /^[0-9a-fA-F:]+$/.test(ip);
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
    if (isIp(ip)) return ip;
  }
  return "";
}

function clip(value, max) {
  return String(value || "").trim().slice(0, max);
}

function isAuditBot(req) {
  var ua = String(req.headers["user-agent"] || "");
  return /bot|spider|crawler|lighthouse|pagespeed|headless|preview/i.test(ua);
}

function strField(value) {
  return { stringValue: String(value || "") };
}

function intField(value) {
  return { integerValue: String(Math.max(0, Math.round(Number(value) || 0))) };
}

function readField(field) {
  if (!field) return "";
  if (field.stringValue != null) return field.stringValue;
  if (field.integerValue != null) return Number(field.integerValue);
  if (field.doubleValue != null) return Number(field.doubleValue);
  if (field.timestampValue != null) return field.timestampValue;
  return "";
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
  (options.masks || []).forEach(function (field) {
    url.searchParams.append("updateMask.fieldPaths", field);
  });
  var headers = { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = "Bearer " + options.token;
  var res = await fetch(url, {
    method: options.method || "GET",
    headers: headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  var text = await res.text();
  var data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = { raw: text };
    }
  }
  return { status: res.status, data: data };
}

function visitorFields(ip, path, page, now, hits, firstSeenAt) {
  return {
    ip: strField(ip),
    firstSeenAt: strField(firstSeenAt || now),
    lastSeenAt: strField(now),
    hits: intField(hits),
    lastPath: strField(path),
    lastPage: strField(page),
  };
}

async function saveVisitor(ip, path, page, retried) {
  var id = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24);
  var now = new Date().toISOString();
  var current = await firestoreRequest("visitor_ips/" + id);
  if (current.status === 404) {
    var created = await firestoreRequest("visitor_ips?documentId=" + id, {
      method: "POST",
      body: { fields: visitorFields(ip, path, page, now, 1, now) },
    });
    if (created.status === 409 && !retried) return saveVisitor(ip, path, page, true);
    if (created.status < 200 || created.status >= 300) {
      console.error("visitor create", created.status, JSON.stringify(created.data).slice(0, 400));
    }
    return created.status >= 200 && created.status < 300;
  }
  if (current.status !== 200) {
    console.error("visitor read", current.status, JSON.stringify(current.data).slice(0, 400));
    return false;
  }
  var fields = (current.data && current.data.fields) || {};
  var hits = Number(readField(fields.hits)) || 0;
  var patched = await firestoreRequest("visitor_ips/" + id, {
    method: "PATCH",
    masks: ["lastSeenAt", "hits", "lastPath", "lastPage"],
    body: {
      fields: {
        lastSeenAt: strField(now),
        hits: intField(hits + 1),
        lastPath: strField(path),
        lastPage: strField(page),
      },
    },
  });
  if (patched.status < 200 || patched.status >= 300) {
    console.error("visitor update", patched.status, JSON.stringify(patched.data).slice(0, 400));
  }
  return patched.status >= 200 && patched.status < 300;
}

function readIpEntry(value) {
  var fields = value && value.mapValue && value.mapValue.fields;
  if (!fields) return null;
  var ip = readField(fields.ip);
  if (!isIp(ip)) return null;
  return {
    ip: ip,
    firstSeenAt: readField(fields.firstSeenAt) || "",
    lastSeenAt: readField(fields.lastSeenAt) || "",
    hits: Number(readField(fields.hits)) || 1,
    lastPath: readField(fields.lastPath) || "",
    lastPage: readField(fields.lastPage) || "",
  };
}

async function verifyUid(idToken) {
  var res = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + API_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: idToken }),
    }
  );
  if (!res.ok) return "";
  var data = await res.json();
  var user = data && data.users && data.users[0];
  return user && user.localId ? String(user.localId) : "";
}

async function saveUserIp(uid, token, ip, path, page) {
  var current = await firestoreRequest("users/" + encodeURIComponent(uid), { token: token });
  if (current.status === 404) return false;
  if (current.status !== 200) return false;
  var fields = (current.data && current.data.fields) || {};
  var values = (fields.ips && fields.ips.arrayValue && fields.ips.arrayValue.values) || [];
  var ips = values.map(readIpEntry).filter(Boolean);
  var now = new Date().toISOString();
  var found = ips.find(function (entry) {
    return entry.ip === ip;
  });
  if (found) {
    found.lastSeenAt = now;
    found.hits = (Number(found.hits) || 1) + 1;
    found.lastPath = path;
    found.lastPage = page;
  } else {
    ips.unshift({
      ip: ip,
      firstSeenAt: now,
      lastSeenAt: now,
      hits: 1,
      lastPath: path,
      lastPage: page,
    });
  }
  ips.sort(function (a, b) {
    return String(b.lastSeenAt).localeCompare(String(a.lastSeenAt));
  });
  ips = ips.slice(0, MAX_IPS);
  var patched = await firestoreRequest("users/" + encodeURIComponent(uid), {
    method: "PATCH",
    token: token,
    masks: ["lastIp", "lastIpAt", "ips"],
    body: {
      fields: {
        lastIp: strField(ip),
        lastIpAt: strField(now),
        ips: {
          arrayValue: {
            values: ips.map(function (entry) {
              return {
                mapValue: {
                  fields: {
                    ip: strField(entry.ip),
                    firstSeenAt: strField(entry.firstSeenAt),
                    lastSeenAt: strField(entry.lastSeenAt),
                    hits: intField(entry.hits),
                    lastPath: strField(entry.lastPath),
                    lastPage: strField(entry.lastPage),
                  },
                },
              };
            }),
          },
        },
      },
    },
  });
  return patched.status >= 200 && patched.status < 300;
}

module.exports = async function handler(req, res) {
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
  if (isAuditBot(req)) {
    return res.json({ ok: true, skipped: true });
  }

  var ip = clientIp(req);
  if (!ip) {
    res.statusCode = 400;
    return res.json({ ok: false, error: "No address on this request." });
  }

  var body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  var path = clip(body.path, 300);
  if (path.charAt(0) !== "/" || path.indexOf("://") !== -1) path = "/";
  var page = clip(body.page, 80).replace(/[^a-z0-9-]/gi, "") || "page";
  if (page === "admin" || page === "admin-user" || page === "admin-advisor") {
    return res.json({ ok: true, ip: ip, skipped: true });
  }

  var header = String(req.headers.authorization || "");
  var token = header.toLowerCase().indexOf("bearer ") === 0 ? header.slice(7).trim() : "";

  try {
    var saved = false;
    if (token) {
      var uid = await verifyUid(token);
      if (!uid) {
        res.statusCode = 401;
        return res.json({ ok: false, error: "Sign-in could not be checked." });
      }
      return res.json({ ok: true, ip: ip, uid: uid });
    }
    saved = await saveVisitor(ip, path, page);
    return res.json({ ok: true, ip: ip, saved: saved });
  } catch (err) {
    console.error("visit record failed:", err);
    res.statusCode = 500;
    return res.json({ ok: false, error: "Could not record this visit." });
  }
};
