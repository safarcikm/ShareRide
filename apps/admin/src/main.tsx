import "virtual:tokens.css";
import "./styles.css";
import { createApiClient } from "@shareride/api-client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConsoleApp } from "./app.tsx";
import { loadFonts } from "./theme/fonts.ts";
import { browserPasskeys } from "./webauthn.ts";

loadFonts();

// The API serves the console on its own origin, so the session cookie
// (Path=/admin/v1) goes with every call.
const client = createApiClient({ baseUrl: window.location.origin, credentials: "same-origin" });

const root = document.getElementById("root");
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <ConsoleApp client={client} passkeys={browserPasskeys} />
    </StrictMode>,
  );
}
