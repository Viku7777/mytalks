/**
 * Razorpay webhook receiver (server-side payment confirmation).
 * Dashboard URL: https://mytalk.in/api/razorpay-webhook
 *
 * Env: RAZORPAY_WEBHOOK_SECRET (from Razorpay → Webhooks → Secret)
 *
 * Verifies X-Razorpay-Signature (HMAC-SHA256 of raw body).
 * Handles payment.captured / payment.failed / order.paid (ack + log).
 * Booking create still runs from the client after checkout; webhook is the
 * durable backup / audit trail if the browser closes mid-flow.
 */
const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function rawBody(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (req.body && typeof req.body === "object") {
    return JSON.stringify(req.body);
  }
  return "";
}

function verifySignature(bodyString, signature, secret) {
  if (!bodyString || !signature || !secret) return false;
  var expected = crypto.createHmac("sha256", secret).update(bodyString).digest("hex");
  var a = Buffer.from(expected, "utf8");
  var b = Buffer.from(String(signature), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.json({ ok: false, error: "Use POST." });
  }

  var secret = String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    console.error("razorpay-webhook: RAZORPAY_WEBHOOK_SECRET is not set");
    res.statusCode = 500;
    return res.json({ ok: false, error: "Webhook secret not configured." });
  }

  var bodyString = rawBody(req);
  var signature = String(
    req.headers["x-razorpay-signature"] || req.headers["X-Razorpay-Signature"] || ""
  ).trim();
  var eventId = String(
    req.headers["x-razorpay-event-id"] || req.headers["X-Razorpay-Event-Id"] || ""
  ).trim();

  if (!verifySignature(bodyString, signature, secret)) {
    console.warn("razorpay-webhook: signature mismatch", { eventId: eventId || null });
    res.statusCode = 400;
    return res.json({ ok: false, error: "Invalid signature." });
  }

  var payload;
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (parseErr) {
    res.statusCode = 400;
    return res.json({ ok: false, error: "Invalid JSON body." });
  }

  var event = String(payload.event || "");
  var entity =
    (payload.payload &&
      payload.payload.payment &&
      payload.payload.payment.entity) ||
    (payload.payload && payload.payload.order && payload.payload.order.entity) ||
    null;

  var summary = {
    eventId: eventId || null,
    event: event,
    paymentId: entity && entity.id && String(entity.id).indexOf("pay_") === 0 ? entity.id : null,
    orderId: (entity && (entity.order_id || entity.id)) || null,
    status: (entity && entity.status) || null,
    amount: entity && entity.amount != null ? entity.amount : null,
    currency: (entity && entity.currency) || null,
    notes: (entity && entity.notes) || null,
  };

  // Idempotent ack — Razorpay may retry the same x-razorpay-event-id.
  console.log("[razorpay-webhook]", JSON.stringify(summary));

  if (
    event === "payment.captured" ||
    event === "payment.authorized" ||
    event === "order.paid"
  ) {
    // Client checkout still creates the booking after verify-payment.
    // Use this log (or a future Admin write) to reconcile unpaid captures.
  }

  res.statusCode = 200;
  return res.json({ ok: true, received: true, event: event, eventId: eventId || null });
};
