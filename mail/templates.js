/**
 * MyTalk booking email templates (production).
 * Pass real booking fields only — no demo placeholders.
 */

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fill(str, data) {
  return String(str || "").replace(/\{\{(\w+)\}\}/g, function (_, key) {
    return data[key] == null ? "" : String(data[key]);
  });
}

function wrap(opts) {
  var title = opts.title || "MyTalk";
  var preheader = opts.preheader || "";
  var body = opts.body || "";
  var accent = opts.accent || "#5b6cff";

  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
    "<title>" +
    esc(title) +
    "</title></head>" +
    '<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Arial,Helvetica,sans-serif;color:#111827;">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">' +
    esc(preheader) +
    "</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">' +
    "<tr><td align=\"center\">" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">' +
    '<tr><td style="background:' +
    accent +
    ';padding:20px 28px;">' +
    '<p style="margin:0;font-family:Poppins,Arial,sans-serif;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">My<span style="opacity:0.92;">Talk</span></p>' +
    '<p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.85);">Someone to talk. Someone to understand.</p>' +
    "</td></tr>" +
    '<tr><td style="padding:28px;">' +
    body +
    "</td></tr>" +
    '<tr><td style="padding:0 28px 28px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e5e7eb;">' +
    '<tr><td style="padding:16px 18px;font-size:13px;color:#6b7280;line-height:1.5;">' +
    "Need help? Reply to this email or write to " +
    '<a href="mailto:support@mytalk.in" style="color:#5b6cff;text-decoration:none;">support@mytalk.in</a>.' +
    "<br />WhatsApp: 7777050076" +
    "</td></tr></table></td></tr>" +
    '<tr><td style="padding:0 28px 24px;font-size:12px;color:#9ca3af;line-height:1.5;">' +
    "MyTalk is private emotional support, not an emergency or medical service. " +
    "If you are in crisis, contact local emergency services." +
    "</td></tr>" +
    "</table></td></tr></table></body></html>"
  );
}

function detailRow(label, value) {
  if (value == null || value === "") return "";
  return (
    "<tr>" +
    '<td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;width:38%;vertical-align:top;">' +
    esc(label) +
    "</td>" +
    '<td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;font-weight:600;vertical-align:top;">' +
    esc(value) +
    "</td></tr>"
  );
}

function detailsCard(data) {
  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">' +
    '<tr><td style="padding:4px 18px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
    detailRow("Booking ID", data.bookingId) +
    detailRow("Advisor", data.advisorName) +
    detailRow("Date", data.date) +
    detailRow("Time", data.timeRange) +
    detailRow("Mode", data.mode) +
    detailRow("Status", data.status) +
    detailRow("Amount", data.amount) +
    "</table></td></tr></table>"
  );
}

function cta(href, label) {
  if (!href) return "";
  return (
    '<p style="margin:24px 0 0;">' +
    '<a href="' +
    esc(href) +
    '" style="display:inline-block;background:#5b6cff;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:10px;">' +
    esc(label) +
    "</a></p>"
  );
}

function heading(text) {
  return (
    '<h1 style="margin:0 0 12px;font-family:Poppins,Arial,sans-serif;font-size:22px;line-height:1.3;color:#111827;">' +
    esc(text) +
    "</h1>"
  );
}

function para(text) {
  return (
    '<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">' +
    esc(text) +
    "</p>"
  );
}

function note(text, color) {
  if (!text) return "";
  return (
    '<p style="margin:16px 0 0;padding:12px 14px;background:' +
    (color || "#eff2ff") +
    ';border-radius:10px;font-size:14px;line-height:1.5;color:#111827;">' +
    esc(text) +
    "</p>"
  );
}

