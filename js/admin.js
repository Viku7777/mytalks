(function () {
  var root = document.querySelector("[data-admin-root]");
  if (!root) return;

  var state = {
    users: [],
    tickets: [],
    bookings: [],
    advisors: [],
    tab: "users",
    bookingView: "upcoming",
    editing: null,
    selectedUserId: null,
    selectedAdvisorId: null,
    visits: [],
    contacts: [],
    rankSaving: "",
  };

  function esc(value) {
    return window.MyTalksData
      ? window.MyTalksData.escapeHtml(value)
      : String(value == null ? "" : value);
  }

  function toast(message, type) {
    if (window.MyTalksUI) window.MyTalksUI.showToast(message, type);
  }

  function waitAuth() {
    if (window.MyTalksAuth && window.MyTalksAuth.ready) return window.MyTalksAuth.ready;
    return new Promise(function (resolve) {
      document.addEventListener("mytalks:auth-ready", function () {
        resolve(window.MyTalksAuth && window.MyTalksAuth.getUser());
      }, { once: true });
    });
  }

  function money(n) {
    return "₹" + (Number(n) || 0).toLocaleString("en-IN");
  }

  function dayKey(value) {
    var text = String(value || "");
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    var date = new Date(text);
    if (isNaN(date.getTime())) return "Unknown date";
    return date.toISOString().slice(0, 10);
  }

  async function loadAll() {
    var DB = window.MyTalksDB;
    var results = await Promise.all([
      DB.listUsers(),
      DB.listTickets(),
      DB.listBookings(),
      DB.listAdvisors({ includeInactive: true }),
      DB.listBookingVisits
        ? DB.listBookingVisits().catch(function () {
            return [];
          })
        : [],
      DB.listContacts
        ? DB.listContacts().catch(function () {
            return [];
          })
        : [],
    ]);
    state.users = results[0];
    state.tickets = results[1];
    state.bookings = results[2];
    state.advisors = results[3];
    state.visits = results[4] || [];
    state.contacts = results[5] || [];
    if (!state.advisors.length && window.MyTalksData) {
      var sample = await window.MyTalksData.loadJson("advisors.json");
      state.advisors = await DB.seedAdvisors(sample);
    }
  }

  function advisorOptions(selected) {
    return sortedAdvisors()
      .map(function (a) {
        var rank = Number(a.rank) > 0 ? "#" + Number(a.rank) + " " : "";
        return (
          '<option value="' +
          esc(a.id) +
          '"' +
          (String(selected) === String(a.id) ? " selected" : "") +
          ">" +
          rank +
          esc(a.name) +
          "</option>"
        );
      })
      .join("");
  }

  var USER_LABELS = {
    name: "Name",
    displayName: "Display name",
    email: "Email",
    phone: "Phone",
    uid: "User ID",
    id: "Document ID",
    role: "Role",
    is_block: "Blocked",
    emailVerified: "Email verified",
    provider: "Sign-in method",
    photoURL: "Photo",
    createdAt: "Created",
    createdAtClient: "Created on device",
    updatedAt: "Updated",
    lastLoginAt: "Last login",
    lastLoginAtClient: "Last login on device",
    timezone: "Timezone",
    locale: "Language",
    platform: "Platform",
    userAgent: "Browser",
    bookingPageVisitCount: "Booking page visits",
    lastBookingPageVisitAt: "Last booking page visit",
    lastBookingPageVisitAtClient: "Last booking page visit on device",
  };

  function formatDetail(key, value) {
    if (value == null || value === "") return "—";
    if (key === "is_block" || key === "emailVerified") return value === true ? "Yes" : "No";
    if (key === "photoURL") {
      return (
        '<a href="' +
        esc(value) +
        '" target="_blank" rel="noopener noreferrer">' +
        esc(value) +
        "</a>"
      );
    }
    if (typeof value === "object") return esc(JSON.stringify(value));
    return esc(value);
  }

  function recordId() {
    return new URLSearchParams(window.location.search).get("id") || "";
  }

  function statusBadge(status) {
    var raw = String(status || "Pending");
    var lower = raw.toLowerCase();
    var label = lower === "cancelled" || lower === "canceled" ? "Cancel" : raw;
    var kind = "badge";
    if (lower === "pending") kind = "badge badge--warning";
    if (lower === "confirmed" || lower === "completed" || lower === "complete") {
      kind = "badge badge--success";
    }
    return '<span class="' + kind + '">' + esc(label) + "</span>";
  }

  function prettyWhen(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (isNaN(date.getTime())) return esc(String(value));
    return esc(
      date.toLocaleString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    );
  }

  function advisorNameById(id) {
    var found = state.advisors.find(function (a) {
      return String(a.id) === String(id);
    });
    return found && found.name ? found.name : id || "Not chosen";
  }

  function bookingClock(booking) {
    if (!booking) return "—";
    if (booking.endTime) return (booking.time || "") + "–" + booking.endTime;
    return booking.time || "—";
  }

  function fact(label, value) {
    if (value == null || value === "") return "";
    var text = Array.isArray(value) ? value.join(", ") : String(value);
    if (!text) return "";
    return "<div><dt>" + esc(label) + "</dt><dd>" + esc(text) + "</dd></div>";
  }

  function statBox(value, label) {
    return (
      '<div class="card stat-box"><strong>' +
      esc(value) +
      "</strong><span>" +
      esc(label) +
      "</span></div>"
    );
  }

  function renderUsers() {
    if (!state.users.length) return '<p class="empty-state">No users yet.</p>';
    return (
      '<p class="admin-user__hint">Tap a user to open their profile.</p>' +
      '<div class="table-wrap card"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>' +
      state.users
        .map(function (u) {
          var id = u.id || u.uid;
          var blocked = u.is_block === true;
          return (
            '<tr class="admin-user-row" data-open-user="' +
            esc(id) +
            '" tabindex="0"><td data-label="Name"><a href="admin-user?id=' +
            esc(encodeURIComponent(id)) +
            '">' +
            esc(u.name || u.displayName || "—") +
            "</a>" +
            '</td><td data-label="Email">' +
            esc(u.email || "—") +
            '</td><td data-label="Phone">' +
            esc(u.phone || "—") +
            '</td><td data-label="Role">' +
            esc(u.role || "user") +
            '</td><td data-label="Status">' +
            (blocked ? "Blocked" : "Active") +
            '</td><td data-label=""><button type="button" class="btn btn--ghost btn--sm" data-block="' +
            esc(id) +
            '" data-next="' +
            (blocked ? "false" : "true") +
            '">' +
            (blocked ? "Unblock" : "Block") +
            "</button></td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  function renderTickets() {
    if (!state.tickets.length) return '<p class="empty-state">No tickets yet.</p>';
    return (
      '<div class="admin-stack">' +
      state.tickets
        .map(function (t) {
          var id = t.ticketId || t.id;
          return (
            '<article class="card admin-record"><div><strong>' +
            esc(id) +
            "</strong> · " +
            esc(t.email || "") +
            "<h3>" +
            esc(t.subject || "Ticket") +
            "</h3><p>" +
            esc(t.description || "") +
            '</p></div><label>Status<select class="form-select" data-ticket-status="' +
            esc(id) +
            '"><option' +
            (t.status === "Open" ? " selected" : "") +
            '>Open</option><option' +
            (t.status === "In progress" ? " selected" : "") +
            '>In progress</option><option' +
            (t.status === "Resolved" ? " selected" : "") +
            ">Resolved</option></select></label></article>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function bookingEnd(b) {
    var dateText = dayKey(b.date);
    if (!/^\d{4}-\d{2}-\d{2}/.test(dateText)) return 0;
    var clock = b.endTime || b.time || "00:00";
    var parts = String(clock).split(":");
    var when = new Date(
      Number(dateText.slice(0, 4)),
      Number(dateText.slice(5, 7)) - 1,
      Number(dateText.slice(8, 10)),
      Number(parts[0]) || 0,
      Number(parts[1]) || 0,
      0,
      0
    );
    if (!b.endTime && b.durationMinutes) {
      when = new Date(when.getTime() + Number(b.durationMinutes) * 60000);
    }
    return when.getTime();
  }

  function isCompleteBooking(b) {
    var status = String(b.status || "").toLowerCase();
    if (status === "completed" || status === "complete" || status === "cancelled" || status === "canceled") {
      return true;
    }
    var end = bookingEnd(b);
    return end > 0 && end < Date.now();
  }

  function notifyBookingMail(event, booking, extras) {
    if (!window.MyTalksMail || !window.MyTalksMail.notify || !booking) return;
    window.MyTalksMail.notify(event, booking, extras || {}).catch(function () {});
  }

  function setBookingBusy(button, label) {
    if (!button) return;
    var row = button.closest("tr");
    if (row) {
      row.classList.add("is-saving");
      row.querySelectorAll("button, input, select").forEach(function (el) {
        el.disabled = true;
      });
    }
    if (!button.getAttribute("data-label")) {
      button.setAttribute("data-label", button.textContent);
    }
    button.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ' + label;
    button.setAttribute("aria-busy", "true");
  }

  function clearBookingBusy(button) {
    if (!button) return;
    var row = button.closest("tr");
    if (row) {
      row.classList.remove("is-saving");
      row.querySelectorAll("button, input, select").forEach(function (el) {
        el.disabled = false;
      });
    }
    button.removeAttribute("aria-busy");
    button.textContent = button.getAttribute("data-label") || button.textContent;
  }

  function endClock(start, minutes) {
    var parts = String(start || "00:00").split(":");
    var total = (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0) + (Number(minutes) || 0);
    total = ((total % 1440) + 1440) % 1440;
    var h = Math.floor(total / 60);
    var m = total % 60;
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }

  function modeLabel(mode) {
    var value = String(mode || "").toLowerCase();
    if (!value || value === "chat") return "Voice";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function renderBookings() {
    var complete = state.bookingView === "complete";
    var upcomingCount = 0;
    var completeCount = 0;
    state.bookings.forEach(function (b) {
      if (isCompleteBooking(b)) completeCount += 1;
      else upcomingCount += 1;
    });
    var rows = state.bookings.filter(function (b) {
      return isCompleteBooking(b) === complete;
    });
    rows.sort(function (a, b) {
      var diff = bookingEnd(a) - bookingEnd(b);
      return complete ? -diff : diff;
    });
    var sub =
      '<div class="tabs tabs--sub" role="tablist">' +
      '<button type="button" class="tab-btn' +
      (complete ? "" : " is-active") +
      '" data-booking-view="upcoming">Upcoming bookings (' +
      upcomingCount +
      ")</button>" +
      '<button type="button" class="tab-btn' +
      (complete ? " is-active" : "") +
      '" data-booking-view="complete">Complete bookings (' +
      completeCount +
      ")</button></div>";
    if (!rows.length) {
      return sub + '<p class="empty-state">' + (complete ? "No complete bookings." : "No upcoming bookings.") + "</p>";
    }
    var head = complete
      ? "<th>Advisor</th><th>User</th><th>Date</th><th>Time</th><th>Mode</th><th>Status</th><th>Amount</th>"
      : "<th>User</th><th>Date and time</th><th>Advisor</th><th>Mode</th><th>Status</th><th>Amount</th><th>Actions</th>";
    return (
      sub +
      '<div class="table-wrap card"><table><thead><tr>' +
      head +
      "</tr></thead><tbody>" +
      rows
        .map(function (b) {
          var id = b.bookingId || b.id;
          var confirmed = String(b.status || "").toLowerCase() === "confirmed";
          if (complete) {
            return (
              "<tr><td data-label=\"Advisor\">" +
              esc(b.advisorName || b.advisorId || "—") +
              '</td><td data-label="User">' +
              esc(b.email || b.phone || "—") +
              '</td><td data-label="Date">' +
              esc(dayKey(b.date)) +
              '</td><td data-label="Time">' +
              esc(b.endTime ? (b.time || "") + "–" + b.endTime : b.time || "—") +
              '</td><td data-label="Mode">' +
              esc(modeLabel(b.mode)) +
              '</td><td data-label="Status">' +
              esc(b.status || "Complete") +
              '</td><td data-label="Amount">' +
              money(b.total) +
              "</td></tr>"
            );
          }
          return (
            "<tr><td data-label=\"User\">" +
            esc(b.email || b.phone || "—") +
            '</td><td data-label="Date and time"><div class="booking-edit">' +
            '<input class="form-control" type="date" data-booking-date value="' +
            esc(dayKey(b.date)) +
            '" />' +
            '<input class="form-control" type="time" data-booking-time value="' +
            esc(b.time || "") +
            '" />' +
            '<button type="button" class="btn btn--ghost btn--sm" data-booking-save="' +
            esc(id) +
            '">Update time</button></div></td>' +
            '<td data-label="Advisor"><select class="form-select" data-booking-advisor="' +
            esc(id) +
            '">' +
            advisorOptions(b.advisorId) +
            "</select></td>" +
            '<td data-label="Mode">' +
            esc(modeLabel(b.mode)) +
            '</td><td data-label="Status">' +
            esc(b.status || "Pending") +
            '</td><td data-label="Amount">' +
            money(b.total) +
            '</td><td data-label="Actions"><div class="booking-edit">' +
            (confirmed
              ? '<button type="button" class="btn btn--ghost btn--sm" disabled>Confirmed</button>'
              : '<button type="button" class="btn btn--primary btn--sm" data-booking-confirm="' +
                esc(id) +
                '">Confirm</button>') +
            '<button type="button" class="btn btn--primary btn--sm" data-booking-complete="' +
            esc(id) +
            '">Complete</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-booking-cancel="' +
            esc(id) +
            '">Cancel</button></div></td></tr>'
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  function renderPayments() {
    var groups = {};
    state.bookings.forEach(function (b) {
      var key = dayKey(b.date || b.createdAt);
      if (!groups[key]) groups[key] = { total: 0, count: 0, rows: [] };
      groups[key].total += Number(b.total) || 0;
      groups[key].count += 1;
      groups[key].rows.push(b);
    });
    var days = Object.keys(groups).sort().reverse();
    if (!days.length) return '<p class="empty-state">No bookings yet.</p>';
    return days
      .map(function (day) {
        var group = groups[day];
        return (
          '<section class="admin-day"><h3>' +
          esc(day) +
          " · " +
          group.count +
          " sessions · " +
          money(group.total) +
          "</h3>" +
          '<div class="table-wrap card"><table><thead><tr><th>Booking</th><th>User</th><th>Advisor</th><th>Time</th><th>Mode</th><th>Amount</th><th>Change advisor</th></tr></thead><tbody>' +
          group.rows
            .map(function (b) {
              var id = b.bookingId || b.id;
              return (
                '<tr><td data-label="Booking">' +
                esc(id) +
                '</td><td data-label="User">' +
                esc(b.email || "—") +
                '</td><td data-label="Advisor">' +
                esc(b.advisorName || b.advisorId || "—") +
                '</td><td data-label="Time">' +
                esc(b.endTime ? (b.time || "") + "–" + b.endTime : b.time || "—") +
                '</td><td data-label="Mode">' +
                esc(modeLabel(b.mode)) +
                '</td><td data-label="Amount">' +
                money(b.total) +
                '</td><td data-label="Advisor"><select class="form-select" data-booking-advisor="' +
                esc(id) +
                '">' +
                advisorOptions(b.advisorId) +
                "</select></td></tr>"
              );
            })
            .join("") +
          "</tbody></table></div></section>"
        );
      })
      .join("");
  }

  var RATE_TIERS = [
    { minutes: 30, discount: 0 },
    { minutes: 45, discount: 0.05 },
    { minutes: 60, discount: 0.1 },
    { minutes: 90, discount: 0.15 },
    { minutes: 120, discount: 0.2 },
  ];

  function sessionRates(base) {
    var amount = Number(base) || 0;
    return RATE_TIERS.map(function (tier) {
      var gross = amount * (tier.minutes / 30);
      return {
        minutes: tier.minutes,
        discount: tier.discount,
        price: Math.round(gross * (1 - tier.discount)),
      };
    });
  }

  function ratePreviewHtml(base) {
    return sessionRates(base)
      .map(function (tier) {
        var off = tier.discount ? " · " + Math.round(tier.discount * 100) + "% off" : "";
        return (
          "<div><strong>" +
          tier.minutes +
          " min</strong> " +
          money(tier.price) +
          off +
          "</div>"
        );
      })
      .join("");
  }

  function parseClock(value) {
    if (!value) return null;
    var parts = String(value).split(":");
    var hours = Number(parts[0]);
    var minutes = Number(parts[1] || 0);
    if (!isFinite(hours) || !isFinite(minutes)) return null;
    if (hours === 24 && minutes === 0) return 1440;
    return hours * 60 + minutes;
  }

  function storeClock(mins) {
    var total = Math.max(0, Math.min(1440, mins));
    if (total === 1440) return "24:00";
    var hours = Math.floor(total / 60);
    var minutes = total % 60;
    return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
  }

  function prettyClock(mins) {
    var normalized = mins >= 1440 ? 0 : mins;
    var hours = Math.floor(normalized / 60);
    var minutes = normalized % 60;
    var suffix = hours >= 12 ? "PM" : "AM";
    var hour12 = hours % 12 || 12;
    return hour12 + ":" + String(minutes).padStart(2, "0") + " " + suffix;
  }

  function spanLabel(mins) {
    var hours = Math.floor(mins / 60);
    var minutes = mins % 60;
    if (!minutes) return hours + (hours === 1 ? " hour" : " hours");
    if (!hours) return minutes + " min";
    return hours + " h " + minutes + " min";
  }

  var HOUR_PRESETS = [
    { label: "Morning", start: "08:00", end: "12:00" },
    { label: "Afternoon", start: "12:00", end: "17:00" },
    { label: "Evening", start: "17:00", end: "22:00" },
    { label: "Daytime", start: "09:00", end: "18:00" },
    { label: "Extended", start: "10:00", end: "22:00" },
  ];

  function paintHours(picker) {
    if (!picker) return;
    var startInput = picker.querySelector("[data-hours-start]");
    var endInput = picker.querySelector("[data-hours-end]");
    var start = parseClock(startInput.value);
    var end = parseClock(endInput.value);
    if (start == null) start = 9 * 60;
    if (end == null || end <= start) end = Math.min(1440, start + 12 * 60);
    startInput.value = storeClock(start);
    endInput.value = storeClock(end);
    var startPct = (start / 1440) * 100;
    var endPct = (end / 1440) * 100;
    var fill = picker.querySelector("[data-hours-fill]");
    var startHandle = picker.querySelector('[data-hours-handle="start"]');
    var endHandle = picker.querySelector('[data-hours-handle="end"]');
    if (fill) {
      fill.style.left = startPct + "%";
      fill.style.width = Math.max(0, endPct - startPct) + "%";
    }
    if (startHandle) {
      startHandle.style.left = startPct + "%";
      startHandle.setAttribute("aria-valuenow", String(start));
      startHandle.setAttribute("aria-valuetext", prettyClock(start));
    }
    if (endHandle) {
      endHandle.style.left = endPct + "%";
      endHandle.setAttribute("aria-valuenow", String(end));
      endHandle.setAttribute("aria-valuetext", prettyClock(end));
    }
    var open = picker.querySelector("[data-hours-open]");
    var close = picker.querySelector("[data-hours-close]");
    var summary = picker.querySelector("[data-hours-summary]");
    if (open) open.textContent = prettyClock(start);
    if (close) close.textContent = prettyClock(end);
    if (summary) {
      summary.textContent = prettyClock(start) + " – " + prettyClock(end) + " · " + spanLabel(end - start);
    }
    picker.querySelectorAll("[data-hours-preset]").forEach(function (btn) {
      var parts = btn.getAttribute("data-hours-preset").split(",");
      var active = storeClock(start) === parts[0] && storeClock(end) === parts[1];
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function setHours(picker, start, end) {
    if (!picker) return;
    var nextStart = Math.max(0, Math.min(start, 1410));
    var nextEnd = Math.max(nextStart + 30, Math.min(end, 1440));
    picker.querySelector("[data-hours-start]").value = storeClock(nextStart);
    picker.querySelector("[data-hours-end]").value = storeClock(nextEnd);
    paintHours(picker);
  }

  function minutesFromTrack(track, clientX) {
    var rect = track.getBoundingClientRect();
    var ratio = rect.width ? (clientX - rect.left) / rect.width : 0;
    ratio = Math.max(0, Math.min(1, ratio));
    return Math.round((ratio * 1440) / 30) * 30;
  }

  function hoursPickerHtml(startValue, endValue) {
    var start = parseClock(startValue);
    var end = parseClock(endValue);
    if (start == null) start = 9 * 60;
    if (end == null || end <= start) end = 21 * 60;
    var startPct = (start / 1440) * 100;
    var endPct = (end / 1440) * 100;
    return (
      '<section class="hours-picker" data-hours-picker>' +
      '<div class="hours-picker__head"><div><h4>Available hours</h4><p class="hint">Drag the handles, or pick a common shift. Bookings must fit inside this window.</p></div>' +
      '<p class="hours-picker__summary" data-hours-summary>' +
      esc(prettyClock(start) + " – " + prettyClock(end) + " · " + spanLabel(end - start)) +
      "</p></div>" +
      '<div class="hours-picker__presets" role="group" aria-label="Common shifts">' +
      HOUR_PRESETS.map(function (preset) {
        var active = storeClock(start) === preset.start && storeClock(end) === preset.end;
        return (
          '<button type="button" class="hours-picker__preset' +
          (active ? " is-active" : "") +
          '" data-hours-preset="' +
          preset.start +
          "," +
          preset.end +
          '" aria-pressed="' +
          (active ? "true" : "false") +
          '">' +
          esc(preset.label) +
          "<small>" +
          esc(prettyClock(parseClock(preset.start)) + "–" + prettyClock(parseClock(preset.end))) +
          "</small></button>"
        );
      }).join("") +
      "</div>" +
      '<div class="hours-picker__clock">' +
      '<div class="hours-picker__side"><span>Opens</span><strong data-hours-open>' +
      esc(prettyClock(start)) +
      '</strong><div class="hours-picker__step"><button type="button" data-hours-step="start" data-delta="-30" aria-label="Open 30 minutes earlier">−</button><button type="button" data-hours-step="start" data-delta="30" aria-label="Open 30 minutes later">+</button></div></div>' +
      '<div class="hours-picker__track-wrap"><div class="hours-picker__track" data-hours-track>' +
      '<div class="hours-picker__fill" data-hours-fill style="left:' +
      startPct +
      "%;width:" +
      (endPct - startPct) +
      '%"></div>' +
      '<button type="button" class="hours-picker__handle" data-hours-handle="start" aria-label="Opening time" role="slider" aria-valuemin="0" aria-valuemax="1410" aria-valuenow="' +
      start +
      '" style="left:' +
      startPct +
      '%"></button>' +
      '<button type="button" class="hours-picker__handle hours-picker__handle--end" data-hours-handle="end" aria-label="Closing time" role="slider" aria-valuemin="30" aria-valuemax="1440" aria-valuenow="' +
      end +
      '" style="left:' +
      endPct +
      '%"></button></div>' +
      '<div class="hours-picker__scale" aria-hidden="true"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span></div></div>' +
      '<div class="hours-picker__side hours-picker__side--end"><span>Closes</span><strong data-hours-close>' +
      esc(prettyClock(end)) +
      '</strong><div class="hours-picker__step"><button type="button" data-hours-step="end" data-delta="-30" aria-label="Close 30 minutes earlier">−</button><button type="button" data-hours-step="end" data-delta="30" aria-label="Close 30 minutes later">+</button></div></div>' +
      "</div>" +
      '<input type="hidden" name="hoursStart" data-hours-start value="' +
      esc(storeClock(start)) +
      '" />' +
      '<input type="hidden" name="hoursEnd" data-hours-end value="' +
      esc(storeClock(end)) +
      '" /></section>'
    );
  }

  function advisorForm(a) {
    a = a || {};
    var days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    var selected = a.availability || [];
    var price30 = a.price30 != null ? a.price30 : a.price || 0;
    var hoursStart = a.hoursStart || "";
    var hoursEnd = a.hoursEnd || "";
    return (
      '<form class="card admin-form" data-advisor-form><h3>' +
      (a.id ? "Edit advisor" : "New advisor") +
      '</h3><input type="hidden" name="id" value="' +
      esc(a.id || "") +
      '" /><div class="form-row"><div class="form-group"><label>Name</label><input class="form-control" name="name" required value="' +
      esc(a.name || "") +
      '" /></div><div class="form-group"><label>Gender</label><select class="form-select" name="gender"><option' +
      (a.gender === "Female" ? " selected" : "") +
      '>Female</option><option' +
      (a.gender === "Male" ? " selected" : "") +
      '>Male</option><option' +
      (a.gender === "Other" ? " selected" : "") +
      ">Other</option></select></div></div>" +
      '<div class="form-group"><label>Photo URL</label><input class="form-control" name="photo" value="' +
      esc(a.photo || "") +
      '" /></div><div class="form-group"><label>Bio</label><textarea class="form-textarea" name="bio">' +
      esc(a.bio || "") +
      '</textarea></div><div class="form-row"><div class="form-group"><label>Languages</label><input class="form-control" name="languages" value="' +
      esc((a.languages || []).join(", ")) +
      '" /></div><div class="form-group"><label>Specialties</label><input class="form-control" name="specialties" value="' +
      esc((a.specialties || []).join(", ")) +
      '" /></div></div><div class="form-row"><div class="form-group"><label>Skills</label><input class="form-control" name="skills" value="' +
      esc((a.skills || []).join(", ")) +
      '" /></div><div class="form-group"><label>Education</label><input class="form-control" name="education" value="' +
      esc(a.education || "") +
      '" /></div></div><div class="form-row"><div class="form-group"><label>Years</label><input class="form-control" name="experience" type="number" min="0" value="' +
      esc(a.experience || 0) +
      '" /></div><div class="form-group"><label>Rating</label><input class="form-control" name="rating" type="number" min="0" max="5" step="0.1" value="' +
      esc(a.rating || 5) +
      '" /></div><div class="form-group"><label>Reviews</label><input class="form-control" name="reviewsCount" type="number" min="0" value="' +
      esc(a.reviewsCount || 0) +
      '" /></div></div><div class="form-group"><label for="advisor-price-30">30 min price ₹</label><input class="form-control" id="advisor-price-30" name="price30" type="number" min="1" step="1" required value="' +
      esc(price30 || "") +
      '" /><p class="hint">Longer sessions use this price, then apply a discount: 45 min 5%, 60 min 10%, 90 min 15%, 120 min 20%.</p><div class="admin-rate-preview" data-rate-preview>' +
      ratePreviewHtml(price30) +
      '</div></div>' +
      hoursPickerHtml(hoursStart, hoursEnd) +
      '<fieldset class="form-group"><legend>Available days</legend><div class="admin-days">' +
      days
        .map(function (day) {
          return (
            '<label class="form-check"><input type="checkbox" name="availability" value="' +
            day +
            '"' +
            (selected.indexOf(day) >= 0 ? " checked" : "") +
            " /> " +
            day +
            "</label>"
          );
        })
        .join("") +
      '</div></fieldset><label class="form-check"><input type="checkbox" name="active"' +
      (a.active === false ? "" : " checked") +
      ' /> Visible on the website</label><div class="btn-group mt-4"><button class="btn btn--primary" type="submit">Save advisor</button><button class="btn btn--ghost" type="button" data-cancel-advisor>Cancel</button></div></form>'
    );
  }

  function sortedAdvisors() {
    return state.advisors.slice().sort(function (a, b) {
      var rankA = Number(a.rank) > 0 ? Number(a.rank) : 100000;
      var rankB = Number(b.rank) > 0 ? Number(b.rank) : 100000;
      if (rankA !== rankB) return rankA - rankB;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }

  function renderAdvisors() {
    var ordered = sortedAdvisors();
    var total = ordered.length;
    var visibleBefore = 0;
    var rows = total
      ? ordered
          .map(function (a, index) {
            var position = index + 1;
            var onHomepage = a.active !== false && visibleBefore < 3;
            if (a.active !== false) visibleBefore += 1;
            var options = "";
            var i;
            for (i = 1; i <= total; i++) {
              options +=
                '<option value="' +
                i +
                '"' +
                (i === position ? " selected" : "") +
                ">" +
                i +
                "</option>";
            }
            var saving = state.rankSaving && String(state.rankSaving) === String(a.id);
            return (
              '<li class="rank-board__row' +
              (saving ? " is-saving" : "") +
              '" data-open-advisor="' +
              esc(a.id) +
              '">' +
              '<span class="rank-board__badge">' +
              position +
              "</span>" +
              '<img src="' +
              esc(a.photo || "") +
              '" alt="" width="48" height="48" />' +
              '<div><a class="rank-board__name" href="admin-advisor?id=' +
              esc(encodeURIComponent(a.id)) +
              '"><strong>' +
              esc(a.name) +
              "</strong></a><p>" +
              esc((a.languages || []).join(", ")) +
              (a.active === false ? " · Hidden" : onHomepage ? " · On homepage" : "") +
              "</p></div>" +
              '<label class="rank-board__pick"><span>Rank</span><select class="form-select" data-advisor-rank="' +
              esc(a.id) +
              '">' +
              options +
              "</select></label>" +
              '<div class="rank-board__moves">' +
              '<button type="button" class="btn btn--ghost btn--sm" data-rank-move="up" data-rank-id="' +
              esc(a.id) +
              '"' +
              (position === 1 || state.rankSaving ? " disabled" : "") +
              ' aria-label="Move ' +
              esc(a.name) +
              ' up">' +
              (saving ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ' : "") +
              "Up</button>" +
              '<button type="button" class="btn btn--ghost btn--sm" data-rank-move="down" data-rank-id="' +
              esc(a.id) +
              '"' +
              (position === total || state.rankSaving ? " disabled" : "") +
              ' aria-label="Move ' +
              esc(a.name) +
              ' down">Down</button></div>' +
              '<div class="btn-group">' +
              '<button type="button" class="btn btn--ghost btn--sm" data-edit-advisor="' +
              esc(a.id) +
              '">Edit</button>' +
              '<button type="button" class="btn btn--ghost btn--sm" data-delete-advisor="' +
              esc(a.id) +
              '">Delete</button></div></li>'
            );
          })
          .join("")
      : '<p class="empty-state">No advisors in Firestore yet.</p>';
    return (
      '<p class="admin-user__hint">Tap an advisor name to open their bookings.</p>' +
      '<div class="btn-group mb-6"><button type="button" class="btn btn--primary" data-new-advisor>Add advisor</button></div>' +
      (state.editing !== null ? advisorForm(state.editing) : "") +
      '<section class="rank-board"><div class="rank-board__head"><h3>Display order</h3><p class="hint">Rank 1 appears first. The homepage shows the first three visible advisors.</p>' +
      (state.rankSaving
        ? '<p class="rank-board__status" role="status"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Updating order…</p>'
        : "") +
      '</div><ol class="rank-board__list">' +
      rows +
      "</ol></section>"
    );
  }

  function bookingsForUser(user) {
    var id = user.id || user.uid;
    var email = String(user.email || "").toLowerCase();
    return state.bookings
      .filter(function (b) {
        return b.userId === id || String(b.email || "").toLowerCase() === email;
      })
      .sort(function (a, b) {
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
  }

  function unfinishedVisits(user, bookings) {
    var id = user.id || user.uid;
    var email = String(user.email || "").toLowerCase();
    return (state.visits || [])
      .filter(function (visit) {
        return visit.userId === id || String(visit.email || "").toLowerCase() === email;
      })
      .filter(function (visit) {
        var opened = Date.parse(visit.visitedAtClient || visit.visitedAt || "");
        if (isNaN(opened)) return true;
        return !bookings.some(function (booking) {
          var created = Date.parse(booking.createdAt || "");
          return !isNaN(created) && created >= opened - 60000;
        });
      })
      .sort(function (a, b) {
        return String(b.visitedAtClient || b.visitedAt || "").localeCompare(
          String(a.visitedAtClient || a.visitedAt || "")
        );
      });
  }

  function renderUserPage() {
    var id = recordId();
    var user = state.users.find(function (item) {
      return String(item.id || item.uid) === String(id);
    });
    var title = document.querySelector("[data-page-title]");
    if (!user) {
      if (title) title.textContent = "User";
      root.innerHTML =
        '<a class="profile-back" href="admin?tab=users"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Users</a>' +
        '<div class="card"><h2>User not found</h2><p class="mt-4">This account is not in the admin list.</p></div>';
      return;
    }
    var name = user.name || user.displayName || user.email || "User";
    if (title) title.textContent = name;
    document.title = name + " — Admin";
    var bookings = bookingsForUser(user);
    var visits = unfinishedVisits(user, bookings);
    var email = String(user.email || "").toLowerCase();
    var tickets = state.tickets.filter(function (ticket) {
      return ticket.userId === (user.id || user.uid) || String(ticket.email || "").toLowerCase() === email;
    });
    var blocked = user.is_block === true;
    var photo = user.photoURL
      ? '<img class="profile-hero__photo" src="' + esc(user.photoURL) + '" alt="" width="88" height="88" />'
      : '<span class="profile-hero__photo profile-hero__fallback" aria-hidden="true">' +
        esc(String(name).charAt(0).toUpperCase()) +
        "</span>";
    var bookingRows = bookings.length
      ? bookings
          .map(function (booking) {
            return (
              "<tr><td data-label=\"Advisor\">" +
              esc(booking.advisorName || advisorNameById(booking.advisorId)) +
              '</td><td data-label="Date">' +
              esc(dayKey(booking.date)) +
              '</td><td data-label="Time">' +
              esc(bookingClock(booking)) +
              '</td><td data-label="Status">' +
              statusBadge(booking.status) +
              '</td><td data-label="Amount">' +
              money(booking.total) +
              "</td></tr>"
            );
          })
          .join("")
      : '<tr><td colspan="5">No bookings yet.</td></tr>';
    var visitRows = visits.length
      ? visits
          .map(function (visit) {
            var when = visit.visitedAtClient || visit.visitedAt || "";
            return (
              "<tr><td data-label=\"When\">" +
              prettyWhen(when) +
              '</td><td data-label="Advisor">' +
              esc(advisorNameById(visit.advisorId)) +
              "</td></tr>"
            );
          })
          .join("")
      : '<tr><td colspan="2">Every booking-page visit was followed by a booking.</td></tr>';
    var ticketRows = tickets.length
      ? tickets
          .map(function (ticket) {
            return (
              "<tr><td data-label=\"Ticket\">" +
              esc(ticket.ticketId || ticket.id) +
              '</td><td data-label="Subject">' +
              esc(ticket.subject || "Ticket") +
              '</td><td data-label="Status">' +
              statusBadge(ticket.status || "Open") +
              "</td></tr>"
            );
          })
          .join("")
      : '<tr><td colspan="3">No support tickets.</td></tr>';
    root.innerHTML =
      '<a class="profile-back" href="admin?tab=users"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Users</a>' +
      '<section class="card profile-hero">' +
      photo +
      '<div><p class="profile-kicker">User</p><h2>' +
      esc(name) +
      "</h2><p>" +
      esc(user.email || "No email on file") +
      '</p><div class="profile-pills">' +
      (blocked
        ? '<span class="badge">Blocked</span>'
        : '<span class="badge badge--success">Active</span>') +
      '<span class="badge">' +
      esc(user.role || "user") +
      "</span></div></div></section>" +
      '<div class="profile-stats">' +
      statBox(bookings.length, "Bookings") +
      statBox(visits.length, "Left without booking") +
      statBox(tickets.length, "Tickets") +
      "</div>" +
      '<section class="card profile-section"><h3>Account</h3><dl class="profile-facts">' +
      fact("Phone", user.phone) +
      fact("Sign-in", user.provider) +
      (user.createdAt ? '<div><dt>Created</dt><dd>' + prettyWhen(user.createdAt) + "</dd></div>" : "") +
      (user.lastLoginAt ? '<div><dt>Last login</dt><dd>' + prettyWhen(user.lastLoginAt) + "</dd></div>" : "") +
      fact("Timezone", user.timezone) +
      fact("Language", user.locale) +
      fact("Booking page visits", user.bookingPageVisitCount) +
      "</dl></section>" +
      '<section class="profile-section"><div class="profile-section__head"><h3>Bookings</h3><p>Newest first.</p></div>' +
      '<div class="table-wrap card"><table><thead><tr><th>Advisor</th><th>Date</th><th>Time</th><th>Status</th><th>Amount</th></tr></thead><tbody>' +
      bookingRows +
      "</tbody></table></div></section>" +
      '<section class="profile-section"><div class="profile-section__head"><h3>Opened the booking page, did not finish</h3><p>Visits with no booking afterward.</p></div>' +
      '<div class="table-wrap card"><table><thead><tr><th>When</th><th>Advisor</th></tr></thead><tbody>' +
      visitRows +
      "</tbody></table></div></section>" +
      '<section class="profile-section"><div class="profile-section__head"><h3>Support tickets</h3></div>' +
      '<div class="table-wrap card"><table><thead><tr><th>Ticket</th><th>Subject</th><th>Status</th></tr></thead><tbody>' +
      ticketRows +
      "</tbody></table></div></section>";
  }

  function renderAdvisorPage() {
    var id = recordId();
    var advisor = state.advisors.find(function (item) {
      return String(item.id) === String(id);
    });
    var title = document.querySelector("[data-page-title]");
    if (!advisor) {
      if (title) title.textContent = "Advisor";
      root.innerHTML =
        '<a class="profile-back" href="admin?tab=advisors"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Advisors</a>' +
        '<div class="card"><h2>Advisor not found</h2><p class="mt-4">This profile is not in the admin list.</p></div>';
      return;
    }
    if (title) title.textContent = advisor.name || "Advisor";
    document.title = (advisor.name || "Advisor") + " — Admin";
    var mine = state.bookings.filter(function (booking) {
      return String(booking.advisorId) === String(advisor.id);
    });
    var upcoming = mine
      .filter(function (booking) {
        return !isCompleteBooking(booking);
      })
      .sort(function (a, b) {
        return bookingEnd(a) - bookingEnd(b);
      });
    var complete = mine
      .filter(function (booking) {
        return isCompleteBooking(booking);
      })
      .sort(function (a, b) {
        return bookingEnd(b) - bookingEnd(a);
      });
    function sessionRows(list, emptyText) {
      if (!list.length) return '<tr><td colspan="5">' + esc(emptyText) + "</td></tr>";
      return list
        .map(function (booking) {
          return (
            "<tr><td data-label=\"User\">" +
            esc(booking.email || booking.phone || "—") +
            '</td><td data-label="Date">' +
            esc(dayKey(booking.date)) +
            '</td><td data-label="Time">' +
            esc(bookingClock(booking)) +
            '</td><td data-label="Status">' +
            statusBadge(booking.status) +
            '</td><td data-label="Amount">' +
            money(booking.total) +
            "</td></tr>"
          );
        })
        .join("");
    }
    var photo = advisor.photo
      ? '<img class="profile-hero__photo" src="' + esc(advisor.photo) + '" alt="" width="88" height="88" />'
      : '<span class="profile-hero__photo profile-hero__fallback" aria-hidden="true">' +
        esc(String(advisor.name || "A").charAt(0).toUpperCase()) +
        "</span>";
    var hours =
      advisor.hoursStart && advisor.hoursEnd ? advisor.hoursStart + "–" + advisor.hoursEnd : "";
    root.innerHTML =
      '<a class="profile-back" href="admin?tab=advisors"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Advisors</a>' +
      '<section class="card profile-hero">' +
      photo +
      '<div><p class="profile-kicker">Advisor</p><h2>' +
      esc(advisor.name || "Advisor") +
      "</h2><p>" +
      esc((advisor.languages || []).join(", ") || advisor.education || "") +
      '</p><div class="profile-pills">' +
      (advisor.active === false
        ? '<span class="badge">Hidden</span>'
        : '<span class="badge badge--success">Visible</span>') +
      (Number(advisor.rank) > 0
        ? '<span class="badge">Rank ' + esc(advisor.rank) + "</span>"
        : "") +
      "</div></div></section>" +
      '<div class="profile-stats">' +
      statBox(upcoming.length, "Upcoming") +
      statBox(complete.length, "Complete") +
      statBox(mine.length, "All bookings") +
      "</div>" +
      '<section class="card profile-section"><h3>Profile</h3>' +
      (advisor.bio ? '<p class="profile-bio">' + esc(advisor.bio) + "</p>" : "") +
      '<dl class="profile-facts">' +
      fact("Specialties", advisor.specialties) +
      fact("Languages", advisor.languages) +
      fact("Experience", advisor.experience ? advisor.experience + " years" : "") +
      fact("Education", advisor.education) +
      fact("Hours", hours) +
      fact("Days", advisor.availability) +
      fact("30 min price", advisor.price30 || advisor.price ? money(advisor.price30 || advisor.price) : "") +
      "</dl></section>" +
      '<section class="profile-section"><div class="profile-section__head"><h3>Upcoming bookings</h3><p>' +
      upcoming.length +
      " session" +
      (upcoming.length === 1 ? "" : "s") +
      '</p></div><div class="table-wrap card"><table><thead><tr><th>User</th><th>Date</th><th>Time</th><th>Status</th><th>Amount</th></tr></thead><tbody>' +
      sessionRows(upcoming, "No upcoming bookings.") +
      "</tbody></table></div></section>" +
      '<section class="profile-section"><div class="profile-section__head"><h3>Complete bookings</h3><p>' +
      complete.length +
      " session" +
      (complete.length === 1 ? "" : "s") +
      '</p></div><div class="table-wrap card"><table><thead><tr><th>User</th><th>Date</th><th>Time</th><th>Status</th><th>Amount</th></tr></thead><tbody>' +
      sessionRows(complete, "No complete bookings.") +
      "</tbody></table></div></section>";
  }

  function contactRows(source) {
    return (state.contacts || []).filter(function (item) {
      var kind = item.source || "contact";
      return kind === source;
    });
  }

  function renderInquiries() {
    var rows = contactRows("contact");
    if (!rows.length) return '<p class="empty-state">No contact messages yet.</p>';
    return (
      '<div class="table-wrap card"><table><thead><tr><th>When</th><th>Name</th><th>Email</th><th>Subject</th><th>Message</th></tr></thead><tbody>' +
      rows
        .map(function (item) {
          return (
            "<tr><td data-label=\"When\">" +
            prettyWhen(item.createdAt) +
            '</td><td data-label="Name">' +
            esc(item.name || "—") +
            '</td><td data-label="Email">' +
            esc(item.email || "—") +
            '</td><td data-label="Subject">' +
            esc(item.subject || "—") +
            '</td><td data-label="Message">' +
            esc(item.message || "—") +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  function renderApplications() {
    var rows = contactRows("advisor-apply");
    if (!rows.length) return '<p class="empty-state">No advisor applications yet.</p>';
    return (
      '<div class="table-wrap card"><table><thead><tr><th>When</th><th>Name</th><th>Email</th><th>Mobile</th><th>Languages</th><th>Experience</th><th>Specializations</th><th>Why they want to join</th></tr></thead><tbody>' +
      rows
        .map(function (item) {
          return (
            "<tr><td data-label=\"When\">" +
            prettyWhen(item.createdAt) +
            '</td><td data-label="Name">' +
            esc(item.name || "—") +
            '</td><td data-label="Email">' +
            esc(item.email || "—") +
            '</td><td data-label="Mobile">' +
            esc(item.phone || "—") +
            '</td><td data-label="Languages">' +
            esc(item.languages || "—") +
            '</td><td data-label="Experience">' +
            esc(item.experience || "—") +
            '</td><td data-label="Specializations">' +
            esc(item.specialties || "—") +
            '</td><td data-label="Why they want to join">' +
            esc(item.why || "—") +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  function render() {
    var labels = {
      users: "Users",
      tickets: "Tickets",
      payments: "Payments",
      bookings: "Bookings",
      advisors: "Advisors",
      inquiries: "Contact Us",
      applications: "Become an Advisor",
    };
    var panel =
      state.tab === "tickets"
        ? renderTickets()
        : state.tab === "payments"
          ? renderPayments()
          : state.tab === "bookings"
            ? renderBookings()
            : state.tab === "advisors"
              ? renderAdvisors()
              : state.tab === "inquiries"
                ? renderInquiries()
                : state.tab === "applications"
                  ? renderApplications()
                  : renderUsers();
    root.innerHTML =
      '<div class="tabs" role="tablist">' +
      ["users", "tickets", "payments", "bookings", "advisors", "inquiries", "applications"]
        .map(function (tab) {
          var label = labels[tab] || tab;
          return (
            '<button type="button" class="tab-btn' +
            (state.tab === tab ? " is-active" : "") +
            '" data-admin-tab="' +
            tab +
            '">' +
            label +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      panel;
  }

  function showGate(html) {
    root.innerHTML = html;
  }

  async function boot() {
    await waitAuth();
    var Auth = window.MyTalksAuth;
    var user = Auth && Auth.getUser ? Auth.getUser() : null;
    if (!user) {
      var next = encodeURIComponent(window.location.pathname + window.location.search);
      showGate(
        '<div class="card"><h2>Sign in required</h2><p class="mt-4">Use an admin account to manage MyTalk.</p><a class="btn btn--primary mt-6" href="login?next=' +
          next +
          '">Log in</a></div>'
      );
      return;
    }
    var DB = window.MyTalksDB;
    if (!DB || !DB.getUserProfile) {
      showGate('<p class="empty-state">Firestore is not available.</p>');
      return;
    }
    if (DB.ready) await DB.ready;
    var profile = await DB.getUserProfile(user.uid);
    if (!profile || profile.role !== "admin") {
      showGate(
        '<div class="card"><h2>Admin access needed</h2><p class="mt-4">This account is signed in as <strong>' +
          esc(user.email || user.uid) +
          "</strong>, but it is not an admin yet.</p><p class=\"mt-4\">In Firebase Console → Firestore → <code>users/" +
          esc(user.uid) +
          '</code>, set <code>role</code> to <code>admin</code>, then reload this page. Also deploy the updated <code>firestore.rules</code>.</p></div>'
      );
      return;
    }
    try {
      await loadAll();
      var view = root.getAttribute("data-admin-view") || "";
      if (!view) {
        var tab = new URLSearchParams(window.location.search).get("tab");
        if (tab) state.tab = tab;
      }
      if (view === "user") renderUserPage();
      else if (view === "advisor") renderAdvisorPage();
      else render();
    } catch (err) {
      showGate(
        '<div class="card"><h2>Could not load admin data</h2><p class="mt-4">' +
          esc((err && err.message) || "Permission denied") +
          "</p><p class=\"mt-4\">Deploy <code>firestore.rules</code> so admin accounts can read users, tickets, bookings, and advisors.</p></div>"
      );
    }
  }

  var hoursDrag = null;

  function moveHoursDrag(clientX) {
    if (!hoursDrag) return;
    var picker = hoursDrag.picker;
    var track = picker.querySelector("[data-hours-track]");
    var point = minutesFromTrack(track, clientX);
    var start = parseClock(picker.querySelector("[data-hours-start]").value);
    var end = parseClock(picker.querySelector("[data-hours-end]").value);
    if (hoursDrag.which === "start") setHours(picker, point, end);
    else setHours(picker, start, point);
  }

  root.addEventListener("keydown", function (e) {
    var handle = e.target.closest("[data-hours-handle]");
    if (handle) {
      var delta = 0;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = 30;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -30;
      if (!delta) return;
      e.preventDefault();
      var picker = handle.closest("[data-hours-picker]");
      var which = handle.getAttribute("data-hours-handle");
      var start = parseClock(picker.querySelector("[data-hours-start]").value);
      var end = parseClock(picker.querySelector("[data-hours-end]").value);
      if (which === "start") setHours(picker, start + delta, end);
      else setHours(picker, start, end + delta);
      return;
    }
    if (e.key !== "Enter" && e.key !== " ") return;
    var userRow = e.target.closest("[data-open-user]");
    if (!userRow || e.target.closest("[data-block]")) return;
    e.preventDefault();
    userRow.click();
  });

  root.addEventListener("click", function (e) {
    var preset = e.target.closest("[data-hours-preset]");
    if (preset) {
      var parts = preset.getAttribute("data-hours-preset").split(",");
      setHours(preset.closest("[data-hours-picker]"), parseClock(parts[0]), parseClock(parts[1]));
      return;
    }
    var step = e.target.closest("[data-hours-step]");
    if (!step) return;
    var picker = step.closest("[data-hours-picker]");
    var which = step.getAttribute("data-hours-step");
    var delta = Number(step.getAttribute("data-delta")) || 0;
    var start = parseClock(picker.querySelector("[data-hours-start]").value);
    var end = parseClock(picker.querySelector("[data-hours-end]").value);
    if (which === "start") setHours(picker, start + delta, end);
    else setHours(picker, start, end + delta);
  });

  root.addEventListener("pointerdown", function (e) {
    var handle = e.target.closest("[data-hours-handle]");
    var track = e.target.closest("[data-hours-track]");
    if (!handle && !track) return;
    var picker = (handle || track).closest("[data-hours-picker]");
    var which = "end";
    if (handle) {
      which = handle.getAttribute("data-hours-handle");
    } else {
      var start = parseClock(picker.querySelector("[data-hours-start]").value);
      var end = parseClock(picker.querySelector("[data-hours-end]").value);
      var point = minutesFromTrack(track, e.clientX);
      which = Math.abs(point - start) <= Math.abs(point - end) ? "start" : "end";
    }
    hoursDrag = { picker: picker, which: which };
    moveHoursDrag(e.clientX);
    e.preventDefault();
  });

  window.addEventListener("pointermove", function (e) {
    if (!hoursDrag) return;
    moveHoursDrag(e.clientX);
  });

  window.addEventListener("pointerup", function () {
    hoursDrag = null;
  });

  root.addEventListener("click", async function (e) {
    var saveTime = e.target.closest("[data-booking-save]");
    if (saveTime) {
      var timeId = saveTime.getAttribute("data-booking-save");
      var timeRow = saveTime.closest("tr");
      var nextDate = timeRow.querySelector("[data-booking-date]").value;
      var nextTime = timeRow.querySelector("[data-booking-time]").value;
      var currentBooking = state.bookings.find(function (item) {
        return String(item.bookingId || item.id) === String(timeId);
      });
      if (!nextDate || !nextTime) {
        toast("Choose a date and a start time.", "error");
        return;
      }
      setBookingBusy(saveTime, "Updating…");
      try {
        var nextEnd = endClock(nextTime, currentBooking && currentBooking.durationMinutes);
        var previousTime =
          (currentBooking &&
            (dayKey(currentBooking.date) +
              ", " +
              (currentBooking.endTime
                ? (currentBooking.time || "") + "–" + currentBooking.endTime
                : currentBooking.time || ""))) ||
          "";
        await window.MyTalksDB.updateBooking(timeId, {
          date: nextDate,
          time: nextTime,
          endTime: nextEnd,
        });
        notifyBookingMail(
          "time-changed",
          Object.assign({}, currentBooking || {}, {
            bookingId: timeId,
            date: nextDate,
            time: nextTime,
            endTime: nextEnd,
          }),
          { previousTime: previousTime }
        );
        await loadAll();
        render();
        toast("Time updated.");
      } catch (err) {
        clearBookingBusy(saveTime);
        toast((err && err.message) || "Could not update the time.", "error");
      }
      return;
    }
    var confirmBooking = e.target.closest("[data-booking-confirm]");
    if (confirmBooking) {
      setBookingBusy(confirmBooking, "Confirming…");
      try {
        var confirmId = confirmBooking.getAttribute("data-booking-confirm");
        var confirmRow = state.bookings.find(function (item) {
          return String(item.bookingId || item.id) === String(confirmId);
        });
        await window.MyTalksDB.updateBooking(confirmId, {
          status: "Confirmed",
        });
        notifyBookingMail(
          "confirmed",
          Object.assign({}, confirmRow || {}, {
            bookingId: confirmId,
            status: "Confirmed",
          })
        );
        await loadAll();
        render();
        toast("Booking confirmed.");
      } catch (err) {
        clearBookingBusy(confirmBooking);
        toast((err && err.message) || "Could not confirm the booking.", "error");
      }
      return;
    }
    var completeBooking = e.target.closest("[data-booking-complete]");
    if (completeBooking) {
      if (!window.confirm("Mark this booking as completed?")) return;
      setBookingBusy(completeBooking, "Completing…");
      try {
        var completeId = completeBooking.getAttribute("data-booking-complete");
        var completeRow = state.bookings.find(function (item) {
          return String(item.bookingId || item.id) === String(completeId);
        });
        await window.MyTalksDB.updateBooking(completeId, {
          status: "Completed",
        });
        notifyBookingMail(
          "completed",
          Object.assign({}, completeRow || {}, {
            bookingId: completeId,
            status: "Completed",
          })
        );
        await loadAll();
        render();
        toast("Booking completed.");
      } catch (err) {
        clearBookingBusy(completeBooking);
        toast((err && err.message) || "Could not complete the booking.", "error");
      }
      return;
    }
    var cancelBooking = e.target.closest("[data-booking-cancel]");
    if (cancelBooking) {
      if (!window.confirm("Cancel this booking?")) return;
      setBookingBusy(cancelBooking, "Cancelling…");
      try {
        var cancelId = cancelBooking.getAttribute("data-booking-cancel");
        var cancelRow = state.bookings.find(function (item) {
          return String(item.bookingId || item.id) === String(cancelId);
        });
        await window.MyTalksDB.updateBooking(cancelId, {
          status: "Cancelled",
        });
        notifyBookingMail(
          "cancelled",
          Object.assign({}, cancelRow || {}, {
            bookingId: cancelId,
            status: "Cancelled",
          })
        );
        await loadAll();
        render();
        toast("Booking cancelled.");
      } catch (err) {
        clearBookingBusy(cancelBooking);
        toast((err && err.message) || "Could not cancel the booking.", "error");
      }
      return;
    }
    var bookingView = e.target.closest("[data-booking-view]");
    if (bookingView) {
      state.bookingView = bookingView.getAttribute("data-booking-view") || "upcoming";
      render();
      return;
    }
    var tab = e.target.closest("[data-admin-tab]");
    if (tab) {
      state.tab = tab.getAttribute("data-admin-tab");
      state.editing = null;
      render();
      return;
    }
    if (e.target.closest("[data-close-user]")) {
      state.selectedUserId = null;
      render();
      return;
    }
    var advisorOpen = e.target.closest("[data-open-advisor]");
    if (advisorOpen && !e.target.closest("button, a, select, label, input")) {
      window.location.href =
        "admin-advisor?id=" + encodeURIComponent(advisorOpen.getAttribute("data-open-advisor"));
      return;
    }
    var blockBtn = e.target.closest("[data-block]");
    if (blockBtn) {
      try {
        await window.MyTalksDB.setUserAccess(blockBtn.getAttribute("data-block"), {
          is_block: blockBtn.getAttribute("data-next") === "true",
        });
        await loadAll();
        render();
        toast("User updated.");
      } catch (err) {
        toast((err && err.message) || "Could not update user.", "error");
      }
      return;
    }
    var userRow = e.target.closest("[data-open-user]");
    if (userRow && !e.target.closest("button, a, select, label, input")) {
      window.location.href =
        "admin-user?id=" + encodeURIComponent(userRow.getAttribute("data-open-user"));
      return;
    }
    if (e.target.closest("[data-new-advisor]")) {
      state.editing = {};
      render();
      return;
    }
    if (e.target.closest("[data-cancel-advisor]")) {
      state.editing = null;
      render();
      return;
    }
    var editBtn = e.target.closest("[data-edit-advisor]");
    if (editBtn) {
      state.editing =
        state.advisors.find(function (a) {
          return String(a.id) === editBtn.getAttribute("data-edit-advisor");
        }) || {};
      render();
      return;
    }
    var moveBtn = e.target.closest("[data-rank-move]");
    if (moveBtn) {
      if (state.rankSaving || moveBtn.disabled) return;
      var moveId = moveBtn.getAttribute("data-rank-id");
      var ordered = sortedAdvisors();
      var from = ordered.findIndex(function (advisor) {
        return String(advisor.id) === String(moveId);
      });
      if (from < 0) return;
      var target = moveBtn.getAttribute("data-rank-move") === "up" ? from - 1 : from + 1;
      if (target < 0 || target >= ordered.length) return;
      var reordered = ordered.slice();
      var moved = reordered.splice(from, 1)[0];
      reordered.splice(target, 0, moved);
      reordered.forEach(function (advisor, index) {
        advisor.rank = index + 1;
      });
      state.advisors = reordered;
      state.rankSaving = String(moveId);
      render();
      try {
        if (!window.MyTalksDB || !window.MyTalksDB.setAdvisorRank) {
          throw new Error("Could not save the new order.");
        }
        await window.MyTalksDB.setAdvisorRank(moveId, target + 1);
        toast("Display order updated.");
      } catch (err) {
        toast((err && err.message) || "Could not change rank.", "error");
      }
      try {
        await loadAll();
      } catch (loadErr) {
        console.warn(loadErr);
      }
      state.rankSaving = "";
      render();
      return;
    }
    var deleteBtn = e.target.closest("[data-delete-advisor]");
    if (deleteBtn) {
      if (!window.confirm("Delete this advisor?")) return;
      try {
        await window.MyTalksDB.deleteAdvisor(deleteBtn.getAttribute("data-delete-advisor"));
        state.editing = null;
        await loadAll();
        render();
        toast("Advisor deleted.");
      } catch (err) {
        toast((err && err.message) || "Could not delete advisor.", "error");
      }
    }
  });

  root.addEventListener("change", async function (e) {
    var ticket = e.target.closest("[data-ticket-status]");
    if (ticket) {
      try {
        await window.MyTalksDB.updateTicket(ticket.getAttribute("data-ticket-status"), {
          status: ticket.value,
        });
        toast("Ticket updated.");
      } catch (err) {
        toast((err && err.message) || "Could not update ticket.", "error");
      }
      return;
    }
    var rankSelect = e.target.closest("[data-advisor-rank]");
    if (rankSelect) {
      var rankId = rankSelect.getAttribute("data-advisor-rank");
      var nextRank = Number(rankSelect.value);
      rankSelect.disabled = true;
      try {
        await window.MyTalksDB.setAdvisorRank(rankId, nextRank);
        await loadAll();
        render();
        toast("Display order updated.");
      } catch (err) {
        rankSelect.disabled = false;
        toast((err && err.message) || "Could not change rank.", "error");
      }
      return;
    }
    var booking = e.target.closest("[data-booking-advisor]");
    if (booking) {
      var advisor = state.advisors.find(function (a) {
        return String(a.id) === booking.value;
      });
      var advisorBookingId = booking.getAttribute("data-booking-advisor");
      var advisorRow = state.bookings.find(function (item) {
        return String(item.bookingId || item.id) === String(advisorBookingId);
      });
      var previousAdvisor = (advisorRow && advisorRow.advisorName) || "";
      try {
        await window.MyTalksDB.updateBooking(advisorBookingId, {
          advisorId: booking.value,
          advisorName: advisor ? advisor.name : "",
        });
        notifyBookingMail(
          "advisor-changed",
          Object.assign({}, advisorRow || {}, {
            bookingId: advisorBookingId,
            advisorId: booking.value,
            advisorName: advisor ? advisor.name : "",
          }),
          { previousAdvisor: previousAdvisor }
        );
        await loadAll();
        render();
        toast("Advisor changed.");
      } catch (err) {
        toast((err && err.message) || "Could not change advisor.", "error");
      }
    }
  });

  root.addEventListener("input", function (e) {
    if (!e.target || e.target.name !== "price30") return;
    var preview = e.target.closest("form");
    preview = preview && preview.querySelector("[data-rate-preview]");
    if (preview) preview.innerHTML = ratePreviewHtml(e.target.value);
  });

  root.addEventListener("submit", async function (e) {
    var form = e.target.closest("[data-advisor-form]");
    if (!form) return;
    e.preventDefault();
    var data = {};
    new FormData(form).forEach(function (value, key) {
      if (key === "availability") {
        data.availability = data.availability || [];
        data.availability.push(value);
        return;
      }
      data[key] = value;
    });
    data.active = !!form.querySelector("[name=active]").checked;
    data.availability = data.availability || [];
    var open = String(data.hoursStart || "");
    var close = String(data.hoursEnd || "");
    if (!data.price30 || Number(data.price30) <= 0) {
      toast("Enter a 30 minute price.", "error");
      return;
    }
    if (!open || !close || open >= close) {
      toast("Available hours need a start time before the end time.", "error");
      return;
    }
    try {
      await window.MyTalksDB.saveAdvisor(data);
      state.editing = null;
      await loadAll();
      render();
      toast("Advisor saved.");
    } catch (err) {
      toast((err && err.message) || "Could not save advisor.", "error");
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
