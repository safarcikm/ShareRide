import { schema } from "@shareride/db";
import {
  appealOutcomes,
  bookingModes,
  bookingStatuses,
  cancelReasons,
  carColours,
  channels,
  chatOptions,
  declineReasons,
  deliveryStatuses,
  disputeAnswers,
  disputeKinds,
  disputeOutcomes,
  exportSections,
  legalDocumentTypes,
  luggageOptions,
  moderationActionKinds,
  moderationRules,
  notificationKinds,
  paymentStatuses,
  petOptions,
  reportCategories,
  reportOutcomes,
  reportStatuses,
  reportSubjects,
  privacyRequestKinds,
  smokingOptions,
  spokenLanguages,
  tripChangeKinds,
  tripStatuses,
} from "@shareride/domain";
import { locales } from "@shareride/i18n";
import { describe, expect, it } from "vitest";
import type { ExportData } from "./export-data.ts";
import { codeText, renderExportPage, unlabelledFields } from "./export-page.ts";

const empty = Object.fromEntries(exportSections.map((section) => [section, []]));

function sample(
  overrides: Partial<ExportData["sections"]>,
  locale: "en" | "is" = "en",
): ExportData {
  return {
    format: "shareride-export",
    version: 1,
    createdAt: "2026-11-16T22:05:00.000Z",
    locale,
    sections: { ...empty, ...overrides } as ExportData["sections"],
  };
}

