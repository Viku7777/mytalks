/**
 * Firebase web config (safe to ship in client apps).
 * Restrict use via Firebase Console → Authentication → Settings → Authorized domains.
 */
(function () {
  var firebaseConfig = {
    apiKey: "AIzaSyBj8PA7Eq04bV3TTL2bC4XmX4a6Ob6F8YQ",
    // Must match Google OAuth "Authorized redirect URIs"
    // (https://location-461df.firebaseapp.com/__/auth/handler).
    authDomain: "location-461df.firebaseapp.com",
    databaseURL: "https://location-461df-default-rtdb.firebaseio.com",
    projectId: "location-461df",
    storageBucket: "location-461df.appspot.com",
    messagingSenderId: "376660863165",
    appId: "1:376660863165:web:1e213c38b69fa54b086fd4",
    measurementId: "G-25YPR9FS0R",
  };

  if (typeof firebase === "undefined") {
    console.error("Firebase SDK not loaded before firebase-config.js");
    return;
  }

  var app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
  var auth = firebase.auth();

  var db = null;
  try {
    if (typeof firebase.firestore === "function") {
      db = firebase.firestore();
    }
  } catch (err) {
    console.warn("Firestore init failed:", err);
    db = null;
  }

  var analytics = null;
  var analyticsReady = false;
  var analyticsFailed = false;
  var analyticsStarting = false;
  var pendingEvents = [];
  var pendingUserId = undefined;
  var MAX_PENDING = 20;

  function cookieChoice() {
    try {
      return localStorage.getItem("mytalks-cookies");
    } catch (e) {
      return null;
    }
  }

  function analyticsAllowed() {
    return cookieChoice() === "accepted";
  }

  function canUseAnalyticsEnv() {
    try {
      if (typeof window === "undefined" || typeof document === "undefined") {
        return false;
      }
      if (!location || !location.protocol) return false;
      // Skip file://, about:, etc. — Analytics needs a normal http(s) origin.
      if (location.protocol.indexOf("http") !== 0) return false;
      if (!firebaseConfig.measurementId) return false;
      if (typeof firebase.analytics !== "function") return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  function sanitizeParams(params) {
    var clean = {};
    if (!params) return clean;
    Object.keys(params).forEach(function (key) {
      var value = params[key];
      if (value == null) return;
      if (typeof value === "boolean") value = value ? 1 : 0;
      if (typeof value === "number" && isFinite(value)) {
        clean[key] = value;
        return;
      }
      if (typeof value === "string") {
        clean[key] = value.length > 100 ? value.slice(0, 99) + "…" : value;
      }
    });
    return clean;
  }

  function flushPending() {
    if (!analytics || typeof analytics.logEvent !== "function") {
      pendingEvents = [];
      return;
    }
    var queue = pendingEvents.slice();
    pendingEvents = [];
    queue.forEach(function (item) {
      try {
        analytics.logEvent(item.name, sanitizeParams(item.params));
      } catch (e) {
        /* ignore */
      }
    });
  }

  function applyUserId() {
    if (!analytics || typeof analytics.setUserId !== "function") return;
    if (pendingUserId === undefined) return;
    try {
      analytics.setUserId(pendingUserId);
    } catch (e) {
      /* ignore */
    }
  }

  function attachAnalytics(instance) {
    analytics = instance || null;
    analyticsReady = true;
    analyticsStarting = false;
    analyticsFailed = !analytics;
    if (window.MyTalksFirebase) {
      window.MyTalksFirebase.analytics = analytics;
    }
    if (analytics) {
      try {
        if (typeof analytics.setAnalyticsCollectionEnabled === "function") {
          analytics.setAnalyticsCollectionEnabled(true);
        }
      } catch (e) {
        /* ignore */
      }
      applyUserId();
      flushPending();
      document.dispatchEvent(new CustomEvent("mytalks:analytics-ready"));
    } else {
      pendingEvents = [];
    }
  }

  function initAnalytics() {
    if (analytics || analyticsStarting || analyticsFailed) return;
    if (!analyticsAllowed()) return;
    if (!canUseAnalyticsEnv()) {
      attachAnalytics(null);
      return;
    }

    analyticsStarting = true;
    var supportedPromise =
      typeof firebase.analytics.isSupported === "function"
        ? firebase.analytics.isSupported()
        : Promise.resolve(true);

    supportedPromise
      .then(function (supported) {
        if (!supported || !analyticsAllowed()) {
          attachAnalytics(null);
          return;
        }
        try {
          attachAnalytics(firebase.analytics());
        } catch (err) {
          console.warn("Firebase Analytics init failed:", err);
          attachAnalytics(null);
        }
      })
      .catch(function (err) {
        console.warn("Firebase Analytics not supported:", err);
        attachAnalytics(null);
      });
  }

  /**
   * Safe Analytics logEvent — never throws; no-op when Analytics is unavailable.
   * Queues briefly while isSupported() resolves so early events are not lost.
   */
  function logEvent(name, params) {
    if (!name || !analyticsAllowed()) return false;
    params = sanitizeParams(params);
    try {
      if (analytics && typeof analytics.logEvent === "function") {
        analytics.logEvent(name, params);
        return true;
      }
      if (!analyticsReady && !analyticsFailed && canUseAnalyticsEnv()) {
        if (pendingEvents.length < MAX_PENDING) {
          pendingEvents.push({ name: name, params: params });
        }
        return false;
      }
      return false;
    } catch (err) {
      return false;
    }
  }

  function setUserId(uid) {
    pendingUserId = uid ? String(uid) : null;
    applyUserId();
  }

  /**
   * Web crash record. Crashlytics has no published JavaScript SDK (nothing
   * under firebase/crashlytics in firebase@13, and the CDN script 404s).
   * Fatal and non-fatal errors are counted as Analytics `exception` events
   * and stored in the Firestore `crashes` collection.
   */
  function recordException(details) {
    details = details || {};
    var description = String(details.description || "unknown_error");
    var fatal = !!details.fatal;
    logEvent("exception", {
      description: description,
      fatal: fatal ? 1 : 0,
    });

    if (!db) return;
    var userId = pendingUserId || null;
    var payload = {
      message: description.slice(0, 500),
      stack: String(details.stack || "").slice(0, 4000),
      fatal: fatal,
      url: String(location.href || "").slice(0, 500),
      path: String(location.pathname || "").slice(0, 300),
      userAgent: String(navigator.userAgent || "").slice(0, 300),
      userId: userId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    db.collection("crashes")
      .add(payload)
      .catch(function () {
        /* rules or network — never break the page */
      });
  }

  window.MyTalksFirebase = {
    app: app,
    auth: auth,
    db: db,
    analytics: analytics,
    analyticsReady: function () {
      return analyticsReady && !!analytics;
    },
    config: firebaseConfig,
    logEvent: logEvent,
    setUserId: setUserId,
    recordException: recordException,
  };

  document.addEventListener("mytalks:cookies-accepted", initAnalytics);
  if (cookieChoice() === "declined") {
    analyticsFailed = true;
  } else {
    initAnalytics();
  }

  document.dispatchEvent(new CustomEvent("mytalks:firebase-ready"));
})();
