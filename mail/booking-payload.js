/**
 * Turn a Firestore / client booking object into template fields.
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function friendlyDate(value) {
  var text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    var parts = text.slice(0, 10).split("-");
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  }
  return text || "";
}

function friendlyClock(value) {
  var parts = String(value || "").split(":");
  if (parts.length < 2) return String(value || "");
  var h = Number(parts[0]);
  var m = Number(parts[1]) || 0;
  if (isNaN(h)) return String(value || "");
  var suffix = h >= 12 ? "PM" : "AM";
  var hour12 = h % 12 || 12;
  return hour12 + ":" + pad2(m) + " " + suffix;
}

function timeRange(booking) {
  var start = friendlyClock(booking.time);
  if (!start) return "";
  if (booking.endTime) return start + " – " + friendlyClock(booking.endTime);
  return start;
}

function money(total) {
  if (total == null || total === "") return "";
  var n = Number(total);
  if (isNaN(n)) return String(total);
  return "₹" + n.toLocaleString("en-IN");
}

function modeLabel(mode) {
  var value = String(mode || "").toLowerCase();
  if (!value || value === "chat") return "Voice";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function guestName(booking) {
  if (booking.name) return String(booking.name).trim();
  var email = String(booking.email || "").trim();
  if (email.indexOf("@") > 0) return email.split("@")[0];
  return "";
}

function bookingToTemplateData(booking, extras) {
  booking = booking || {};
  extras = extras || {};
  var status = booking.status || extras.status || "";
  return {
    name: guestName(booking),
    email: String(booking.email || "").trim().toLowerCase(),
    bookingId: booking.bookingId || booking.id || "",
    advisorName: booking.advisorName || "",
    previousAdvisor: extras.previousAdvisor || "",
    date: friendlyDate(booking.date),
    timeRange: timeRange(booking),
    previousTime: extras.previousTime || "",
    mode: modeLabel(booking.mode),
    status: status,
    amount: money(booking.total),
    dashboardUrl: extras.dashboardUrl || "https://mytalk.in/pages/dashboard",
    bookUrl: extras.bookUrl || "https://mytalk.in/pages/book-session",
  };
}

module.exports = {
  bookingToTemplateData: bookingToTemplateData,
  friendlyDate: friendlyDate,
  friendlyClock: friendlyClock,
  timeRange: timeRange,
};
