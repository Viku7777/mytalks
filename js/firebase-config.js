/**
 * Firebase web config (safe to ship in client apps).
 * Restrict use via Firebase Console → Authentication → Settings → Authorized domains.
 */
(function () {
  var firebaseConfig = {
    apiKey: "AIzaSyBj8PA7Eq04bV3TTL2bC4XmX4a6Ob6F8YQ",
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
  var pendingEvents = [];
  var MAX_PENDING = 20;

  function canUseAnalyticsEnv() {
    try {
      if (typeof window === "undefined" || typeof document === "undefined") {
        return false;
      }
      if (!location || !location.protocol) return false;
      // Skip file://, about:, etc. — Analytics needs a normal http(s) origin.
      if (location.protocol.indexOf("http") !== 0) return false;
      if (typeof firebase.analytics !== "function") return false;
      return true;
    } catch (e) {
      return false;
    }
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
        analytics.logEvent(item.name, item.params || {});
      } catch (e) {
        /* ignore */
      }
    });
  }

  function attachAnalytics(instance) {
    analytics = instance || null;
    analyticsReady = true;
    analyticsFailed = !analytics;
    if (window.MyTalksFirebase) {
      window.MyTalksFirebase.analytics = analytics;
    }
    if (analytics) {
      flushPending();
      document.dispatchEvent(new CustomEvent("mytalks:analytics-ready"));
    } else {
      pendingEvents = [];
    }
  }

  function initAnalytics() {
    if (!canUseAnalyticsEnv()) {
      attachAnalytics(null);
      return;
    }

    var supportedPromise =
      typeof firebase.analytics.isSupported === "function"
        ? firebase.analytics.isSupported()
        : Promise.resolve(true);

    supportedPromise
      .then(function (supported) {
        if (!supported) {
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
   * Queues briefly while isSupported() resolves so early auth events are not lost.
   */
  function logEvent(name, params) {
    if (!name) return false;
    params = params || {};
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
  };

  initAnalytics();

  document.dispatchEvent(new CustomEvent("mytalks:firebase-ready"));
})();
