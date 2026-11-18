import { inviteCodeInputMaxLength } from "@shareride/domain";
import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * An invite link, `/invite/<code>` (spec 12, 3.2): opens signing up with
 * the code filled in. Someone already signed in lands on the menu, as
 * sign-in closes itself.
 */
export default function InviteLink() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const invite = typeof code === "string" ? code.slice(0, inviteCodeInputMaxLength) : "";
  return <Redirect href={{ pathname: "/sign-in", params: { invite } }} />;
}
