/**
 * Vercel serverless: create a Razorpay order for Standard Checkout.
 * POST { amount } — amount in paise (min 100). Optional: currency, receipt, notes.
 */
const path = require("path");
const Razorpay = require("razorpay");
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

function credentials() {
  var keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  var keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  return { keyId: keyId, keySecret: keySecret };
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

  var creds = credentials();
  if (!creds.keyId || !creds.keySecret) {
    res.statusCode = 500;
    return res.json({
      ok: false,
      error: "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
    });
  }

  try {
    var body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    var amount = Number(body.amount);
    var currency = String(body.currency || "INR").trim().toUpperCase() || "INR";
    var receipt = String(body.receipt || "rcpt_" + Date.now()).slice(0, 40);
    var notes = body.notes && typeof body.notes === "object" ? body.notes : undefined;

    if (!Number.isFinite(amount) || amount < 100) {
      res.statusCode = 400;
      return res.json({
        ok: false,
        error: "Amount must be at least 100 paise.",
      });
    }

    var razorpay = new Razorpay({
      key_id: creds.keyId,
      key_secret: creds.keySecret,
    });

    var orderPayload = {
      amount: Math.round(amount),
      currency: currency,
      receipt: receipt,
    };
    if (notes) orderPayload.notes = notes;

    var order = await razorpay.orders.create(orderPayload);

    res.statusCode = 200;
    return res.json({
      ok: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: creds.keyId,
    });
  } catch (err) {
    console.error("create-order failed:", err);
    var status = Number(err && err.statusCode) || 500;
    var razorpayError = err && err.error;
    var message =
      (razorpayError && (razorpayError.description || razorpayError.reason || razorpayError.code)) ||
      (err && err.message) ||
      "Could not create order.";
    if (status === 401 || /authentication|auth|credentials/i.test(String(message))) {
      res.statusCode = 401;
      return res.json({ ok: false, error: "Razorpay authentication failed." });
    }
    res.statusCode = status >= 400 && status < 600 ? status : 500;
    return res.json({ ok: false, error: String(message) });
  }
};
