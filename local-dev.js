#!/usr/bin/env node
/**
 * Local server: static site (cleanUrls) + Vercel-style /api handlers.
 * Use this for Razorpay / email API testing without `vercel login`.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3456);
const HOST = "127.0.0.1";

const API = {
  "/api/create-order": require("./api/create-order"),
  "/api/verify-payment": require("./api/verify-payment"),
  "/api/razorpay-webhook": require("./api/razorpay-webhook"),
  "/api/send-booking-email": require("./api/send-booking-email"),
  "/api/debug-ingest": require("./api/debug-ingest"),
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function resolveFile(urlPath) {
  var rel = decodeURIComponent(urlPath.split("?")[0]).replace(/^\/+/, "");
  if (!rel) rel = "index.html";
  var candidate = path.resolve(ROOT, rel);
  if (!candidate.startsWith(ROOT)) return null;

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    var index = path.join(candidate, "index.html");
    if (fs.existsSync(index)) return index;
  }
  var html = candidate + ".html";
  if (fs.existsSync(html) && fs.statSync(html).isFile()) return html;
  if (rel.endsWith("/")) {
    var slashHtml = path.resolve(ROOT, rel.replace(/\/+$/, "") + ".html");
    if (fs.existsSync(slashHtml) && fs.statSync(slashHtml).isFile()) return slashHtml;
  }
  return null;
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on("data", function (c) {
      chunks.push(c);
    });
    req.on("end", function () {
      var raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      var type = String(req.headers["content-type"] || "");
      if (type.includes("application/json")) {
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(err);
        }
        return;
      }
      resolve(raw);
    });
    req.on("error", reject);
  });
}

function wrapRes(res) {
  return {
    statusCode: 200,
    headersSent: false,
    setHeader: function (k, v) {
      res.setHeader(k, v);
    },
    end: function (body) {
      if (!this.headersSent) {
        res.statusCode = this.statusCode;
        this.headersSent = true;
      }
      res.end(body);
    },
    json: function (obj) {
      if (!this.headersSent) {
        res.statusCode = this.statusCode;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        this.headersSent = true;
      }
      res.end(JSON.stringify(obj));
      return this;
    },
  };
}

async function handleApi(req, res, handler) {
  var wrapped = wrapRes(res);
  try {
    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      req.body = await readBody(req);
    } else {
      req.body = {};
    }
    await handler(req, wrapped);
    if (!wrapped.headersSent) {
      wrapped.end();
    }
  } catch (err) {
    console.error(err);
    if (!wrapped.headersSent) {
      wrapped.statusCode = 500;
      wrapped.json({ ok: false, error: (err && err.message) || "Server error" });
    }
  }
}

function serveStatic(req, res, filePath) {
  var ext = path.extname(filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  if (ext === ".css" || ext === ".js" || ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp" || ext === ".svg" || ext === ".ico" || ext === ".woff2") {
    res.setHeader("Cache-Control", "public, max-age=2592000");
  }
  fs.createReadStream(filePath).pipe(res);
}

let canonicalToolsPromise;
function loadCanonicalTools() {
  if (!canonicalToolsPromise) {
    canonicalToolsPromise = Promise.all([
      import("./lib/page-canonical.mjs"),
      import("./lib/prerender-pages.mjs"),
    ]).then(function (mods) {
      return Object.assign({}, mods[0], mods[1]);
    });
  }
  return canonicalToolsPromise;
}

async function serveCanonicalPage(res, filePath, pathname, searchParams) {
  var tools = await loadCanonicalTools();
  var raw = fs.readFileSync(filePath, "utf8");
  var href = tools.canonicalHref(pathname, searchParams);
  var rendered = tools.prerenderDocument(raw, pathname, searchParams);
  var body;
  if (href && (rendered.found || rendered.dataMissing)) {
    var source = rendered.found ? rendered.html : raw;
    body = tools.rewritePageHtml(source, href).html;
  } else {
    body = tools.noindexShellHtml(rendered.html || raw);
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (href) res.setHeader("Link", "<" + href + '>; rel="canonical"');
  res.end(body);
}

const server = http.createServer(async function (req, res) {
  var url = new URL(req.url || "/", "http://" + HOST + ":" + PORT);
  var pathname = url.pathname;

  if (API[pathname]) {
    return handleApi(req, res, API[pathname]);
  }

  var filePath = resolveFile(pathname);
  if (!filePath) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
    return;
  }
  var tools = await loadCanonicalTools();
  if (tools.isProfileOrArticle(pathname)) {
    if (!tools.canonicalHref(pathname, url.searchParams)) {
      var dest = pathname.indexOf("advisor-profile") !== -1 ? "/pages/find-advisor" : "/pages/blog";
      res.statusCode = 301;
      res.setHeader("Location", dest);
      res.setHeader("Cache-Control", "no-store");
      res.end();
      return;
    }
    return serveCanonicalPage(res, filePath, pathname, url.searchParams);
  }
  serveStatic(req, res, filePath);
});

server.listen(PORT, HOST, function () {
  console.log("MyTalk local (static + API) at http://" + HOST + ":" + PORT + "/");
  console.log(
    "APIs: /api/create-order, /api/verify-payment, /api/razorpay-webhook, /api/send-booking-email"
  );
  console.log("Press Ctrl+C to stop.");
});
