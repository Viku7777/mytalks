/**
 * Web crash reporting for MyTalk.
 *
 * Firebase Crashlytics is not available for websites: firebase@13 has no
 * crashlytics export, and the CDN script does not exist. This module captures
 * global errors and unhandled rejections, then sends them through
 * MyTalksFirebase.recordException (Analytics `exception` events plus the
 * Firestore `crashes` collection).
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

  function isNoise(msg) {
    msg = String(msg || "");
    if (!msg || msg === "Script error." || msg === "Script error") return true;
    if (msg.indexOf("ResizeObserver loop") === 0) return true;
    return false;
  }

  function report(description, options) {
    options = options || {};
    if (isNoise(description)) return;
    var fatal = !!options.fatal;
    var desc = truncate(description || "unknown_error", 500);
    var key = (fatal ? "f:" : "n:") + desc;

    if (!shouldReport(key)) return;

    if (fatal) {
      console.error("[MyTalksErrors]", desc, options.error || "");
    } else {
      console.warn("[MyTalksErrors]", desc, options.error || "");
    }

    try {
      var FB = window.MyTalksFirebase;
      var stack = "";
      if (options.error && options.error.stack) stack = String(options.error.stack);
      if (FB && typeof FB.recordException === "function") {
        FB.recordException({
          description: desc,
          fatal: fatal,
          stack: stack,
        });
      } else if (FB && typeof FB.logEvent === "function") {
        FB.logEvent("exception", {
          description: desc,
          fatal: fatal ? 1 : 0,
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
