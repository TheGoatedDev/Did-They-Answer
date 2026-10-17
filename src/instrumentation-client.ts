import posthog from "posthog-js";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// Cookieless pageviews only: memory persistence, no autocapture, no session replay.
if (key) {
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    persistence: "memory",
    capture_pageview: "history_change",
    autocapture: false,
    disable_session_recording: true,
  });
}
