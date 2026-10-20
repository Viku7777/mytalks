/**
 * Optional preview: send all templates with sample data to SMTP_TEST_TO.
 * Production emails use real booking fields via /api/send-booking-email.
 *
 *   cd mail && npm run send:templates
 */
const { sendMail } = require("./smtp");
const { listTemplates, renderTemplate } = require("./templates");

function previewData() {
  return {
    name: "Vikrant",
    email: process.env.SMTP_TEST_TO || "",
    bookingId: "BK-PREVIEW",
    advisorName: "Aisha Rahman",
    previousAdvisor: "Rohan Mehta",
    date: "22 Oct 2026",
    timeRange: "11:00 AM – 11:45 AM",
    previousTime: "21 Oct 2026, 4:00 PM – 4:45 PM",
    mode: "Voice",
    status: "Pending",
    amount: "₹699",
    dashboardUrl: "https://mytalk.in/pages/dashboard",
    bookUrl: "https://mytalk.in/pages/book-session",
  };
}

async function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function main() {
  var to = process.env.SMTP_TEST_TO;
  if (!to || !String(to).trim()) {
    throw new Error("Set SMTP_TEST_TO in mail/.env");
  }

  var base = previewData();
  var keys = listTemplates();
  console.log("Sending " + keys.length + " preview templates to " + to + "…");

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var data = Object.assign({}, base, { status: "Pending" });
    if (key === "booking-confirmed" || key === "booking-reminder") data.status = "Confirmed";
    if (key === "booking-cancelled") data.status = "Cancelled";
    if (key === "booking-completed") data.status = "Completed";
    if (key === "booking-time-changed" || key === "booking-advisor-changed") data.status = "Confirmed";

    var rendered = renderTemplate(key, data);
    var info = await sendMail({
      to: to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    console.log("  " + (i + 1) + "/" + keys.length + "  " + key + "  →  " + (info.messageId || "sent"));
    if (i < keys.length - 1) await sleep(1500);
  }

  console.log("Done.");
}

main().catch(function (err) {
  console.error((err && err.message) || err);
  process.exit(1);
});