describe("renderExportPage", () => {
  it("writes every section in the person's language, with dates in Iceland", () => {
    const page = renderExportPage(
      sample({ settings: { tripReminders: true, betaNews: false } }, "is"),
    );
    expect(page).toContain('<html lang="is">');
    expect(page).toContain("<h2>Stillingar</h2>");
    expect(page).toContain("<dt>Áminningar um ferðir</dt><dd>Já</dd>");
    expect(page).toContain("<dt>Fréttir af prófunum</dt><dd>Nei</dd>");
    expect(page).toContain("16. nóvember 2026 22:05");
    expect(page.match(/<h2>/g)).toHaveLength(exportSections.length);
    expect(page).toContain("<p>Ekkert hér</p>");
  });

  it("escapes what people wrote and has no scripts or outside links", () => {
    const page = renderExportPage(
      sample({
        account: { firstName: "<script>alert(1)</script>", about: 'Say "hi" & <b>wave</b>' },
      }),
    );
    expect(page).not.toContain("<script>alert");
    expect(page).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(page).toContain("Say &quot;hi&quot; &amp; &lt;b&gt;wave&lt;/b&gt;");
    expect(page).not.toMatch(/<script|<link|https?:\/\//i);
  });

  it("says stored codes in the person's words and hides what messages were made from", () => {
    const page = renderExportPage(
      sample(
        {
          account: { roles: ["driver", "passenger"], languages: ["is", "pl"], status: "active" },
          legal_acceptances: [{ document: "community-rules", locale: "en" }],
          trips_posted: [{ status: "published", cancelReason: "road_closed", pets: "ask" }],
          conversations: [
            {
              with: { firstName: "Gunna" },
              messages: [
                { from: "you", kind: "quick", text: "Ég er á leiðinni", key: "on_my_way" },
                { from: "Gunna", kind: "text", text: "you", key: null, params: { a: 1 } },
              ],
            },
          ],
          notifications: [{ kind: "data_export_ready", channel: "push", status: "sent" }],
        },
        "is",
      ),
    );
    expect(page).toContain("<dt>Hlutverk</dt><dd>Bílstjóri, Farþegi</dd>");
    expect(page).toContain("<dd>Íslenska, Pólska</dd>");
    expect(page).toContain("<dd>Samfélagsreglur</dd>");
    expect(page).toContain("<dd>Birt</dd>");
    expect(page).toContain("<dd>Vegur lokaður</dd>");
    expect(page).toContain("<dd>Þú</dd>");
    expect(page).toContain("<dd>Stutt skilaboð</dd>");
    expect(page).toContain("<dd>Gunna</dd>");
    expect(page).toContain("<dt>Texti</dt><dd>you</dd>");
    expect(page).toContain("<dd>Tilkynning í síma</dd>");
    expect(page).not.toContain("on_my_way");
    expect(page).not.toMatch(/published|road_closed|data_export_ready|community-rules/);
  });

  it("leaves out record IDs, nests lists, and shows stored changes as they are", () => {
    const page = renderExportPage(
      sample({
        trips_posted: [
          {
            id: "a7d1e8a0-0000-4000-8000-000000000000",
            stops: [{ place: "BSÍ", plannedAt: "2026-11-14T09:00:00.000Z", removedAt: null }],
            changes: [{ kind: "departure", before: { departsAt: "08:00" }, after: {} }],
          },
        ],
      }),
    );
    expect(page).not.toContain("a7d1e8a0");
    expect(page).toContain("<dt>Place</dt><dd>BSÍ</dd>");
    expect(page).toContain("<dt>Removed</dt><dd>—</dd>");
    expect(page).toContain("<code>{&quot;departsAt&quot;:&quot;08:00&quot;}</code>");
  });
});

describe("codeText", () => {
  // Every code the export can hold, by the field that holds it.
  const codes: Readonly<Record<string, readonly string[]>> = {
    status: [
      ...tripStatuses,
      ...bookingStatuses,
      ...paymentStatuses,
      ...deliveryStatuses,
      ...reportStatuses,
      "active",
      "suspended",
    ],
    kind: [
      ...notificationKinds,
      ...tripChangeKinds,
      ...schema.messageKinds,
      ...disputeKinds,
      ...moderationActionKinds,
      ...privacyRequestKinds,
    ],
    channel: channels,
    platform: ["ios", "android", "web"],
    endReason: [
      "sign_out",
      "sign_out_all",
      "signed_out_from_other_device",
      "expired",
      "idle",
      "refresh_reused",
      "account_unavailable",
      "account_deleted",
    ],
    roles: ["driver", "passenger"],
    cancelledBy: ["passenger", "driver", "operator"],
    reportedBy: ["passenger", "driver"],
    answer: disputeAnswers,
    decidedBy: ["system", "operator"],
    from: ["you"],
    bookingMode: bookingModes,
    luggage: luggageOptions,
    pets: petOptions,
    smoking: smokingOptions,
    chat: chatOptions,
    colour: carColours,
    declineReason: declineReasons,
    cancelReason: cancelReasons,
    subject: reportSubjects,
    category: reportCategories,
    outcome: [...disputeOutcomes, ...reportOutcomes],
    rule: moderationRules,
    appealOutcome: appealOutcomes,
    document: legalDocumentTypes,
    locale: locales,
    languages: spokenLanguages,
  };

  it.each(locales)("has words for every code the export can hold, in %s", (locale) => {
    const missing = Object.entries(codes).flatMap(([field, values]) =>
      values
        .filter((code) => codeText(field, code, locale) === undefined)
        .map((code) => `${field}.${code}`),
    );
    expect(missing).toEqual([]);
  });

  it("leaves what people wrote, and unknown codes, as they are", () => {
    expect(codeText("from", "Gunna", "is")).toBeUndefined();
    expect(codeText("about", "published", "is")).toBeUndefined();
    expect(codeText("status", "something_new", "en")).toBeUndefined();
  });
});

describe("unlabelledFields", () => {
  it("names fields that have no label, but not IDs or what changes hold", () => {
    expect(
      unlabelledFields(
        sample({
          account: { firstName: "Gunna", shoeSize: 38, id: "x" },
          trips_posted: [{ changes: [{ before: { anything: 1 } }] }],
        }),
      ),
    ).toEqual(["shoeSize"]);
  });
});
