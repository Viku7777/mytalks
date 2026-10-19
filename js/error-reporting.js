/**
 * Web error reporting for MyTalks.
 *
 * Firebase Crashlytics is native-first (iOS/Android) and has no production
 * web SDK on the Firebase compat CDN. This module captures global errors and
 * unhandled promise rejections, logs a concise `exception` Analytics event
 * when available, and always mirrors to the console.
 */
(function () {
  var recentlyReported = Object.create(null);
  var DEDUPE_MS = 4000;

  function truncate(str, max) {
    str = String(str || "");
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + "…";
  }

  function shouldReport(key) {
    var now = Date.now();
    if (recentlyReported[key] && now - recentlyReported[key] < DEDUPE_MS) {
      return false;
    }
    recentlyReported[key] = now;
    return true;
  }

  function report(description, options) {
    options = options || {};
    var fatal = !!options.fatal;
    var desc = truncate(description || "unknown_error", 100);
    var key = (fatal ? "f:" : "n:") + desc;

    if (!shouldReport(key)) return;

    if (fatal) {
      console.error("[MyTalksErrors]", desc, options.error || "");
    } else {
      console.warn("[MyTalksErrors]", desc, options.error || "");
    }

    try {
      var FB = window.MyTalksFirebase;
      if (FB && typeof FB.logEvent === "function") {
        FB.logEvent("exception", {
          description: desc,
          fatal: fatal,
        });
      }
    } catch (e) {
      /* never break the page */
    }
  }

  function describeError(err) {
    if (!err) return "unknown_error";
    if (typeof err === "string") return err;
    if (err.message) return err.message;
    try {
      return String(err);
    } catch (e) {
      return "unknown_error";
    }
  }

  window.addEventListener("error", function (event) {
    try {
      var msg = (event && event.message) || "script_error";
      if (event && event.filename) {
        msg +=
          " @" +
          String(event.filename).split("/").pop() +
          ":" +
          (event.lineno || 0);
      }
      report(msg, { fatal: true, error: event && event.error });
    } catch (e) {
      /* ignore */
    }
  });

  window.addEventListener("unhandledrejection", function (event) {
    try {
      var reason = event && event.reason;
      report(describeError(reason), {
        fatal: false,
        error: reason,
      });
    } catch (e) {
      /* ignore */
    }
  });

  window.MyTalksErrors = {
    report: report,
  };
})();
