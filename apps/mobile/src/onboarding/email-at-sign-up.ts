/**
 * Whether step 3 of signing up asks for an email (spec 20, 3.3): the phone
 * apps have push, so email stays optional there (spec 1, decision 5). The
 * web's is in email-at-sign-up.web.ts.
 */
export function emailAtSignUp(): boolean {
  return false;
}
