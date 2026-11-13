// Used by the catalog test only; it needs the ICU parser, a dev dependency.
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";

type Catalog = Readonly<Record<string, string>>;

function argumentNames(elements: readonly MessageFormatElement[], names = new Set<string>()) {
  for (const element of elements) {
    if ("value" in element && typeof element.value === "string" && element.type !== TYPE.literal) {
      names.add(element.value);
    }
    if ("options" in element) {
      for (const option of Object.values(element.options)) argumentNames(option.value, names);
    }
    if ("children" in element) argumentNames(element.children, names);
  }
  return names;
}

function parseArguments(message: string): Set<string> | Error {
  try {
    return argumentNames(parse(message));
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

const sorted = (names: Set<string>) => [...names].sort().join(", ");

/**
 * Compares every catalog with the English one: same keys, valid ICU syntax
 * and the same arguments. Returns one line per problem; empty means fine.
 */
export function findMessageProblems(catalogs: Readonly<Record<string, Catalog>> & { en: Catalog }) {
  const problems: string[] = [];
  const reference = catalogs.en;
  const referenceKeys = Object.keys(reference);

  for (const [locale, catalog] of Object.entries(catalogs)) {
    for (const key of referenceKeys) {
      if (!(key in catalog)) problems.push(`${locale}: missing key ${key}`);
    }
    for (const key of Object.keys(catalog)) {
      if (!(key in reference)) problems.push(`${locale}: unknown key ${key}`);
    }
    for (const [key, message] of Object.entries(catalog)) {
      const parsed = parseArguments(message);
      if (parsed instanceof Error) {
        problems.push(`${locale}: ${key}: invalid ICU message (${parsed.message})`);
        continue;
      }
      const referenceMessage = reference[key];
      if (locale === "en" || referenceMessage === undefined) continue;
      const expected = parseArguments(referenceMessage);
      if (!(expected instanceof Error) && sorted(expected) !== sorted(parsed)) {
        problems.push(
          `${locale}: ${key}: arguments (${sorted(parsed)}) differ from en (${sorted(expected)})`,
        );
      }
    }
  }
  return problems;
}