var TEMPLATES = {
  "booking-pending": {
    subject: "Your MyTalk booking is pending — {{bookingId}}",
    build: function (data) {
      return wrap({
        title: "Booking pending",
        preheader: "We received your session request with " + (data.advisorName || "your advisor") + ".",
        accent: "#f59e0b",
        body:
          heading("Your booking is pending") +
          para("Hi " + (data.name || "there") + ",") +
          para(
            "We received your session request. The time may change in some cases. We’ll email you as soon as your advisor confirms."
          ) +
          detailsCard(data) +
          note("Status: Pending — waiting for advisor confirmation.") +
          cta(data.dashboardUrl, "View dashboard"),
      });
    },
    text: function (data) {
      return (
        "Your MyTalk booking is pending\n\nHi " +
        (data.name || "there") +
        ",\n\nWe received your session request. We’ll email you when your advisor confirms.\n\n" +
        "Booking ID: " +
        (data.bookingId || "") +
        "\nAdvisor: " +
        (data.advisorName || "") +
        "\nDate: " +
        (data.date || "") +
        "\nTime: " +
        (data.timeRange || "") +
        "\nAmount: " +
        (data.amount || "") +
        (data.dashboardUrl ? "\n\nDashboard: " + data.dashboardUrl : "")
      );
    },
  },

  "booking-confirmed": {
    subject: "Session confirmed with {{advisorName}} — {{date}}",
    build: function (data) {
      return wrap({
        title: "Booking confirmed",
        preheader: "Your session with " + (data.advisorName || "your advisor") + " is confirmed.",
        accent: "#16a34a",
        body:
          heading("Your session is confirmed") +
          para("Hi " + (data.name || "there") + ",") +
          para(
            "Good news — your advisor confirmed the booking. Join on time from a quiet place with a stable connection."
          ) +
          detailsCard(data) +
          note("Status: Confirmed — you’re all set.") +
          cta(data.dashboardUrl, "Open dashboard"),
      });
    },
    text: function (data) {
      return (
        "Your MyTalk session is confirmed\n\nAdvisor: " +
        (data.advisorName || "") +
        "\nDate: " +
        (data.date || "") +
        "\nTime: " +
        (data.timeRange || "") +
        "\nBooking ID: " +
        (data.bookingId || "")
      );
    },
  },

  "booking-time-changed": {
    subject: "Updated time for your MyTalk session — {{date}}",
    build: function (data) {
      return wrap({
        title: "Time updated",
        preheader: "Your session time was updated to " + (data.timeRange || "") + ".",
        accent: "#5b6cff",
        body:
          heading("Your session time was updated") +
          para("Hi " + (data.name || "there") + ",") +
          para("The date or start time for your booking has changed. Please check the new details below.") +
          note(data.previousTime ? "Previous: " + data.previousTime : "") +
          detailsCard(data) +
          cta(data.dashboardUrl, "See new time"),
      });
    },
    text: function (data) {
      return (
        "Your MyTalk session time was updated\n\n" +
        (data.previousTime ? "Previous: " + data.previousTime + "\n" : "") +
        "New date: " +
        (data.date || "") +
        "\nNew time: " +
        (data.timeRange || "") +
        "\nAdvisor: " +
        (data.advisorName || "")
      );
    },
  },

  "booking-advisor-changed": {
    subject: "Your advisor was updated — now {{advisorName}}",
    build: function (data) {
      return wrap({
        title: "Advisor updated",
        preheader: "Your session is now with " + (data.advisorName || "a new advisor") + ".",
        accent: "#5b6cff",
        body:
          heading("Your advisor was updated") +
          para("Hi " + (data.name || "there") + ",") +
          para("We’ve assigned a different advisor for this session. Your booking details are below.") +
          note(data.previousAdvisor ? "Previous advisor: " + data.previousAdvisor : "") +
          detailsCard(data) +
          cta(data.dashboardUrl, "View booking"),
      });
    },
    text: function (data) {
      return (
        "Your MyTalk advisor was updated\n\n" +
        (data.previousAdvisor ? "Previous: " + data.previousAdvisor + "\n" : "") +
        "New advisor: " +
        (data.advisorName || "") +
        "\nDate: " +
        (data.date || "") +
        "\nTime: " +
        (data.timeRange || "")
      );
    },
  },

  "booking-cancelled": {
    subject: "Your MyTalk booking was cancelled — {{bookingId}}",
    build: function (data) {
      return wrap({
        title: "Booking cancelled",
        preheader: "Your session with " + (data.advisorName || "your advisor") + " was cancelled.",
        accent: "#ef4444",
        body:
          heading("Your booking was cancelled") +
          para("Hi " + (data.name || "there") + ",") +
          para(
            "This session has been cancelled. If you still want to talk, you can book a new time whenever you’re ready."
          ) +
          detailsCard(data) +
          note("Status: Cancelled", "#fef2f2") +
          cta(data.bookUrl, "Book a new session"),
      });
    },
    text: function (data) {
      return (
        "Your MyTalk booking was cancelled\n\nBooking ID: " +
        (data.bookingId || "") +
        "\nAdvisor: " +
        (data.advisorName || "") +
        "\nDate: " +
        (data.date || "") +
        (data.bookUrl ? "\n\nBook again: " + data.bookUrl : "")
      );
    },
  },

  "booking-completed": {
    subject: "Thank you — your MyTalk session is complete",
    build: function (data) {
      return wrap({
        title: "Session complete",
        preheader: "Your session with " + (data.advisorName || "your advisor") + " is marked complete.",
        accent: "#16a34a",
        body:
          heading("Your session is complete") +
          para("Hi " + (data.name || "there") + ",") +
          para(
            "Thank you for talking with us. Your session has been marked complete. We hope it felt supportive — you’re welcome to book again whenever you need someone to talk to."
          ) +
          detailsCard(data) +
          note("Status: Completed — thank you for choosing MyTalk.") +
          cta(data.bookUrl, "Book another session"),
      });
    },
    text: function (data) {
      return (
        "Your MyTalk session is complete\n\nHi " +
        (data.name || "there") +
        ",\n\nThank you for talking with us. Your session has been marked complete.\n\n" +
        "Booking ID: " +
        (data.bookingId || "") +
        "\nAdvisor: " +
        (data.advisorName || "") +
        "\nDate: " +
        (data.date || "") +
        "\nTime: " +
        (data.timeRange || "") +
        (data.bookUrl ? "\n\nBook again: " + data.bookUrl : "")
      );
    },
  },

  "booking-reminder": {
    subject: "Reminder: session with {{advisorName}} at {{timeRange}}",
    build: function (data) {
      return wrap({
        title: "Session reminder",
        preheader: "Your MyTalk session starts soon.",
        accent: "#ff7a59",
        body:
          heading("Your session is coming up") +
          para("Hi " + (data.name || "there") + ",") +
          para("This is a gentle reminder for your upcoming MyTalk session. Find a quiet place and join on time.") +
          detailsCard(data) +
          cta(data.dashboardUrl, "Open dashboard"),
      });
    },
    text: function (data) {
      return (
        "Reminder: your MyTalk session is coming up\n\nAdvisor: " +
        (data.advisorName || "") +
        "\nDate: " +
        (data.date || "") +
        "\nTime: " +
        (data.timeRange || "")
      );
    },
  },
};

