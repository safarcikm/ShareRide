// Draws sample story pictures (spec 28, 3.5) to look at, as the API draws
// them for a trip's story.png:
//   pnpm --filter @shareride/api story-pictures [folder]
// A short trip in Icelandic, one with long names in English (full, so
// without the "Free seats" tag) and one with many stops in Icelandic. The
// folder is spec 28's pictures folder unless given. Made-up trips only.
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PartState } from "@shareride/domain";
import type { Locale } from "@shareride/i18n";
import { rideOf } from "./modules/search/link-preview.ts";
import { drawStory } from "./modules/search/ride-picture.ts";

const folder = resolve(
  process.argv[2] ??
    fileURLToPath(new URL("../../../docs/specs/images/share-a-ride", import.meta.url)),
);

type Names = Readonly<Record<Locale, string>>;

function same(name: string): Names {
  return { is: name, en: name };
}

/** A made-up trip leaving Friday 27 November 2026 at 09:00 in Iceland. */
function ride(names: readonly Names[], state: PartState = "open") {
  const made = rideOf({
    id: "0190a1d6-0000-7000-8000-0000000000a1",
    stops: names.map((name) => ({
      meetingPoint: { name },
      plannedAt: "2026-11-27T09:00:00.000Z",
    })),
    part: { board: 0, alight: names.length - 1, state },
  });
  if (made === undefined) throw new Error("A sample trip has no story");
  return made;
}

const samples = [
  {
    file: "story-short-is.png",
    locale: "is",
    ride: ride([
      { is: "Mjódd", en: "Mjódd bus terminal" },
      same("Olís Norðlingaholt"),
      { is: "N1 Selfossi", en: "N1 Selfoss" },
    ]),
  },
  {
    file: "story-long-names-en.png",
    locale: "en",
    ride: ride(
      [
        same("Brautarholt á Skeiðum – stoppistöð Strætó"),
        same("Sólheimar í Grímsnesi – Verslunin Vala"),
      ],
      "full",
    ),
  },
  {
    file: "story-many-stops-is.png",
    locale: "is",
    ride: ride(
      [
        "BSÍ",
        "Hveragerði – N1",
        "Selfoss – Olís",
        "Hella – N1",
        "Hvolsvöllur – N1",
        "Skógar – Skógafoss",
        "Vík – N1",
        "Kirkjubæjarklaustur – N1",
        "Höfn – N1",
      ].map(same),
    ),
  },
] as const satisfies readonly { file: string; locale: Locale; ride: unknown }[];

for (const sample of samples) {
  const path = join(folder, sample.file);
  await writeFile(path, await drawStory(sample.ride, sample.locale));
  process.stdout.write(`${path}\n`);
}
