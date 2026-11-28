// Draws spec 34's pictures (CO2 saved on shared rides): node build.cjs [out folder]
// Uses spec 31's drawing kit (its colours, fonts, icons and parts), so it
// needs the app's fonts and icons (the workspace installed, or REPO pointing
// at a folder with apps/mobile/node_modules) and Playwright's Chromium.
// Drawings only: nothing here ships in the app. Fictional names and rides.
const fs = require("node:fs");
const path = require("node:path");
const kit = require("../../one-ride-one-ticket/src/mock/kit.cjs");
const { icon, drawings, sized, road, avatar, ticket, topbar, tabbar, en, is } = kit;

const out = path.resolve(process.argv[2] ?? path.join(__dirname, "out"));
fs.mkdirSync(out, { recursive: true });

const chev = icon("chevron-right", 20, 'class="ic chev"');
const chevDown = icon("chevron-down", 20, 'class="ic chev"');
const chevUp = icon("chevron-up", 20, 'class="ic chev"');
const row = (name, label, value = "", { danger = false, opens = true, unfolds = false } = {}) =>
  `<div class="listrow ${danger ? "danger" : ""}"><span class="ri">${icon(name, 20)}</span><div class="grow"><div class="strong">${label}</div>${value === "" ? "" : `<div class="small muted">${value}</div>`}</div>${danger || !opens ? "" : unfolds ? chevDown : chev}</div>`;
const rows = (...list) => `<div class="card flush">${list.join("")}</div>`;
const back = `<span class="iconbtn">${icon("chevron-left")}</span>`;
const head = (title, sub = "", more = "", over = "") =>
  `<div class="head">${back}<div class="titles">${over === "" ? "" : `<div class="small muted">${over}</div>`}<h1>${title}</h1>${sub === "" ? "" : `<p class="muted" style="margin-top:2px">${sub}</p>`}</div>${more}</div>`;
const sect = (text, more = "") => `<div class="sect">${text}${more}</div>`;
const stepper = (value) =>
  `<span class="row" style="gap:10px"><span class="btn secondary sm" style="width:40px;padding:0">${icon("minus", 18)}</span><span class="fig" style="width:18px;text-align:center">${value}</span><span class="btn secondary sm" style="width:40px;padding:0">${icon("plus", 18)}</span></span>`;

/**
 * The new part: one row in a card of its own, with the leaf in the row's
 * usual soft square (no green badge), the estimate under the name, and what
 * it means unfolded under them.
 */
function co2({ title, value, open = false, text = "", link = "", note = "" }) {
  const more = open
    ? `<div class="small" style="margin-top:8px">${text}</div><div style="margin-top:8px"><span class="link" style="text-decoration:underline;text-underline-offset:3px">${link}</span></div>`
    : "";
  return `<div class="card flush"><div class="listrow" style="align-items:flex-start;padding-top:10px;padding-bottom:12px"><span class="ri" style="margin-top:2px">${icon("leaf", 20)}</span><div class="grow"><div class="strong">${title}</div><div class="small muted">${value}</div>${more}</div><span style="margin-top:8px">${open ? chevUp : chevDown}</span></div></div>${note === "" ? "" : `<div class="small muted" style="margin-top:-8px">${note}</div>`}`;
}

const t = {
  en: {
    title: "CO₂ saved",
    link: "How we estimate it",
    rideValue: "About 58 kg, estimated",
    rideText:
      "One car fewer on the road for 389&nbsp;km: about 58&nbsp;kg less CO₂ than driving alone. Estimated from the road distance and an average car in Iceland.",
    driverValue: "About 95 kg, estimated",
    driverText:
      "Your passengers ride 634&nbsp;km with you instead of driving: about 95&nbsp;kg less CO₂ than driving alone. Estimated from the road distance and an average car in Iceland.",
    totalValue: "About 161 kg, estimated",
    totalText:
      "As a passenger: 66&nbsp;kg on 2 rides.<br>As a driver: 95&nbsp;kg with 2 passengers on 1 ride.<br>Each compared with driving alone. Estimated from the road distance and an average car in Iceland.",
    onlyYou: "Only you can see this.",
  },
  is: {
    title: "Minni losun CO₂",
    link: "Svona áætlum við",
    rideValue: "Um 58 kg, áætlað",
    driverValue: "Um 95 kg, áætlað",
    driverText:
      "Farþegarnir þínir fara 634&nbsp;km með þér í stað þess að aka sjálfir: um 95&nbsp;kg minni losun CO₂ en að aka einn. Áætlað út frá vegalengdinni og meðalbíl á Íslandi.",
    totalValue: "Um 161 kg, áætlað",
    totalText:
      "Sem farþegi: 66&nbsp;kg í 2 ferðum.<br>Sem bílstjóri: 95&nbsp;kg með 2 farþega í 1 ferð.<br>Alltaf miðað við að aka einn. Áætlað út frá vegalengdinni og meðalbíl á Íslandi.",
    onlyYou: "Aðeins þú sérð þetta.",
  },
};