var EVENT_TO_TEMPLATE = {
  pending: "booking-pending",
  confirmed: "booking-confirmed",
  "time-changed": "booking-time-changed",
  "advisor-changed": "booking-advisor-changed",
  cancelled: "booking-cancelled",
  completed: "booking-completed",
  reminder: "booking-reminder",
};

function listTemplates() {
  return Object.keys(TEMPLATES);
}

function renderTemplate(key, data) {
  var tpl = TEMPLATES[key];
  if (!tpl) throw new Error("Unknown template: " + key);
  var merged = Object.assign({}, data || {});
  if (!merged.dashboardUrl) merged.dashboardUrl = "https://mytalk.in/pages/dashboard";
  if (!merged.bookUrl) merged.bookUrl = "https://mytalk.in/pages/book-session";
  return {
    key: key,
    subject: fill(tpl.subject, merged),
    html: tpl.build(merged),
    text: tpl.text(merged),
  };
}

function renderEvent(event, data) {
  var key = EVENT_TO_TEMPLATE[event] || event;
  return renderTemplate(key, data);
}

module.exports = {
  TEMPLATES: TEMPLATES,
  EVENT_TO_TEMPLATE: EVENT_TO_TEMPLATE,
  listTemplates: listTemplates,
  renderTemplate: renderTemplate,
  renderEvent: renderEvent,
  fill: fill,
};
