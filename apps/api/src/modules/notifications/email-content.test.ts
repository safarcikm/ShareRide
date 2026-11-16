import { describe, expect, it } from "vitest";
import { emailContent } from "./email-content.ts";

const confirmed = {
  title: "Booking confirmed",
  body: "Saturday 14 November at 09:00 · BSÍ bus terminal",
  path: "/bookings/0190a1d6-0000-7000-8000-0000000000b1",
};

describe("emailContent (plan 4.6)", () => {
  it("makes the subject, the plain text with a link to the screen, and the footer", () => {
    const email = emailContent(confirmed, "en", "https://shareride.is");
    expect(email.subject).toBe("Booking confirmed");
    expect(email.text).toBe(
      [
        "Saturday 14 November at 09:00 · BSÍ bus terminal",
        "",
        "Open in ShareRide: https://shareride.is/bookings/0190a1d6-0000-7000-8000-0000000000b1",
        "",
        "You get this email because you have a ShareRide account. News about your bookings is always sent, because others rely on it.",
      ].join("\n"),
    );
  });

  it("makes simple HTML in the reader's language: the words, a plain link, no images", () => {
    const email = emailContent(confirmed, "is", "https://shareride.is");
    expect(email.html).toContain('<html lang="is">');
    expect(email.html).toContain("<title>Booking confirmed</title>");
    expect(email.html).toContain("<p>Saturday 14 November at 09:00 · BSÍ bus terminal</p>");
    expect(email.html).toContain(
      '<a href="https://shareride.is/bookings/0190a1d6-0000-7000-8000-0000000000b1">Opna í ShareRide</a>',
    );
    expect(email.html).toContain("Þú færð þennan póst því þú ert með aðgang að ShareRide.");
    expect(email.html).not.toMatch(/<img|<script|style=/i);
  });

  it("escapes whatever the words hold, such as a meeting point's name", () => {
    const email = emailContent(
      { title: 'Pay now: <Bónus> & "Krónan"', body: "Tom's <b>stop</b>", path: "/bookings/x" },
      "en",
      "https://shareride.is",
    );
    expect(email.subject).toBe('Pay now: <Bónus> & "Krónan"');
    expect(email.html).toContain("<title>Pay now: &lt;Bónus&gt; &amp; &quot;Krónan&quot;</title>");
    expect(email.html).toContain("<p>Tom&#39;s &lt;b&gt;stop&lt;/b&gt;</p>");
    expect(email.text).toContain("Tom's <b>stop</b>");
  });

  it("keeps line breaks in the words as separate lines", () => {
    const email = emailContent(
      { title: "Note", body: "First line\nSecond line", path: "/messages/x" },
      "en",
      "http://localhost:8081",
    );
    expect(email.html).toContain("<p>First line<br>Second line</p>");
    expect(email.text).toContain("Open in ShareRide: http://localhost:8081/messages/x");
  });
});
