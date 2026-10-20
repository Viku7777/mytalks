/**
 * Vercel serverless: send a MyTalk booking email via Titan SMTP.
 * POST { event, booking, extras? }
 */
const { sendBookingEmail } = require("../mail/send-booking");
const { EVENT_TO_TEMPLATE } = require("../mail/templates");

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

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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

  try {
    var body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    var event = String(body.event || "").trim();
    var booking = body.booking || {};
    var extras = body.extras || {};

    if (!EVENT_TO_TEMPLATE[event] && !String(event).startsWith("booking-")) {
      res.statusCode = 400;
      return res.json({ ok: false, error: "Unknown email event." });
    }
    if (!booking.email) {
      res.statusCode = 400;
      return res.json({ ok: false, error: "Booking email is required." });
    }

    var result = await sendBookingEmail(event, booking, extras);
    res.statusCode = 200;
    return res.json({ ok: true, result: result });
  } catch (err) {
    console.error("send-booking-email failed:", err);
    res.statusCode = 500;
    return res.json({
      ok: false,
      error: (err && err.message) || "Could not send email.",
    });
  }
};
