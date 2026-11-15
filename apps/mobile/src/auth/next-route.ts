import type { Me } from "@shareride/contracts";

/**
 * The next step of signing up (spec 1, 3.2 to 3.5), or null when the
 * account is ready.
 */
export function nextRoute(me: Me): "/onboarding/terms" | "/onboarding/profile" | null {
  if (me.missingSteps.includes("legal")) return "/onboarding/terms";
  if (me.missingSteps.includes("profile")) return "/onboarding/profile";
  return null;
}

/** Where someone goes to sign up before a step that needs an account. */
export function signUpRoute(
  me: Me | null,
): "/sign-in" | "/onboarding/terms" | "/onboarding/profile" | "/" {
  if (me === null) return "/sign-in";
  return nextRoute(me) ?? "/";
}