const approves = `<span class="tag info">${icon("user-check", 13)}Driver approves</span>`;
const newDriver = (label = "New driver") => `<span class="tag warn">${label}</span>`;
const steps = ["Asked", "Confirmed", "Trip day", "Done"];
const stepsIs = ["Beiðni", "Staðfest", "Ferðadagur", "Lokið"];
const pref = (name, colour, label) =>
  `<span class="row" style="gap:6px"><span style="width:26px;height:26px;border-radius:50%;background:${colour};display:flex;align-items:center;justify-content:center;color:#1F2A30">${icon(name, 14)}</span><span class="small">${label}</span></span>`;
const stop = (time, place, tag = "", faded = false) =>
  `<span class="t" style="${faded ? "color:var(--muted);font-weight:500;font-size:16px" : ""}">${time}</span><span class="dot ${faded ? "" : "end"}" style="${faded ? "border-color:var(--control)" : ""}"></span><span class="row" style="gap:8px"><span class="${faded ? "muted" : "p"} grow">${place}</span>${tag}</span>`;
const driverCard = (message = "") => `<div class="card stack" style="gap:12px">
  <div class="row">${avatar("Anna", "lg")}<div class="grow"><div class="fig sm" style="font-size:19px">Anna</div><div class="row small" style="gap:8px">${newDriver()}</div><div class="small muted">Reliability: not enough rides yet</div></div>${message === "" ? chev : message}</div>
  <div class="line"></div>
  <div class="row"><span class="listrow" style="padding:0;min-height:0"><span class="ri">${icon("car", 20)}</span></span><div class="grow"><div class="strong">Red Skoda Octavia</div><div class="small muted">${message === "" ? "Number plate shown once your seat is confirmed" : "AB 123"}</div></div></div>
</div>`;

const screens = {};

// ---- 1. A ride's details: the estimate for my part, unfolded.
screens["1-ride-phone-light"] = `<div class="phone">
  <div class="body">
    ${head("BSÍ bus terminal to Hof bus stop, Akureyri", "", `<span class="iconbtn">${icon("share", 20)}</span>`, "Friday 4 December")}
    <div class="ticket">
      <div class="when"><span class="cap muted grow">Your part of the ride</span>${approves}</div>
      <div class="top"><div class="route" style="grid-template-columns:auto 16px 1fr auto">
        <span class="t">09:00</span><span class="dot"></span><span class="p">BSÍ bus terminal</span><span class="link">Change</span>
        <span></span><span class="rail" style="min-height:26px"></span><span class="dur">5 h</span><span></span>
        <span class="t">14:00</span><span class="dot end"></span><span class="p">Hof bus stop, Akureyri</span><span class="link">Change</span>
      </div></div>
      <div class="cut"></div>
      <div class="foot"><div class="grow"><div class="strong">Seats</div><div class="small muted">3 free on your part</div></div>${stepper(1)}</div>
    </div>
    ${driverCard()}
    <div class="card stack" style="gap:12px">
      <h2>The whole route</h2>
      <div class="small muted">The map is left out of this drawing.</div>
      <div class="route" style="row-gap:10px">${stop("09:00", "BSÍ bus terminal", `<span class="tag pos">Get in</span>`)}${stop("10:05", "N1 Borgarnes", "", true)}${stop("12:15", "Olís Blönduós", "", true)}${stop("14:00", "Hof bus stop, Akureyri", `<span class="tag pos">Get out</span>`)}</div>
    </div>
    ${co2({ title: t.en.title, value: t.en.rideValue, open: true, text: t.en.rideText, link: t.en.link })}
    ${rows(row("shield-check", "Free cancellation", "Up to 15 min before", { unfolds: true }), row("cloud-sun", "Weather and roads", "", { unfolds: true }), row("flag", "Report this ride"))}
  </div>
  <div class="bottombar"><div><div class="fig">5,800 ISK</div><div class="small muted">1 seat</div></div><span class="btn primary main">Send request</span></div>
</div>`;

