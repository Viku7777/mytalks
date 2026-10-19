(function () {
  var root = document.querySelector("[data-admin-root]");
  if (!root) return;

  var state = {
    users: [],
    tickets: [],
    bookings: [],
    advisors: [],
    tab: "users",
    editing: null,
    selectedUserId: null,
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
    ]);
    state.users = results[0];
    state.tickets = results[1];
    state.bookings = results[2];
    state.advisors = results[3];
    if (!state.advisors.length && window.MyTalksData) {
      var sample = await window.MyTalksData.loadJson("advisors.json");
      state.advisors = await DB.seedAdvisors(sample);
    }
  }

  function advisorOptions(selected) {
    return state.advisors
      .map(function (a) {
        return (
          '<option value="' +
          esc(a.id) +
          '"' +
          (String(selected) === String(a.id) ? " selected" : "") +
          ">" +
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

  function userDetail(user) {
    var id = user.id || user.uid;
    var keys = Object.keys(USER_LABELS).concat(
      Object.keys(user).filter(function (key) {
        return !USER_LABELS[key];
      })
    );
    var fields = keys
      .filter(function (key) {
        return Object.prototype.hasOwnProperty.call(user, key);
      })
      .map(function (key) {
        return (
          "<div><dt>" +
          esc(USER_LABELS[key] || key) +
          "</dt><dd>" +
          formatDetail(key, user[key]) +
          "</dd></div>"
        );
      })
      .join("");
    var email = String(user.email || "").toLowerCase();
    var tickets = state.tickets.filter(function (t) {
      return t.userId === id || String(t.email || "").toLowerCase() === email;
    });
    var bookings = state.bookings.filter(function (b) {
      return b.userId === id || String(b.email || "").toLowerCase() === email;
    });
    var ticketHtml = tickets.length
      ? "<ul>" +
        tickets
          .map(function (t) {
            return (
              "<li><strong>" +
              esc(t.ticketId || t.id) +
              "</strong> · " +
              esc(t.status || "Open") +
              " · " +
              esc(t.subject || "Ticket") +
              "</li>"
            );
          })
          .join("") +
        "</ul>"
      : "<p>No tickets.</p>";
    var bookingHtml = bookings.length
      ? "<ul>" +
        bookings
          .map(function (b) {
            return (
              "<li><strong>" +
              esc(b.bookingId || b.id) +
              "</strong> · " +
              esc(b.date || "—") +
              " " +
              esc(b.time || "") +
              " · " +
              esc(b.advisorName || b.advisorId || "—") +
              " · " +
              money(b.total) +
              "</li>"
            );
          })
          .join("") +
        "</ul>"
      : "<p>No bookings.</p>";
    var photo = user.photoURL
      ? '<img class="admin-user__photo" src="' + esc(user.photoURL) + '" alt="" width="72" height="72" />'
      : "";
    return (
      '<article class="card admin-user">' +
      '<div class="admin-user__head">' +
      photo +
      "<div><h3>" +
      esc(user.name || user.displayName || user.email || "User") +
      "</h3><p>" +
      esc(user.email || id) +
      '</p></div><button type="button" class="btn btn--ghost btn--sm" data-close-user>Close</button></div>' +
      '<dl class="admin-user__grid">' +
      fields +
      "</dl><h4>Tickets</h4>" +
      ticketHtml +
      "<h4>Bookings</h4>" +
      bookingHtml +
      "</article>"
    );
  }

  function renderUsers() {
    if (!state.users.length) return '<p class="empty-state">No users yet.</p>';
    var selected = state.users.find(function (u) {
      return String(u.id || u.uid) === String(state.selectedUserId);
    });
    return (
      (selected ? userDetail(selected) : '<p class="admin-user__hint">Tap a user to see the full account.</p>') +
      '<div class="table-wrap card"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>' +
      state.users
        .map(function (u) {
          var id = u.id || u.uid;
          var blocked = u.is_block === true;
          var open = String(id) === String(state.selectedUserId);
          return (
            '<tr class="admin-user-row' +
            (open ? " is-selected" : "") +
            '" data-open-user="' +
            esc(id) +
            '" tabindex="0"><td>' +
            esc(u.name || u.displayName || "—") +
            "</td><td>" +
            esc(u.email || "—") +
            "</td><td>" +
            esc(u.phone || "—") +
            "</td><td>" +
            esc(u.role || "user") +
            "</td><td>" +
            (blocked ? "Blocked" : "Active") +
            '</td><td><button type="button" class="btn btn--ghost btn--sm" data-block="' +
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
                "<tr><td>" +
                esc(id) +
                "</td><td>" +
                esc(b.email || "—") +
                "</td><td>" +
                esc(b.advisorName || b.advisorId || "—") +
                "</td><td>" +
                esc(b.time || "—") +
                "</td><td>" +
                esc(b.mode || "—") +
                "</td><td>" +
                money(b.total) +
                '</td><td><select class="form-select" data-booking-advisor="' +
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

  function advisorForm(a) {
    a = a || {};
    var prices = a.sessionPrices || {};
    var days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    var selected = a.availability || [];
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
      '" /></div></div><div class="form-row"><div class="form-group"><label>Chat ₹</label><input class="form-control" name="chatPrice" type="number" min="0" value="' +
      esc(prices.chat || a.price || 0) +
      '" /></div><div class="form-group"><label>Voice ₹</label><input class="form-control" name="voicePrice" type="number" min="0" value="' +
      esc(prices.voice || a.price || 0) +
      '" /></div><div class="form-group"><label>Video ₹</label><input class="form-control" name="videoPrice" type="number" min="0" value="' +
      esc(prices.video || a.price || 0) +
      '" /></div><div class="form-group"><label>List price ₹</label><input class="form-control" name="price" type="number" min="0" value="' +
      esc(a.price || 0) +
      '" /></div></div><fieldset class="form-group"><legend>Availability</legend><div class="admin-days">' +
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

  function renderAdvisors() {
    var cards = state.advisors.length
      ? state.advisors
          .map(function (a) {
            return (
              '<article class="card advisor-card"><div class="advisor-card__media"><img class="advisor-card__photo" src="' +
              esc(a.photo || "") +
              '" alt="" width="72" height="72" /><div><h3>' +
              esc(a.name) +
              "</h3><p class=\"advisor-card__meta\">" +
              esc((a.languages || []).join(", ")) +
              " · ₹" +
              esc(a.price || 0) +
              (a.active === false ? " · Hidden" : "") +
              '</p></div></div><div class="btn-group"><button type="button" class="btn btn--ghost btn--sm" data-edit-advisor="' +
              esc(a.id) +
              '">Edit</button><button type="button" class="btn btn--ghost btn--sm" data-delete-advisor="' +
              esc(a.id) +
              '">Delete</button></div></article>'
            );
          })
          .join("")
      : '<p class="empty-state">No advisors in Firestore yet.</p>';
    return (
      '<div class="btn-group mb-6"><button type="button" class="btn btn--primary" data-new-advisor>Add advisor</button></div>' +
      (state.editing !== null ? advisorForm(state.editing) : "") +
      '<div class="grid-3 mt-6">' +
      cards +
      "</div>"
    );
  }

  function render() {
    var panel =
      state.tab === "tickets"
        ? renderTickets()
        : state.tab === "payments"
          ? renderPayments()
          : state.tab === "advisors"
            ? renderAdvisors()
            : renderUsers();
    root.innerHTML =
      '<div class="tabs" role="tablist">' +
      ["users", "tickets", "payments", "advisors"]
        .map(function (tab) {
          var label = tab.charAt(0).toUpperCase() + tab.slice(1);
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
        '<div class="card"><h2>Sign in required</h2><p class="mt-4">Use an admin account to manage MyTalks.</p><a class="btn btn--primary mt-6" href="login?next=' +
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
      render();
    } catch (err) {
      showGate(
        '<div class="card"><h2>Could not load admin data</h2><p class="mt-4">' +
          esc((err && err.message) || "Permission denied") +
          "</p><p class=\"mt-4\">Deploy <code>firestore.rules</code> so admin accounts can read users, tickets, bookings, and advisors.</p></div>"
      );
    }
  }

  root.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var userRow = e.target.closest("[data-open-user]");
    if (!userRow || e.target.closest("[data-block]")) return;
    e.preventDefault();
    userRow.click();
  });

  root.addEventListener("click", async function (e) {
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
    if (userRow) {
      state.selectedUserId = userRow.getAttribute("data-open-user");
      render();
      var detail = root.querySelector(".admin-user");
      if (detail) detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    var booking = e.target.closest("[data-booking-advisor]");
    if (booking) {
      var advisor = state.advisors.find(function (a) {
        return String(a.id) === booking.value;
      });
      try {
        await window.MyTalksDB.updateBooking(booking.getAttribute("data-booking-advisor"), {
          advisorId: booking.value,
          advisorName: advisor ? advisor.name : "",
        });
        toast("Advisor changed.");
      } catch (err) {
        toast((err && err.message) || "Could not change advisor.", "error");
      }
    }
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
