import type { Me } from "@shareride/contracts";
import { peopleColourOf } from "@shareride/domain";
import type { Locale, Translate } from "@shareride/i18n";
import { dayOf } from "@/lib/days";
import { languagesText } from "@/people/languages";
import { memberSinceText } from "@/people/texts";

/**
 * Who I am, for the person's card on Profile and on Edit profile (spec 31,
 * 3.14 and 3.19): my picture and name, what I speak when I have said, and
 * since when I am a member.
 */
export function myCardOf(me: Me, t: Translate, locale: Locale) {
  const languages = languagesText(me, locale);
  return {
    firstName: me.firstName ?? "",
    colour: peopleColourOf(me.id),
    photo: me.photo?.url ?? null,
    lines: [
      ...(languages === "" ? [] : [t("profile.speaks", { languages })]),
      memberSinceText(t, locale, dayOf(new Date(me.memberSince))),
    ],
  };
}
