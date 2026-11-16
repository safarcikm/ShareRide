import type { Me } from "@shareride/contracts";

type Step = "/onboarding/about-you" | "/onboarding/terms";

/**
 * The next step of signing up, or null when the account is ready: step 3,
 * about you, while the profile is missing, which takes the terms too when
 * they are missing (spec 16, 3.5 item 4); only the terms when they changed
 * later (item 5; spec 1, 3.4).
 */
export function nextRoute(me: Me): Step | null {
  if (me.missingSteps.includes("profile")) return "/onboarding/about-you";
  if (me.missingSteps.includes("legal")) return "/onboarding/terms";
  return null;
}

/** Where someone goes to sign up before a step that needs an account. */
export function signUpRoute(me: Me | null): "/sign-in" | Step | "/" {
  if (me === null) return "/sign-in";
  return nextRoute(me) ?? "/";
}
