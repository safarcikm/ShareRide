import type { Locale } from "@shareride/i18n";
import { colors, edges, maxContentWidth, radii, spacing, typeScale } from "@shareride/ui";
import type { EmailImage } from "../../platform/email.ts";

// The HTML of every email (spec 24, 3.1): the puffin pin and the name, a
// card with the title, the words and one button (the link is written out
// only in the plain-text part), and the footer. Tables with
// the styles written on each part, as mail apps need; a <style> block only
// for the phone width and dark mode (3.2), and one for Apple's automatic
// links and Outlook's dark mode, so a mail app that drops one keeps the
// other. Nothing is loaded from elsewhere (R24.2).

export interface EmailLayout {
  readonly locale: Locale;
  readonly title: string;
  /** The words, a paragraph each; a line break stays one. */
  readonly paragraphs: readonly string[];
  readonly button: { readonly label: string; readonly href: string };
  readonly footer: string;
  /** "PuffinRide", from the texts. */
  readonly name: string;
  /** The web app, as `href`, and its address without the scheme. */
  readonly home: { readonly label: string; readonly href: string };
  readonly logo: EmailImage;
}

const escapes: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const escaped = (text: string) =>
  text.replace(/[&<>"']/g, (character) => escapes[character] ?? "");

/**
 * Fredoka and Nunito for those who have them (no font is downloaded, spec
 * 15); then Apple's rounded system font for titles, and each system's own.
 */
const displayFont =
  "'Fredoka','SF Pro Rounded',ui-rounded,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const bodyFont =
  "'Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const light = colors.light;
const dark = colors.dark;
const px = (value: number) => `${String(value)}px`;

/** The logo's size in the email, and the name next to it (spec 15, 4.9). */
const logoSize = 40;
const nameSize = 0.6 * logoSize;
const nameGap = logoSize / 4;
/** The button's padding above and below its words: 48 high with them, and its edge under it. */
const buttonPadding = (48 - typeScale.button.lineHeight) / 2;

/** A type style's font, size, line height and weight (the face's number, such as Fredoka_600SemiBold). */
function type(style: keyof typeof typeScale, colour: string): string {
  const { face, fontSize, lineHeight } = typeScale[style];
  return [
    `font-family:${face.startsWith("Fredoka") ? displayFont : bodyFont}`,
    `font-size:${px(fontSize)}`,
    `line-height:${px(lineHeight)}`,
    // Outlook on Windows reads a line height as the least, not the exact one.
    "mso-line-height-rule:exactly",
    `font-weight:${/_(\d{3})/.exec(face)?.[1] ?? "400"}`,
    `color:${colour}`,
  ].join(";");
}

const paragraph = (text: string) => escaped(text).replaceAll("\n", "<br>");

/** Mail apps show the first text in the inbox list; spacing after it keeps the rest out. */
const previewSpacing = "&#847;&zwnj;&nbsp;".repeat(60);

const styles = `<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
body{margin:0;padding:0;width:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:separate;mso-table-lspace:0;mso-table-rspace:0}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
@media (max-width:${px(maxContentWidth + spacing.xl)}){
.pr-outer{padding:${px(spacing.md)} ${px(spacing.sm)}!important}
.pr-card{padding:${px(spacing.lg)}!important}
.pr-aside{padding-left:${px(spacing.sm)}!important;padding-right:${px(spacing.sm)}!important}
}
@media (prefers-color-scheme:dark){
.pr-page{background-color:${dark.background}!important}
.pr-surface{background-color:${dark.surface}!important;border-bottom-color:${dark.edge}!important}
.pr-text{color:${dark.text}!important}
.pr-muted{color:${dark.textMuted}!important}
.pr-button{background-color:${dark.primary}!important;border-bottom-color:${dark.primaryEdge}!important}
.pr-button-text{color:${dark.onPrimary}!important}
}
</style>
<style>
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important}
[data-ogsb] .pr-page{background-color:${dark.background}!important}
[data-ogsb] .pr-surface{background-color:${dark.surface}!important;border-bottom-color:${dark.edge}!important}
[data-ogsc] .pr-text{color:${dark.text}!important}
[data-ogsc] .pr-muted{color:${dark.textMuted}!important}
[data-ogsb] .pr-button{background-color:${dark.primary}!important;border-bottom-color:${dark.primaryEdge}!important}
[data-ogsc] .pr-button-text{color:${dark.onPrimary}!important}
</style>`;

const presentation = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

/** The HTML of an email in the PuffinRide layout. */
export function emailHtml(layout: EmailLayout): string {
  const { title, paragraphs, button, footer, name, home, logo } = layout;
  const href = escaped(button.href);
  const preview = (paragraphs[0] ?? "").replaceAll("\n", " ");
  const text = type("body", light.text);
  const small = type("small", light.textMuted);
  return [
    "<!doctype html>",
    `<html lang="${layout.locale}" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="x-apple-disable-message-reformatting">',
    '<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">',
    '<meta name="color-scheme" content="light dark">',
    '<meta name="supported-color-schemes" content="light dark">',
    `<title>${escaped(title)}</title>`,
    "<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>",
    "<style>h1,p,td,a{font-family:Arial,sans-serif!important}</style><![endif]-->",
    styles,
    "</head>",
    `<body class="pr-page" style="margin:0;padding:0;background-color:${light.background}">`,
    `<div aria-hidden="true" style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${light.background};opacity:0">${escaped(preview)}${previewSpacing}</div>`,
    `<div role="article" aria-labelledby="pr-title" lang="${layout.locale}" dir="ltr">`,
    `<table ${presentation} width="100%" class="pr-page" bgcolor="${light.background}" style="background-color:${light.background}">`,
    `<tr><td align="center" class="pr-outer" style="padding:${px(spacing.lg)} ${px(spacing.md)}">`,
    `<!--[if mso]><table ${presentation} width="${String(maxContentWidth)}" align="center"><tr><td><![endif]-->`,
    `<table ${presentation} width="100%" style="max-width:${px(maxContentWidth)}">`,
    // The puffin pin and the name.
    `<tr><td class="pr-aside" style="padding:0 0 ${px(spacing.md)} 0">`,
    `<table ${presentation}><tr>`,
    `<td style="vertical-align:middle"><img src="cid:${logo.contentId}" width="${String(logoSize)}" height="${String(logoSize)}" alt="" style="display:block;width:${px(logoSize)};height:${px(logoSize)};border:0"></td>`,
    `<td class="pr-text" style="vertical-align:middle;padding-left:${px(nameGap)};font-family:${displayFont};font-size:${px(nameSize)};line-height:${px(logoSize)};font-weight:600;color:${light.text}">${escaped(name)}</td>`,
    "</tr></table>",
    "</td></tr>",
    // The card.
    `<tr><td class="pr-card pr-surface" bgcolor="${light.surface}" style="background-color:${light.surface};border-radius:${px(radii.card)};border-bottom:${px(edges.card)} solid ${light.edge};padding:${px(spacing.xl)}">`,
    `<h1 id="pr-title" class="pr-text" style="margin:0 0 ${px(spacing.md)} 0;${type("title", light.text)}">${escaped(title)}</h1>`,
    ...paragraphs.map(
      (words) =>
        `<p class="pr-text" style="margin:0 0 ${px(spacing.md)} 0;${text}">${paragraph(words)}</p>`,
    ),
    `<table ${presentation} style="margin:${px(spacing.lg)} 0 0 0"><tr>`,
    `<td class="pr-button" bgcolor="${light.primary}" style="background-color:${light.primary};border-radius:${px(radii.control)};border-bottom:${px(edges.buttonPrimary)} solid ${light.primaryEdge};mso-padding-alt:${px(buttonPadding)} ${px(spacing.lg)}">`,
    `<a class="pr-button-text" href="${href}" style="display:inline-block;padding:${px(buttonPadding)} ${px(spacing.lg)};${type("button", light.onPrimary)};text-decoration:none;border-radius:${px(radii.control)}">${escaped(button.label)}</a>`,
    "</td></tr></table>",
    "</td></tr>",
    // The footer.
    `<tr><td class="pr-aside" style="padding:${px(spacing.md)} 0 0 0">`,
    `<p class="pr-muted" style="margin:0 0 ${px(spacing.sm)} 0;${small}">${paragraph(footer)}</p>`,
    `<p class="pr-muted" style="margin:0;${small}">${escaped(name)} · <a class="pr-muted" href="${escaped(home.href)}" style="color:${light.textMuted};text-decoration:underline">${escaped(home.label)}</a></p>`,
    "</td></tr>",
    "</table>",
    "<!--[if mso]></td></tr></table><![endif]-->",
    "</td></tr></table>",
    "</div>",
    "</body>",
    "</html>",
  ].join("\n");
}
