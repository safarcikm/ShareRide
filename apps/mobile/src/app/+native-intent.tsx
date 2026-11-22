import { providerReturnPath } from "@shareride/domain";

/**
 * Google's or Apple's browser sheet comes back to `shareride://sign-in/return`
 * with a ticket in the fragment (spec 19, 3.2). The sheet hands the whole
 * address to the screen that opened it; if the phone also opens the address
 * in the app, the router goes to the return screen without the fragment, so
 * the ticket stays out of the app's navigation. Other addresses are as they
 * came.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const [address = ""] = path.split(/[?#]/);
  const returning = address === providerReturnPath || address.endsWith(`/${providerReturnPath}`);
  return returning ? `/${providerReturnPath}` : path;
}
