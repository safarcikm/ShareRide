import type { Me } from "@shareride/contracts";

/** Where to go after signing in, or after finishing a step (spec 1, 3.2 to 3.5). */
export function nextRoute(me: Me): "/onboarding/terms" | "/onboarding/profile" | "/profile" {
  if (me.missingSteps.includes("legal")) return "/onboarding/terms";
  if (me.missingSteps.includes("profile")) return "/onboarding/profile";
  return "/profile";
}
