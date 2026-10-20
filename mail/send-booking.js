/**
 * Send one production booking email through Titan SMTP.
 */
const { sendMail } = require("./smtp");
const { renderEvent } = require("./templates");
const { bookingToTemplateData } = require("./booking-payload");

async function sendBookingEmail(event, booking, extras) {
  var data = bookingToTemplateData(booking, extras);
  if (!data.email) {
    throw new Error("Booking has no email address.");
  }
  var rendered = renderEvent(event, data);
  var info = await sendMail({
    to: data.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    replyTo: "support@mytalk.in",
  });
  return {
    messageId: info.messageId,
    to: data.email,
    template: rendered.key,
    subject: rendered.subject,
  };
}

module.exports = {
  sendBookingEmail: sendBookingEmail,
};
