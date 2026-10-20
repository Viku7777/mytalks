/**
 * Client helper: ask the server to send a booking email through Titan.
 * Fails quietly so booking / admin UI still works offline or on local static serve.
 */
(function () {
  var EVENT_MAP = {
    pending: "pending",
    confirmed: "confirmed",
    "time-changed": "time-changed",
    "advisor-changed": "advisor-changed",
    cancelled: "cancelled",
    completed: "completed",
    reminder: "reminder",
  };

  function apiUrl() {
    try {
      return new URL("/api/send-booking-email", window.location.origin).toString();
    } catch (err) {
      return "/api/send-booking-email";
    }
  }

  async function notifyBookingEmail(event, booking, extras) {
    if (!EVENT_MAP[event]) {
      console.warn("Unknown mail event:", event);
      return { ok: false, skipped: true };
    }
    if (!booking || !booking.email) {
      return { ok: false, skipped: true };
    }

    try {
      var res = await fetch(apiUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: event,
          booking: {
            bookingId: booking.bookingId || booking.id || "",
            id: booking.id || "",
            advisorId: booking.advisorId || "",
            advisorName: booking.advisorName || "",
            date: booking.date || "",
            time: booking.time || "",
            endTime: booking.endTime || "",
            mode: booking.mode || "voice",
            email: booking.email || "",
            phone: booking.phone || "",
            name: booking.name || "",
            total: booking.total,
            status: booking.status || "",
          },
          extras: extras || {},
        }),
      });
      var json = null;
      try {
        json = await res.json();
      } catch (parseErr) {
        json = null;
      }
      if (!res.ok) {
        console.warn("Booking email failed:", json && json.error);
        return { ok: false, error: json && json.error };
      }
      return { ok: true, result: json && json.result };
    } catch (err) {
      console.warn("Booking email request failed:", err);
      return { ok: false, error: (err && err.message) || "network" };
    }
  }

  window.MyTalksMail = {
    notify: notifyBookingEmail,
  };
})();
