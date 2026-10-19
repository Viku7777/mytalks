/**
 * Firestore data layer for tickets, bookings, contacts, advisors, and pricing.
 * Public advisor lists fall back to JSON when Firestore has no advisors yet.
 */
(function () {
  var COL = {
    tickets: "tickets",
    bookings: "bookings",
    contacts: "contacts",
    settings: "settings",
    users: "users",
    bookingVisits: "booking_visits",
    advisors: "advisors",
  };

  function blockedError() {
    var err = new Error(
      "Your account has been blocked. Please contact support."
    );
    err.code = "auth/account-blocked";
    return err;
  }

  var readyResolve;
  var ready = new Promise(function (resolve) {
    readyResolve = resolve;
  });

  function db() {
    return window.MyTalksFirebase && window.MyTalksFirebase.db
      ? window.MyTalksFirebase.db
      : null;
  }

  function waitForDb(timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    if (db()) return Promise.resolve(db());
    return new Promise(function (resolve) {
      var done = false;
      function finish(value) {
        if (done) return;
        done = true;
        resolve(value);
      }
      document.addEventListener(
        "mytalks:firestore-ready",
        function () {
          finish(db());
        },
        { once: true }
      );
      setTimeout(function () {
        finish(db());
      }, timeoutMs);
    });
  }

  function ticketId() {
    var n = Date.now().toString(36).toUpperCase().slice(-5);
    var r = Math.floor(Math.random() * 36)
      .toString(36)
      .toUpperCase();
    return "T-" + n + r;
  }

  function bookingId() {
    return "B-" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1000);
  }

  function toMillis(value) {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    return value;
  }

  function normalizeDoc(id, data) {
    var out = Object.assign({ id: id }, data || {});
    ["createdAt", "updatedAt", "lastLoginAt"].forEach(function (key) {
      if (out[key]) out[key] = toMillis(out[key]);
    });
    return out;
  }

  function providerFromUser(user) {
    if (!user || !user.providerData || !user.providerData.length) return "password";
    return user.providerData[0].providerId || "password";
  }

  async function getUserProfile(uid) {
    var firestore = await waitForDb();
    if (!firestore || !uid) return null;
    var snap = await firestore.collection(COL.users).doc(uid).get();
    if (!snap.exists) return null;
    return normalizeDoc(snap.id, snap.data());
  }

  /**
   * Create or update users/{uid}. New accounts get is_block: false + timestamps.
   * Throws auth/account-blocked when is_block is true.
   */
  async function upsertUserProfile(user, extras, options) {
    extras = extras || {};
    options = options || {};
    var firestore = await waitForDb();
    if (!firestore) throw new Error("Firestore is not available.");
    if (!user || !user.uid) throw new Error("Missing auth user.");

    var ref = firestore.collection(COL.users).doc(user.uid);
    var now = firebase.firestore.FieldValue.serverTimestamp();
    var clientNow = new Date().toISOString();
    var name = String(extras.name != null ? extras.name : user.displayName || "").trim();
    var email = String(extras.email != null ? extras.email : user.email || "")
      .trim()
      .toLowerCase();
    var phone = String(
      extras.phone != null ? extras.phone : user.phoneNumber || ""
    ).trim();

    var result = await firestore.runTransaction(function (tx) {
      return tx.get(ref).then(function (snap) {
        if (!snap.exists) {
          var created = {
            uid: user.uid,
            name: name,
            displayName: name,
            email: email,
            phone: phone,
            photoURL: user.photoURL || "",
            provider: providerFromUser(user),
            emailVerified: !!user.emailVerified,
            is_block: false,
            role: "user",
            createdAt: now,
            updatedAt: now,
            lastLoginAt: now,
            createdAtClient: clientNow,
            lastLoginAtClient: clientNow,
            timezone:
              (Intl.DateTimeFormat &&
                Intl.DateTimeFormat().resolvedOptions().timeZone) ||
              "",
            userAgent: (typeof navigator !== "undefined" && navigator.userAgent) || "",
            platform: (typeof navigator !== "undefined" && navigator.platform) || "",
            locale: (typeof navigator !== "undefined" && navigator.language) || "",
          };
          tx.set(ref, created);
          return created;
        }

        var existing = snap.data() || {};
        if (existing.is_block === true) {
          throw blockedError();
        }

        var patch = {
          name: name || existing.name || "",
          displayName: name || existing.displayName || existing.name || "",
          email: email || existing.email || "",
          photoURL: user.photoURL || existing.photoURL || "",
          provider: providerFromUser(user) || existing.provider || "password",
          emailVerified: !!user.emailVerified,
          updatedAt: now,
          lastLoginAt: now,
          lastLoginAtClient: clientNow,
          timezone:
            (Intl.DateTimeFormat &&
              Intl.DateTimeFormat().resolvedOptions().timeZone) ||
            existing.timezone ||
            "",
          userAgent: (typeof navigator !== "undefined" && navigator.userAgent) || "",
        };

        if (phone) patch.phone = phone;
        if (options.touchOnly) {
          patch = {
            lastLoginAt: now,
            lastLoginAtClient: clientNow,
            updatedAt: now,
            emailVerified: !!user.emailVerified,
          };
        }

        // Leave role, is_block, uid, and createdAt untouched. Rules reject changes to those.
        tx.set(ref, patch, { merge: true });
        return Object.assign({}, existing, patch, { is_block: existing.is_block === true });
      });
    });

    return normalizeDoc(user.uid, result);
  }

  async function assertUserNotBlocked(uid) {
    var profile = await getUserProfile(uid);
    if (profile && profile.is_block === true) {
      throw blockedError();
    }
    return profile;
  }

  async function updateUserProfile(uid, fields) {
    var firestore = await waitForDb();
    if (!firestore || !uid) throw new Error("Firestore is not available.");
    var safe = Object.assign({}, fields || {});
    delete safe.is_block;
    delete safe.uid;
    delete safe.createdAt;
    safe.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    await firestore.collection(COL.users).doc(uid).set(safe, { merge: true });
    return getUserProfile(uid);
  }

  /**
   * Track every open of the book-session page for funnel / admin analytics.
   */
  async function trackBookingPageVisit(user, extras) {
    extras = extras || {};
    var firestore = await waitForDb();
    if (!firestore) throw new Error("Firestore is not available.");

    var now = firebase.firestore.FieldValue.serverTimestamp();
    var clientNow = new Date().toISOString();
    var params = new URLSearchParams(window.location.search || "");
    var local =
      (user &&
        window.MyTalksAuth &&
        window.MyTalksAuth.getLocalProfile &&
        window.MyTalksAuth.getLocalProfile(user.uid)) ||
      {};

    var visit = {
      page: "book-session",
      path: window.location.pathname || "/pages/book-session",
      url: window.location.href || "",
      referrer: document.referrer || "",
      advisorId: extras.advisorId || params.get("advisor") || "",
      userId: (user && user.uid) || null,
      email: String(
        (user && user.email) || local.email || extras.email || ""
      )
        .trim()
        .toLowerCase(),
      name: String(
        (user && user.displayName) || local.name || extras.name || ""
      ).trim(),
      phone: String(local.phone || extras.phone || "").trim(),
      isGuest: !user,
      visitedAt: now,
      visitedAtClient: clientNow,
      timezone:
        (Intl.DateTimeFormat &&
          Intl.DateTimeFormat().resolvedOptions().timeZone) ||
        "",
      userAgent: (typeof navigator !== "undefined" && navigator.userAgent) || "",
      platform: (typeof navigator !== "undefined" && navigator.platform) || "",
      locale: (typeof navigator !== "undefined" && navigator.language) || "",
      screen:
        typeof screen !== "undefined"
          ? screen.width + "x" + screen.height
          : "",
    };

    var ref = await firestore.collection(COL.bookingVisits).add(visit);

    if (user && user.uid) {
      try {
        await firestore
          .collection(COL.users)
          .doc(user.uid)
          .set(
            {
              lastBookingPageVisitAt: now,
              lastBookingPageVisitAtClient: clientNow,
              bookingPageVisitCount: firebase.firestore.FieldValue.increment(1),
              updatedAt: now,
            },
            { merge: true }
          );
      } catch (err) {
        console.warn("Could not update user booking visit counters:", err);
      }
    }

    return { id: ref.id };
  }

  async function createTicket(payload) {
    var firestore = await waitForDb();
    if (!firestore) throw new Error("Firestore is not available.");

    var id = ticketId();
    var now = firebase.firestore.FieldValue.serverTimestamp();
    var doc = {
      ticketId: id,
      email: String(payload.email || "").trim().toLowerCase(),
      category: payload.category || "Other",
      subject: String(payload.subject || "").trim(),
      description: String(payload.description || "").trim(),
      status: "Open",
      userId: payload.userId || null,
      createdAt: now,
      updatedAt: now,
    };

    await firestore.collection(COL.tickets).doc(id).set(doc);
    return { id: id, ticketId: id, status: "Open" };
  }

  async function getTicket(ticketIdValue) {
    var firestore = await waitForDb();
    if (!firestore) throw new Error("Firestore is not available.");

    var id = String(ticketIdValue || "")
      .trim()
      .toUpperCase();
    if (!id) return null;
    var snap = await firestore.collection(COL.tickets).doc(id).get();
    if (!snap.exists) return null;
    return normalizeDoc(snap.id, snap.data());
  }

  async function getTicketsForUser(userId, email) {
    var firestore = await waitForDb();
    if (!firestore || (!userId && !email)) return [];

    var results = [];
    try {
      if (userId) {
        var byUser = await firestore
          .collection(COL.tickets)
          .where("userId", "==", userId)
          .limit(50)
          .get();
        byUser.forEach(function (doc) {
          results.push(normalizeDoc(doc.id, doc.data()));
        });
      }
    } catch (err) {
      console.warn("Ticket query by userId failed:", err);
    }

    try {
      if (email && results.length === 0) {
        var byEmail = await firestore
          .collection(COL.tickets)
          .where("email", "==", String(email).toLowerCase())
          .limit(50)
          .get();
        byEmail.forEach(function (doc) {
          results.push(normalizeDoc(doc.id, doc.data()));
        });
      }
    } catch (err) {
      console.warn("Ticket query by email failed:", err);
    }

    results.sort(function (a, b) {
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });
    return results;
  }

  async function createBooking(payload) {
    var firestore = await waitForDb();
    if (!firestore) throw new Error("Firestore is not available.");

    var id = bookingId();
    var now = firebase.firestore.FieldValue.serverTimestamp();
    var doc = {
      bookingId: id,
      advisorId: payload.advisorId || "",
      advisorName: payload.advisorName || "",
      date: payload.date || "",
      time: payload.time || "",
      mode: payload.mode || "chat",
      coupon: payload.coupon || "",
      email: String(payload.email || "").trim().toLowerCase(),
      phone: String(payload.phone || "").trim(),
      userId: payload.userId || null,
      total: Number(payload.total) || 0,
      status: "Confirmed",
      createdAt: now,
      updatedAt: now,
    };

    await firestore.collection(COL.bookings).doc(id).set(doc);
    return { id: id, bookingId: id, status: "Confirmed" };
  }

  async function getBookingsForUser(userId, email) {
    var firestore = await waitForDb();
    if (!firestore || (!userId && !email)) return [];

    var results = [];
    try {
      if (userId) {
        var byUser = await firestore
          .collection(COL.bookings)
          .where("userId", "==", userId)
          .limit(50)
          .get();
        byUser.forEach(function (doc) {
          results.push(normalizeDoc(doc.id, doc.data()));
        });
      }
    } catch (err) {
      console.warn("Booking query by userId failed:", err);
    }

    try {
      if (email && results.length === 0) {
        var byEmail = await firestore
          .collection(COL.bookings)
          .where("email", "==", String(email).toLowerCase())
          .limit(50)
          .get();
        byEmail.forEach(function (doc) {
          results.push(normalizeDoc(doc.id, doc.data()));
        });
      }
    } catch (err) {
      console.warn("Booking query by email failed:", err);
    }

    results.sort(function (a, b) {
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
    return results;
  }

  async function createContact(payload) {
    var firestore = await waitForDb();
    if (!firestore) throw new Error("Firestore is not available.");

    var now = firebase.firestore.FieldValue.serverTimestamp();
    var ref = firestore.collection(COL.contacts).doc();
    await ref.set({
      name: String(payload.name || "").trim(),
      email: String(payload.email || "").trim().toLowerCase(),
      phone: String(payload.phone || "").trim(),
      message: String(payload.message || payload.subject || "").trim(),
      source: payload.source || "contact",
      userId: payload.userId || null,
      createdAt: now,
    });
    return { id: ref.id };
  }

  async function getPricingFromFirestore() {
    var firestore = await waitForDb();
    if (!firestore) return null;
    var snap = await firestore.collection(COL.settings).doc("pricing").get();
    if (!snap.exists) return null;
    var data = snap.data() || {};
    if (!data.plans || !data.plans.length) return null;
    return {
      plans: data.plans,
      discounts: data.discounts || [],
      paymentMethods: data.paymentMethods || [],
      coupons: data.coupons || {},
      updatedAt: toMillis(data.updatedAt),
      source: "firestore",
    };
  }

  async function seedPricing(pricing) {
    var firestore = await waitForDb();
    if (!firestore || !pricing) return false;
    var existing = await firestore.collection(COL.settings).doc("pricing").get();
    if (existing.exists) return false;
    await firestore
      .collection(COL.settings)
      .doc("pricing")
      .set({
        plans: pricing.plans || [],
        discounts: pricing.discounts || [],
        paymentMethods: pricing.paymentMethods || [],
        coupons: pricing.coupons || { SAFE10: 10 },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    return true;
  }

  async function getPricing() {
    try {
      var remote = await getPricingFromFirestore();
      if (remote) return remote;
    } catch (err) {
      console.warn("Firestore pricing read failed:", err);
    }
    return null;
  }

  function splitList(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) {
        return String(item || "").trim();
      }).filter(Boolean);
    }
    return String(value || "")
      .split(",")
      .map(function (item) {
        return item.trim();
      })
      .filter(Boolean);
  }

  function advisorPayload(input, id) {
    input = input || {};
    var chat = Number(input.chatPrice != null ? input.chatPrice : (input.sessionPrices && input.sessionPrices.chat)) || 0;
    var voice = Number(input.voicePrice != null ? input.voicePrice : (input.sessionPrices && input.sessionPrices.voice)) || 0;
    var video = Number(input.videoPrice != null ? input.videoPrice : (input.sessionPrices && input.sessionPrices.video)) || 0;
    var price = Number(input.price) || voice || chat || video || 0;
    return {
      id: String(id || input.id || ""),
      name: String(input.name || "").trim(),
      photo: String(input.photo || "").trim(),
      gender: String(input.gender || "").trim(),
      languages: splitList(input.languages),
      experience: Number(input.experience) || 0,
      specialties: splitList(input.specialties),
      rating: Number(input.rating) || 0,
      reviewsCount: Number(input.reviewsCount) || 0,
      price: price,
      currency: "INR",
      bio: String(input.bio || "").trim(),
      education: String(input.education || "").trim(),
      skills: splitList(input.skills),
      availability: splitList(input.availability),
      sessionPrices: { chat: chat, voice: voice, video: video },
      active: input.active !== false && input.active !== "false",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
  }

  async function listAdvisors(options) {
    options = options || {};
    var firestore = await waitForDb();
    if (!firestore) return [];
    var snap = await firestore.collection(COL.advisors).get();
    var list = [];
    snap.forEach(function (doc) {
      var data = normalizeDoc(doc.id, doc.data());
      data.id = data.id || doc.id;
      if (!options.includeInactive && data.active === false) return;
      list.push(data);
    });
    list.sort(function (a, b) {
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    return list;
  }

  async function saveAdvisor(input) {
    var firestore = await waitForDb();
    if (!firestore) throw new Error("Firestore is not available.");
    var id = String((input && input.id) || "").trim();
    if (!id) {
      id = firestore.collection(COL.advisors).doc().id;
    }
    var payload = advisorPayload(input, id);
    if (!payload.name) throw new Error("Advisor name is required.");
    await firestore.collection(COL.advisors).doc(id).set(payload, { merge: true });
    return payload;
  }

  async function deleteAdvisor(id) {
    var firestore = await waitForDb();
    if (!firestore || !id) throw new Error("Missing advisor.");
    await firestore.collection(COL.advisors).doc(String(id)).delete();
  }

  async function seedAdvisors(list) {
    var existing = await listAdvisors({ includeInactive: true });
    if (existing.length) return existing;
    var saved = [];
    for (var i = 0; i < (list || []).length; i++) {
      saved.push(await saveAdvisor(list[i]));
    }
    return saved;
  }

  async function listCollection(name, limitCount) {
    var firestore = await waitForDb();
    if (!firestore) return [];
    var snap = await firestore.collection(name).limit(limitCount || 200).get();
    var rows = [];
    snap.forEach(function (doc) {
      rows.push(normalizeDoc(doc.id, doc.data()));
    });
    return rows;
  }

  async function listUsers() {
    var rows = await listCollection(COL.users, 300);
    rows.sort(function (a, b) {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
    return rows;
  }

  async function listTickets() {
    var rows = await listCollection(COL.tickets, 300);
    rows.sort(function (a, b) {
      return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
    });
    return rows;
  }

  async function listBookings() {
    var rows = await listCollection(COL.bookings, 400);
    rows.sort(function (a, b) {
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
    return rows;
  }

  async function updateTicket(id, fields) {
    var firestore = await waitForDb();
    if (!firestore || !id) throw new Error("Missing ticket.");
    var patch = {
      status: String((fields && fields.status) || "Open"),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (fields && fields.adminNote != null) {
      patch.adminNote = String(fields.adminNote);
    }
    await firestore.collection(COL.tickets).doc(String(id)).set(patch, { merge: true });
  }

  async function updateBooking(id, fields) {
    var firestore = await waitForDb();
    if (!firestore || !id) throw new Error("Missing booking.");
    var patch = Object.assign({}, fields || {}, {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    delete patch.bookingId;
    delete patch.createdAt;
    await firestore.collection(COL.bookings).doc(String(id)).set(patch, { merge: true });
  }

  async function setUserAccess(uid, fields) {
    var firestore = await waitForDb();
    if (!firestore || !uid) throw new Error("Missing user.");
    var patch = {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (fields && typeof fields.is_block === "boolean") patch.is_block = fields.is_block;
    if (fields && fields.role) patch.role = fields.role === "admin" ? "admin" : "user";
    await firestore.collection(COL.users).doc(String(uid)).set(patch, { merge: true });
  }

  function boot() {
    if (!db()) {
      readyResolve(false);
      return;
    }
    readyResolve(true);
    document.dispatchEvent(new CustomEvent("mytalks:firestore-ready"));
  }

  if (db()) {
    boot();
  } else {
    document.addEventListener("mytalks:firebase-ready", boot, { once: true });
    setTimeout(boot, 5000);
  }

  window.MyTalksDB = {
    ready: ready,
    collections: COL,
    waitForDb: waitForDb,
    createTicket: createTicket,
    getTicket: getTicket,
    getTicketsForUser: getTicketsForUser,
    createBooking: createBooking,
    getBookingsForUser: getBookingsForUser,
    createContact: createContact,
    getPricing: getPricing,
    seedPricing: seedPricing,
    getUserProfile: getUserProfile,
    upsertUserProfile: upsertUserProfile,
    assertUserNotBlocked: assertUserNotBlocked,
    updateUserProfile: updateUserProfile,
    trackBookingPageVisit: trackBookingPageVisit,
    listAdvisors: listAdvisors,
    saveAdvisor: saveAdvisor,
    deleteAdvisor: deleteAdvisor,
    seedAdvisors: seedAdvisors,
    listUsers: listUsers,
    listTickets: listTickets,
    listBookings: listBookings,
    updateTicket: updateTicket,
    updateBooking: updateBooking,
    setUserAccess: setUserAccess,
  };
})();
