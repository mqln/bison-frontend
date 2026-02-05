import React from "react";
import ReactDOM from "react-dom/client";
import posthog from "posthog-js";
import { App } from "./web/App";
import "./index.css";

// Initialize PostHog
if (import.meta.env.VITE_PUBLIC_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    ui_host: "https://us.posthog.com",
    person_profiles: "always",
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
