import { readFileSync } from "node:fs";
import type { EmailImage } from "../../platform/email.ts";

// The puffin pin in every email's header (spec 24, 3.1), sent inside the
// email so nothing is loaded when it is opened (R24.2). Exported from the
// app's favicon.svg by apps/mobile/scripts/export-icons.ts.

export const emailLogo: EmailImage = {
  contentId: "puffinride-logo",
  filename: "puffinride.png",
  contentType: "image/png",
  content: readFileSync(new URL("../../../assets/email-logo.png", import.meta.url)),
};
