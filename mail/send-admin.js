/**
 * Short notices to the MyTalk admin inbox.
 */
const { sendMail } = require("./smtp");

var ADMIN_TO = "admin@mytalk.in";

function line(label, value) {
  var text = String(value || "").trim();
  return text ? label + ": " + text : "";
}

async function sendAdminNotice(subject, lines) {
  var text = lines.filter(Boolean).join("\n");
  var html =
    "<div style=\"font-family:Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#111827\">" +
    lines
      .filter(Boolean)
      .map(function (row) {
        return "<p style=\"margin:0 0 8px\">" + escapeHtml(row) + "</p>";
      })
      .join("") +
    "</div>";
  var info = await sendMail({
    to: ADMIN_TO,
    subject: subject,
    text: text,
    html: html,
  });
  return { messageId: info.messageId, to: ADMIN_TO };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = {
  sendAdminNotice: sendAdminNotice,
};
