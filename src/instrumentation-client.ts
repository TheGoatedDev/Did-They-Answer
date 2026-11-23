import posthog from "posthog-js";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// Cookieless: memory persistence, so a full page load starts a new session and replay.
if (key) {
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    persistence: "memory",
    capture_pageview: "history_change",
    autocapture: false,
  });
}
