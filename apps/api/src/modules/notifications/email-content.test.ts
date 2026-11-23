import { colors } from "@shareride/ui";
import { describe, expect, it } from "vitest";
import { emailContent } from "./email-content.ts";
import { emailLogo } from "./email-logo.ts";

const confirmed = {
  title: "Booking confirmed",
  body: "Saturday 14 November at 09:00 · BSÍ bus terminal",
  path: "/bookings/0190a1d6-0000-7000-8000-0000000000b1",
};

const webAppUrl = "https://puffinride.is";
const link = `${webAppUrl}${confirmed.path}`;

/** Every value of an attribute in the HTML, such as each `href`. */
const attributes = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, "g"))].map((match) => match[1] ?? "");

describe("emailContent (spec 24)", () => {
  describe("the plain text (3.5)", () => {
    it("gives the title, the words, the link and the footer, with the web app's address", () => {
      const email = emailContent(confirmed, "en", webAppUrl);
      expect(email.subject).toBe("Booking confirmed");
      expect(email.text).toBe(
        [
          "Booking confirmed",
          "",
          "Saturday 14 November at 09:00 · BSÍ bus terminal",
          "",
          `Open in PuffinRide: ${link}`,
          "",
          "--",
          "You get this email because you have a PuffinRide account. News about your bookings is always sent, because others rely on it.",
          "PuffinRide · https://puffinride.is",
        ].join("\n"),
      );
    });

    it("is in the reader's language", () => {
      const email = emailContent(confirmed, "is", webAppUrl);
      expect(email.text).toContain(`Opna í PuffinRide: ${link}`);
      expect(email.text).toContain("Þú færð þennan póst því þú ert með aðgang að PuffinRide.");
    });

    it("keeps the words as they are written, line breaks and blank lines too", () => {
      const email = emailContent(
        { title: "Note", body: "First line\nSecond line\n\nNext paragraph", path: "/messages/x" },
        "en",
        "http://localhost:8081",
      );
      expect(email.text).toContain("Note\n\nFirst line\nSecond line\n\nNext paragraph\n\n");
      expect(email.text).toContain("Open in PuffinRide: http://localhost:8081/messages/x");
      expect(email.text).toContain("PuffinRide · http://localhost:8081");
    });

    it("uses the link words and footer it is given, such as the address confirmation's", () => {
      const email = emailContent(confirmed, "en", webAppUrl, {
        open: "Confirm my email",
        footer: "You get this email because this address was entered in PuffinRide.",
      });
      expect(email.text).toContain(`Confirm my email: ${link}`);
      expect(email.text).toContain("--\nYou get this email because this address was entered");
    });

    it("uses a notification's own footer, such as the email about new members' (spec 25)", () => {
      const email = emailContent(
        { ...confirmed, footer: "You get this email because you turned it on." },
        "en",
        webAppUrl,
      );
      expect(email.text).toContain("--\nYou get this email because you turned it on.\nPuffinRide");
      expect(email.html).toContain("You get this email because you turned it on.");
      expect(email.html).not.toContain("you have a PuffinRide account");
    });
  });

  describe("the HTML (3.1)", () => {
    it("lays out the title, the words and the button, in the reader's language", () => {
      const { html } = emailContent(confirmed, "is", webAppUrl);
      expect(html).toMatch(/^<!doctype html>\n<html lang="is" dir="ltr"/);
      expect(html).toContain("<title>Booking confirmed</title>");
      expect(html).toMatch(/<h1 [^>]*>Booking confirmed<\/h1>/);
      expect(html).toMatch(/<p [^>]*>Saturday 14 November at 09:00 · BSÍ bus terminal<\/p>/);
      // The one button, with the link's words.
      expect(html).toMatch(new RegExp(`<a [^>]*href="${link}"[^>]*>Opna í PuffinRide</a>`));
      // Only the button shows the link (Martin, 2026-11-22); the plain text writes it out.
      expect(html).not.toContain(`>${link}<`);
      expect(attributes(html, "href").filter((href) => href === link)).toHaveLength(1);
      expect(html).toContain("Þú færð þennan póst því þú ert með aðgang að PuffinRide.");
      expect(html).toMatch(
        /PuffinRide · <a [^>]*href="https:\/\/puffinride.is"[^>]*>puffinride.is<\/a>/,
      );
    });

    it("starts with a hidden preview line of the words, for the inbox list", () => {
      const { html } = emailContent(
        { ...confirmed, body: "First paragraph\nstill first\n\nSecond" },
        "en",
        webAppUrl,
      );
      expect(html).toMatch(/<div [^>]*display:none[^>]*>First paragraph still first[^<]*<\/div>/);
    });

    it("reads an operator's Windows line ends and blank lines with spaces as paragraphs", () => {
      const email = emailContent(
        { title: "News", body: "a\n \n \nb\r\nstill b\r\n\r\n\r\nc \n", path: "/x" },
        "en",
        webAppUrl,
      );
      expect(email.text).toContain("News\n\na\n\nb\nstill b\n\nc\n\nOpen in PuffinRide");
      expect(email.html).toMatch(/<p [^>]*>b<br>still b<\/p>/);
      expect(email.html).toMatch(/<p [^>]*>c<\/p>/);
    });

    it("makes a paragraph of each part between blank lines, and keeps line breaks", () => {
      const { html } = emailContent(
        { title: "Note", body: "First line\nSecond line\n\nNext paragraph", path: "/messages/x" },
        "en",
        webAppUrl,
      );
      expect(html).toMatch(/<p [^>]*>First line<br>Second line<\/p>/);
      expect(html).toMatch(/<p [^>]*>Next paragraph<\/p>/);
    });

    it("does not repeat the title when the words start with it, as a statement of reasons does", () => {
      const email = emailContent(
        {
          title: "Your appeal is answered",
          body: "We changed our decision.",
          emailBody: "Your appeal is answered\n\nWe changed our decision.\n\nAnswer: sorry",
          path: "/notices",
        },
        "en",
        webAppUrl,
      );
      expect(email.html.match(/Your appeal is answered/g)).toHaveLength(2); // <title> and <h1>
      expect(email.text).toMatch(
        /^Your appeal is answered\n\nWe changed our decision\.\n\nAnswer: sorry\n\n/,
      );
    });

    it("shows the puffin pin from inside the email, and loads nothing from elsewhere (R24.2)", () => {
      const email = emailContent(confirmed, "en", webAppUrl);
      expect(email.images).toEqual([emailLogo]);
      expect(attributes(email.html, "src")).toEqual([`cid:${emailLogo.contentId}`]);
      expect(email.html).toMatch(/<img [^>]*width="40" height="40" alt=""/);
      expect(email.html).not.toMatch(/<script|<link|@import|url\(|<iframe|<form/i);
      for (const href of attributes(email.html, "href"))
        expect(href.startsWith(webAppUrl)).toBe(true);
    });

    it("uses spec 15's colours, and their dark mode for mail apps that follow it (3.2)", () => {
      const { html } = emailContent(confirmed, "en", webAppUrl);
      const [head = "", light = ""] = html.split("</head>");
      const from = head.indexOf("@media (prefers-color-scheme:dark)");
      const dark = head.slice(from, head.indexOf("</style>", from));
      for (const token of [
        "background",
        "surface",
        "text",
        "textMuted",
        "primary",
        "onPrimary",
        "primaryEdge",
        "edge",
      ] as const) {
        expect(light).toContain(colors.light[token]);
        expect(dark).toContain(colors.dark[token]);
      }
      expect(html).toContain('<meta name="color-scheme" content="light dark">');
    });

    it("escapes whatever the words and the link hold, such as a meeting point's name", () => {
      const email = emailContent(
        {
          title: 'Pay now: <Bónus> & "Krónan"',
          body: "Tom's <b>stop</b>",
          path: '/bookings/"x"<y>',
        },
        "en",
        webAppUrl,
      );
      expect(email.subject).toBe('Pay now: <Bónus> & "Krónan"');
      expect(email.html).toContain(
        "<title>Pay now: &lt;Bónus&gt; &amp; &quot;Krónan&quot;</title>",
      );
      expect(email.html).toMatch(/<p [^>]*>Tom&#39;s &lt;b&gt;stop&lt;\/b&gt;<\/p>/);
      expect(email.html).toContain('href="https://puffinride.is/bookings/&quot;x&quot;&lt;y&gt;"');
      expect(email.html).not.toContain("<b>");
      expect(email.text).toContain("Tom's <b>stop</b>");
    });
  });
});
