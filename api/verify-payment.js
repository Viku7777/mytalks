/**
 * Vercel serverless: verify Razorpay payment signature (HMAC-SHA256).
 * POST { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */
const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

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

function cors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async function handler(req, res) {
  cors(req, res);

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

  var keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  if (!keySecret) {
    res.statusCode = 500;
    return res.json({
      ok: false,
      error: "Razorpay is not configured. Set RAZORPAY_KEY_SECRET.",
    });
  }

  try {
    var body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    var orderId = String(body.razorpay_order_id || "").trim();
    var paymentId = String(body.razorpay_payment_id || "").trim();
    var signature = String(body.razorpay_signature || "").trim();

    if (!orderId || !paymentId || !signature) {
      res.statusCode = 400;
      return res.json({
        ok: false,
        error: "razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.",
      });
    }

    var expected = crypto
      .createHmac("sha256", keySecret)
      .update(orderId + "|" + paymentId)
      .digest("hex");

    var a = Buffer.from(expected, "utf8");
    var b = Buffer.from(signature, "utf8");
    var match = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!match) {
      res.statusCode = 400;
      return res.json({ ok: false, verified: false, error: "Payment signature mismatch." });
    }

    res.statusCode = 200;
    return res.json({
      ok: true,
      verified: true,
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
    });
  } catch (err) {
    console.error("verify-payment failed:", err);
    res.statusCode = 500;
    return res.json({
      ok: false,
      error: (err && err.message) || "Could not verify payment.",
    });
  }
};
