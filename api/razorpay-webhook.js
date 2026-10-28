/**
 * Razorpay webhook receiver (server-to-server).
 * Verify X-Razorpay-Signature with RAZORPAY_WEBHOOK_SECRET, then acknowledge.
 *
 * Dashboard: https://dashboard.razorpay.com/app/webhooks
 * URL: https://mytalk.in/api/razorpay-webhook
 * Events: payment.captured, payment.failed, order.paid
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

function parseBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  try {
    return JSON.parse(rawBody(req) || "{}");
  } catch (err) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.json({ ok: false, error: "Use POST." });
  }

  var webhookSecret = String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  if (!webhookSecret) {
    console.error("razorpay-webhook: RAZORPAY_WEBHOOK_SECRET is not set");
    res.statusCode = 500;
    return res.json({ ok: false, error: "Webhook secret not configured." });
  }

  var signature = String(req.headers["x-razorpay-signature"] || "").trim();
  if (!signature) {
    res.statusCode = 400;
    return res.json({ ok: false, error: "Missing X-Razorpay-Signature." });
  }

  var bodyText = rawBody(req);
  var expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(bodyText)
    .digest("hex");

  var a = Buffer.from(expected, "utf8");
  var b = Buffer.from(signature, "utf8");
  var match = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!match) {
    console.warn("razorpay-webhook: signature mismatch");
    res.statusCode = 400;
    return res.json({ ok: false, error: "Invalid signature." });
  }

  var event = parseBody(req);
  if (!event) {
    res.statusCode = 400;
    return res.json({ ok: false, error: "Invalid JSON body." });
  }

  var eventName = String(event.event || "");
  var payload = event.payload || {};
  var paymentEntity =
    (payload.payment && payload.payment.entity) || null;
  var orderEntity = (payload.order && payload.order.entity) || null;

  console.log("[razorpay-webhook]", {
    event: eventName,
    account_id: event.account_id || "",
    payment_id: paymentEntity && paymentEntity.id,
    order_id:
      (paymentEntity && paymentEntity.order_id) ||
      (orderEntity && orderEntity.id) ||
      "",
    status: (paymentEntity && paymentEntity.status) || "",
    amount: paymentEntity && paymentEntity.amount,
  });

  // Always acknowledge quickly so Razorpay does not retry forever.
  // Client-side /api/verify-payment still confirms the booking in the UI;
  // this webhook is the durable server-side record for captures/failures.
  res.statusCode = 200;
  return res.json({
    ok: true,
    received: true,
    event: eventName,
  });
};