// ---- 2. A booked seat after the ride: the estimate stays, folded.
const myTicket = ticket({
  day: "Fri 4 Dec",
  tags: `<span class="tag plain">${icon("ticket", 13)}Passenger</span>`,
  from: ["09:00", "BSÍ bus terminal"],
  to: ["14:00", "Hof bus stop, Akureyri"],
  duration: "5 h",
  foot: `<span class="strong">1 seat</span><span class="grow"></span><span class="fig sm">5,800 ISK</span>`,
  mine: true,
});
const messageButton = `<span class="btn secondary sm">Message</span>`;
screens["2-booking-after-phone-light"] = `<div class="phone">
  <div class="body">
    ${head("How was your ride?", "You can rate Anna until Friday 18 December.")}
    <div class="card" style="padding:14px 12px 12px">${road(steps, 3)}</div>
    ${myTicket}
    ${driverCard(messageButton)}
    ${co2({ title: t.en.title, value: t.en.rideValue })}
    ${rows(row("flag", "Report a problem with this ride"))}
  </div>
  <div class="bottombar"><span class="btn primary main">Rate the driver</span></div>
</div>`;

// ---- 3. The driver's ride after it, in Icelandic and dark: its passengers' estimate.
const passenger = (name, part, state) =>
  `<div class="listrow" style="align-items:flex-start"><span style="margin-top:2px">${avatar(name)}</span><div class="grow"><div class="strong">${name}</div><div class="small muted">${part}</div>${state}</div>${chevDown}</div>`;
const driverTicketIs = ticket({
  day: "Fös. 4. des.",
  tags: `<span class="tag plain">${icon("car", 13)}Þú ekur</span>`,
  from: ["09:00", "BSÍ, umferðarmiðstöð"],
  to: ["14:00", "Hof, stoppistöð, Akureyri"],
  duration: "5 klst., 2 stopp",
  foot: `<span class="strong">5.800 kr.</span><span class="muted">alla leið</span><span class="grow"></span><span class="muted">Skoda Octavia, rauður</span>`,
  mine: true,
});
screens["3-driver-ride-phone-dark-is"] = `<div class="phone dark">
  <div class="body">
    ${head("Ferðin þín: BSÍ → Hof, Akureyri", "Þessi ferð er farin.")}
    ${driverTicketIs}
    ${sect("Farþegar", `<span class="small muted" style="font-family:Nunito;font-weight:400">2 lokið</span>`)}
    <div class="card flush">${passenger("Dóra", "BSÍ til Hof, Akureyri, 1 sæti, 5.800 kr.", `<span class="tag plain" style="margin-top:4px">Lokið</span><div class="link" style="margin-top:6px">Gefðu farþeganum einkunn: Dóra</div>`)}${passenger("Gunnar", "BSÍ til Olís Blönduós, 1 sæti, 3.600 kr.", `<span class="tag plain" style="margin-top:4px">Lokið</span><div class="link" style="margin-top:6px">Gefðu farþeganum einkunn: Gunnar</div>`)}${row("messages-square", "Senda öllum farþegum skilaboð")}</div>
    ${co2({ title: t.is.title, value: t.is.driverValue, open: true, text: t.is.driverText, link: t.is.link })}
    ${sect("Aka aftur")}
    ${rows(row("repeat", "Birta aftur"), row("undo-2", "Birta bakaleiðina"))}
  </div>
</div>`;

