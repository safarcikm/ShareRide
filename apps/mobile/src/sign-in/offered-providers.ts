import { providersOffered, type SignInProvider } from "@shareride/domain";
import { useConfig } from "@/beta/config";
import { signInPlatform } from "./platform";

/**
 * Google and Apple as this app offers them (spec 32, 3.3; R32.5): the
 * API's, less Google on the iPhone until Sign in with Apple comes.
 * `googleLeftOut` is true when the API has Google set up but this app
 * leaves it out, so step 1 says how members who joined with it sign in.
 */
export function useOfferedProviders(): {
  readonly offered: readonly SignInProvider[];
  readonly googleLeftOut: boolean;
} {
  const { signInProviders } = useConfig();
  const offered = providersOffered(signInProviders, signInPlatform());
  return {
    offered,
    googleLeftOut: signInProviders.includes("google") && !offered.includes("google"),
  };
}