// ---- 4. Profile: my totals, as a passenger and as a driver.
const personCard = (texts) => `<div class="card stack" style="gap:12px">
  <div class="row">${avatar("Bára", "lg")}<div class="grow"><div class="fig sm" style="font-size:19px">Bára</div><div class="small muted">${texts.speaks}</div><div class="small muted">${texts.since}</div></div><span class="btn secondary sm">${texts.edit}</span></div>
  <div class="row" style="gap:8px;flex-wrap:wrap"><span class="star">${icon("star", 14)}4.8</span><span class="small muted">${texts.ratings}</span><span class="tag pos">${texts.phone}</span><span class="tag pos">${texts.email}</span></div>
  <div class="row" style="gap:24px"><span class="link">${texts.change}</span><span class="link">${texts.remove}</span></div>
  <span class="link" style="text-decoration:underline">${texts.preview}</span>
</div>`;
const person = {
  en: {
    speaks: "Speaks English",
    since: "Member since November 2026",
    edit: "Edit",
    ratings: "(5 ratings)",
    phone: "Phone verified",
    email: "Email verified",
    change: "Change photo",
    remove: "Remove photo",
    preview: "See it as others do",
  },
  is: {
    speaks: "Talar íslensku",
    since: "Meðlimur síðan í nóvember 2026",
    edit: "Breyta",
    ratings: "(5 einkunnir)",
    phone: "Sími staðfestur",
    email: "Netfang staðfest",
    change: "Skipta um mynd",
    remove: "Fjarlægja mynd",
    preview: "Sjáðu hvernig aðrir sjá þig",
  },
};
screens["4-profile-phone-light"] = `<div class="phone">
  <div class="body">
    <h1>My profile</h1>
    ${personCard(person.en)}
    ${sect("Your shared rides")}
    ${co2({ title: t.en.title, value: t.en.totalValue, open: true, text: t.en.totalText, link: t.en.link, note: t.en.onlyYou })}
    ${sect("Driving")}
    ${rows(row("car", "My cars", "Skoda Octavia"), row("id-card", "Driving licence", "Confirmed"))}
    ${sect("Account")}
    ${rows(row("mail", "Email", "bara@example.com"), row("phone", "Phone number", "+354 555 0100", { opens: false }))}
  </div>
  ${tabbar(4, en)}
</div>`;
screens["5-profile-phone-dark-is"] = `<div class="phone dark">
  <div class="body">
    <h1>Prófíllinn minn</h1>
    ${personCard(person.is)}
    ${sect("Ferðirnar þínar")}
    ${co2({ title: t.is.title, value: t.is.totalValue, note: t.is.onlyYou })}
    ${sect("Akstur")}
    ${rows(row("car", "Bílarnir mínir", "Skoda Octavia"), row("id-card", "Ökuskírteini", "Staðfest"))}
  </div>
  ${tabbar(4, is)}
</div>`;

// ---- 6. A booked seat on a laptop: the estimate in the main column; the
// side column keeps what it had, so it still fits a window 1280 by 720.
screens["6-booking-after-laptop-light"] = `<div class="laptop first">
  ${topbar(1)}
  <div class="page">
    ${head("How was your ride?", "You can rate Anna until Friday 18 December.")}
    <div class="row" style="align-items:flex-start;gap:24px">
      <div class="grow stack">
        <div class="card" style="padding:14px 12px 12px">${road(steps, 3)}</div>
        <div class="row" style="align-items:stretch;gap:16px"><div class="grow">${driverCard(messageButton)}</div><div class="grow card stack" style="gap:12px"><div class="row"><h2 class="grow">Where to stand</h2><span class="link">Open in maps</span></div><div class="row" style="align-items:flex-start"><span style="width:96px;height:72px;border-radius:14px;overflow:hidden;flex:none;line-height:0">${sized(drawings.tripMap, 96, 72, 'preserveAspectRatio="xMidYMid slice"', "282 560 76 57")}</span><div class="grow"><div class="strong">BSÍ bus terminal</div><div class="small muted">By the main door, on the side of the car park.</div></div></div></div></div>
        ${co2({ title: t.en.title, value: t.en.rideValue, open: true, text: t.en.rideText, link: t.en.link })}
      </div>
      <div class="stack" style="width:400px;flex:none">
        <span class="btn primary main" style="flex:none">Rate the driver</span>
        ${myTicket}
        ${rows(row("flag", "Report a problem with this ride"))}
      </div>
    </div>
  </div>
</div>`;

// ---- 7. Profile on a laptop: the group leads the main column.
screens["7-profile-laptop-light"] = `<div class="laptop first">
  ${topbar(4)}
  <div class="page">
    <h1>My profile</h1>
    <div class="row" style="align-items:flex-start;gap:24px">
      <div class="stack" style="width:400px;flex:none">${personCard(person.en)}</div>
      <div class="grow stack">
        ${sect("Your shared rides")}
        ${co2({ title: t.en.title, value: t.en.totalValue, note: t.en.onlyYou })}
        ${sect("Driving")}
        ${rows(row("car", "My cars", "Skoda Octavia"), row("id-card", "Driving licence", "Confirmed"))}
        ${sect("Account")}
        ${rows(row("mail", "Email", "bara@example.com"), row("phone", "Phone number", "+354 555 0100", { opens: false }), row("key", "Sign-in methods", "Email, Google"), row("bell", "Notifications"))}
      </div>
    </div>
  </div>
</div>`;

// ---- 8. About: how the estimate is made, in a section of its own.
screens["8-about-phone-light"] = `<div class="phone">
  <div class="body">
    <div class="head">${back}<div class="titles"><h1>About PuffinRide</h1></div></div>
    <div class="card stack" style="gap:12px">
      <h2 id="co2">What a shared ride saves</h2>
      <p>When you share a ride, one car fewer drives your part of the way. We estimate the CO₂ this saves from the road distance of your part and the CO₂ of an average car in Iceland: <b>150&nbsp;g per kilometre</b>.</p>
      <div class="note" style="background:var(--bg)">${icon("leaf", 20)}<span class="small">Reykjavík to Akureyri is about 390&nbsp;km, so a passenger saves about 58&nbsp;kg of CO₂ compared with driving alone.</span></div>
      <p class="small">The 150 g comes from the Environment and Energy Agency's factors for cars in Iceland (208 g per km for petrol, 191 for diesel, 136 for a hybrid and next to nothing for an electric car), weighted by how far cars here drive on each. We check it once a year.</p>
      <p class="small">These are estimates. Two people booking together count as one car. Someone who would have taken the bus, or stayed at home, saves less. Your own figures are on your profile, where only you see them.</p>
    </div>
  </div>
</div>`;

// ---- 0. How one booking is counted: one car fewer for the passenger's part.
const carRow = (count, label, sub) =>
  `<div class="row" style="gap:16px;align-items:center"><div class="row" style="gap:8px;width:250px;flex:none">${Array.from({ length: count }, () => kit.car(110)).join("")}</div><div class="grow"><div class="strong">${label}</div><div class="small muted">${sub}</div></div></div>`;
screens["0-how-it-counts"] = `<div class="phone" style="width:760px;border-radius:22px">
  <div class="body" style="gap:18px;padding:24px">
    <div><h2>How one booking is counted</h2><p class="small muted">Dóra books a seat from Reykjavík to Akureyri with Anna, who drives there anyway.</p></div>
    <div class="card stack" style="gap:14px">
      ${carRow(2, "Each driving alone", "Two cars drive 389&nbsp;km")}
      <div class="line"></div>
      ${carRow(1, "Sharing the ride", "One car drives 389&nbsp;km")}
    </div>
    <div class="card row" style="gap:12px;flex-wrap:wrap;justify-content:center;font-size:19px;line-height:28px">
      <span class="strong">1 car fewer</span><span class="muted">×</span><span class="strong">389&nbsp;km</span><span class="muted">×</span><span class="strong">150&nbsp;g per km</span><span class="muted">=</span><span class="fig">about 58&nbsp;kg</span>
    </div>
    <ul class="small" style="padding-left:20px;display:flex;flex-direction:column;gap:6px">
      <li><b>Dóra</b> sees about 58&nbsp;kg on the booking, and in the total on My profile as a passenger.</li>
      <li><b>Anna</b> sees it on the ride, added to what the ride's other passengers saved, and in the total on My profile as a driver.</li>
      <li><b>PuffinRide's own total</b> counts it once.</li>
      <li>Two seats on one booking still count as one car: people booking together would have shared a car anyway.</li>
    </ul>
  </div>
</div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${kit.css}
.shot { display: inline-block; margin: 0 24px 24px 0; vertical-align: top; }
.listrow > .grow > .small.muted { margin-top: 1px; }
</style></head><body>${Object.entries(screens)
  .map(([name, markup]) => `<div class="shot" id="s${name}">${markup}</div>`)
  .join("")}</body></html>`;
fs.writeFileSync(path.join(out, "screens.html"), html);

(async () => {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    playwright = require(
      require.resolve("@playwright/test", { paths: [path.join(kit.repo, "apps/mobile")] }),
    );
  }
  const browser = await playwright.chromium.launch(
    process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
  );
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 2,
  });
  await page.goto(`file://${path.join(out, "screens.html")}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  for (const name of Object.keys(screens)) {
    await page
      .locator(`#s${name} > *`)
      .first()
      .screenshot({ path: path.join(out, `${name}.png`), omitBackground: true });
    console.log(name);
  }
  await browser.close();
})();
