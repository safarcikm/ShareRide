// Draws the redesign's proposed screens as pictures: node build.cjs [out folder]
// (needs the workspace installed, for the fonts and icons, and Playwright's
// Chromium). Fictional names and trips only.
const fs = require("node:fs");
const path = require("node:path");
const kit = require("./kit.cjs");
const { icon, drawings, sized, car, road, avatar, route, ticket, tabbar, topbar, logo, en, is } =
  kit;

const out = path.resolve(process.argv[2] ?? path.join(__dirname, "out"));
fs.mkdirSync(out, { recursive: true });

const chev = icon("chevron-right", 20, 'class="ic chev"');
const row = (name, label, value = "", danger = false, opens = true) =>
  `<div class="listrow ${danger ? "danger" : ""}"><span class="ri">${icon(name, 20)}</span><span class="grow strong">${label}</span>${value === "" ? "" : `<span class="val">${value}</span>`}${danger || !opens ? "" : chev}</div>`;
// A row that unfolds what is under it.
const chevDown = icon("chevron-down", 20, 'class="ic chev"');
const rows = (...list) => `<div class="card flush">${list.join("")}</div>`;
const back = `<span class="iconbtn">${icon("chevron-left")}</span>`;
const head = (title, sub = "", more = "") =>
  `<div class="head">${back}<div class="titles"><h1>${title}</h1>${sub === "" ? "" : `<p class="muted" style="margin-top:2px">${sub}</p>`}</div>${more}</div>`;
const star = (text) => `<span class="star">${icon("star", 14)}${text}</span>`;
const instant = `<span class="tag pos">${icon("zap", 13)}Book instantly</span>`;
const approves = `<span class="tag info">${icon("user-check", 13)}Driver approves</span>`;
const share = `<span class="iconbtn flat" style="width:28px;height:28px">${icon("share", 18)}</span>`;
const stepper = (value) =>
  `<span class="row" style="gap:10px"><span class="btn secondary sm" style="width:40px;padding:0">${icon("minus", 18)}</span><span class="fig" style="width:18px;text-align:center">${value}</span><span class="btn secondary sm" style="width:40px;padding:0">${icon("plus", 18)}</span></span>`;

const end = (dot, label, value) =>
  `<div class="row" style="gap:10px;min-height:44px"><span class="route" style="display:block;flex:none;width:16px"><span class="dot ${dot}" style="display:block;margin:auto"></span></span><div class="grow"><div class="cap muted">${label}</div><div class="${value.startsWith("Choose") || value.startsWith("Veldu") ? "muted" : "strong"}" style="white-space:nowrap">${value}</div></div></div>`;
const searchCard = (t) => `<div class="card stack" style="gap:12px">
  <div class="row"><div class="grow">${end("", t.from, t.choose)}<div class="line" style="margin:4px 0 4px 26px"></div>${end("end", t.to, t.choose)}</div><span class="iconbtn" style="background:var(--bg);border:0;width:40px;height:40px">${icon("arrow-up-down", 18)}</span></div>
  <div class="line"></div>
  <div class="row" style="align-items:flex-end"><div class="grow"><div class="cap muted" style="margin-bottom:4px">${t.date}</div><div class="row" style="background:var(--bg);border-radius:16px;height:48px;padding:0 16px;gap:6px">${t.anyDay}${icon("chevron-down", 18)}</div></div><div><div class="cap muted" style="margin-bottom:4px">${t.seats}</div><div style="height:48px;display:flex;align-items:center">${stepper(1)}</div></div></div>
  <span class="btn primary main" style="flex:none">${t.findRide}</span>
</div>`;

const rideFoot = (name, rating, seats) =>
  `${avatar(name, "sm")}<span class="who">${name}</span>${rating}<span class="grow"></span><span class="muted">${seats}</span>`;
const newDriver = `<span class="tag warn">New driver</span>`;

const sample = {
  keflavik: (extra = {}) =>
    ticket({
      day: "Fri 27 Nov",
      tags: instant,
      corner: share,
      from: ["05:30", "Hlemmur"],
      to: ["06:30", "Keflavík Airport"],
      duration: "1 h",
      price: "800 ISK",
      per: "per seat",
      foot: rideFoot("Jón", star("4.9"), "2 seats left"),
      ...extra,
    }),
  akureyri: (extra = {}) =>
    ticket({
      day: "Fri 27 Nov",
      tags: approves,
      corner: share,
      from: ["09:00", "BSÍ bus terminal"],
      to: ["14:00", "Hof bus stop, Akureyri"],
      duration: "5 h",
      price: "5,800 ISK",
      per: "per seat",
      foot: rideFoot("Anna", newDriver, "3 seats left"),
      ...extra,
    }),
  selfoss: (extra = {}) =>
    ticket({
      day: "Fri 27 Nov",
      tags: approves,
      corner: share,
      from: ["17:15", "Mjódd bus terminal"],
      to: ["18:00", "N1 Selfoss"],
      duration: "45 min",
      price: "800 ISK",
      per: "per seat",
      foot: rideFoot("Sigga", star("5.0"), "4 seats left"),
      ...extra,
    }),
  vik: (extra = {}) =>
    ticket({
      day: "Sat 28 Nov",
      tags: instant,
      corner: share,
      from: ["10:00", "N1 Selfoss"],
      to: ["11:35", "N1 Vík"],
      duration: "1 h 35 min",
      price: "1,500 ISK",
      per: "per seat",
      foot: rideFoot("Jón", star("4.9"), "2 seats left"),
      ...extra,
    }),
};

const sceneTop = (dark = false, language = "Íslenska") =>
  `<div class="scene">${dark ? drawings.sceneDark : drawings.scene}<div class="over">${logo(36)}<span class="name grow">PuffinRide</span><span class="link">${language}</span></div><span class="car">${car(170)}</span></div>`;

const screens = {};

// ---- Find, signed in: what needs you, then the search, then rides.
const texts = {
  en: {
    from: "From",
    to: "To",
    choose: "Choose a town or meeting point",
    date: "Date",
    seats: "Seats",
    anyDay: "Any day",
    findRide: "Find a ride",
  },
  is: {
    from: "Frá",
    to: "Til",
    choose: "Veldu bæ eða mótsstað",
    date: "Dagur",
    seats: "Sæti",
    anyDay: "Allir dagar",
    findRide: "Finna far",
  },
};
screens.home = `<div class="phone">
  ${sceneTop()}
  <div class="body">
    <h1>Hi Bára</h1>
    <div class="needs">
      <div class="row" style="align-items:flex-start"><span class="bell">${icon("bell", 20)}</span><div class="grow"><div class="strong">Dóra asks for 1 seat</div><div class="small" style="color:var(--sun-text)">Mjódd to Selfoss, Fri 27 Nov. 11 h left to answer.</div></div></div>
      <span class="btn primary sm" style="align-self:flex-end">See the request</span>
    </div>
    ${searchCard(texts.en)}
    <div class="sect">Your next ride</div>
    ${ticket({ day: "Fri 27 Nov", tags: `<span class="tag plain">${icon("car", 13)}You drive</span>`, from: ["18:30", "Mjódd bus terminal"], to: ["20:55", "N1 Vík"], duration: "2 h 25 min, 5 stops", foot: `<span class="strong">1 of 3 seats taken</span><span class="grow"></span><span class="tag warn">1 request</span>`, mine: true })}
    <div class="sect">Leaving soon<span class="link">See all</span></div>
    ${sample.keflavik()}
    ${sample.akureyri()}
  </div>
  ${tabbar(0, en, 1)}
</div>`;

// ---- The same in Icelandic and dark.
screens["home-is-dark"] = `<div class="phone dark">
  ${sceneTop(true, "English")}
  <div class="body">
    <h1>Hæ Bára</h1>
    <div class="needs">
      <div class="row" style="align-items:flex-start"><span class="bell">${icon("bell", 20)}</span><div class="grow"><div class="strong">Dóra biður um 1 sæti</div><div class="small" style="color:var(--sun-text)">Mjódd til Selfoss, fös. 27. nóv. 11 klst. eftir til að svara.</div></div></div>
      <span class="btn primary sm" style="align-self:flex-end">Sjá beiðnina</span>
    </div>
    ${searchCard(texts.is)}
    <div class="sect">Næsta ferð þín</div>
    ${ticket({ day: "Fös. 27. nóv.", tags: `<span class="tag plain">${icon("car", 13)}Þú ekur</span>`, from: ["18:30", "Mjódd, skiptistöð"], to: ["20:55", "N1 Vík"], duration: "2 klst. 25 mín., 5 stopp", foot: `<span class="strong">1 af 3 sætum upptekið</span><span class="grow"></span><span class="tag warn">1 beiðni</span>`, mine: true })}
    <div class="sect">Leggja brátt af stað<span class="link">Sjá allar</span></div>
    ${ticket({ day: "Fös. 27. nóv.", tags: `<span class="tag pos">${icon("zap", 13)}Bóka strax</span>`, corner: share, from: ["05:30", "Hlemmur"], to: ["06:30", "Keflavíkurflugvöllur"], duration: "1 klst.", price: "800 kr.", per: "á sæti", foot: rideFoot("Jón", star("4,9"), "2 sæti laus") })}
  </div>
  ${tabbar(0, is, 1)}
</div>`;

// ---- Search results.
screens.results = `<div class="phone">
  <div class="body">
    <div class="row">${back}<div class="card grow row" style="padding:10px 16px;border-radius:18px"><div class="grow"><div class="strong">Selfoss to Vík</div><div class="small muted">Any day, 1 seat</div></div><span class="link">Change</span></div></div>
    <div class="row" style="gap:8px"><span class="chip">Earliest${icon("chevron-down", 16)}</span><span class="chip">${icon("sliders-horizontal", 16)}Filters</span><span class="grow"></span><span class="small muted">3 rides</span></div>
    <div class="sect">Saturday 28 November</div>
    ${sample.vik({ day: "Sat 28 Nov" })}
    ${ticket({ day: "Sat 28 Nov", tags: approves, corner: share, from: ["16:40", "N1 Selfoss"], to: ["18:20", "N1 Vík"], duration: "1 h 40 min", price: "1,400 ISK", per: "per seat", foot: rideFoot("Sigga", star("5.0"), "1 seat left") })}
    <div class="sect">Sunday 29 November</div>
    ${ticket({ day: "Sun 29 Nov", tags: approves, corner: share, from: ["08:15", "Olís Selfoss"], to: ["09:50", "N1 Vík"], duration: "1 h 35 min", price: "1,500 ISK", per: "per seat", foot: rideFoot("Anna", newDriver, "3 seats left") })}
    <div class="card row"><span style="flex:none">${sized(drawings.puffin, 58, 60)}</span><div class="grow"><div class="strong">That's every ride found</div><div class="small muted">Try another day, or see every ride leaving soon.</div></div><span class="link">All rides</span></div>
  </div>
</div>`;

// ---- Trip details.
const stop = (time, place, tag = "", faded = false) =>
  `<span class="t" style="${faded ? "color:var(--muted);font-weight:500;font-size:16px" : ""}">${time}</span><span class="dot ${faded ? "" : "end"}" style="${faded ? "border-color:var(--control)" : ""}"></span><span class="row" style="gap:8px"><span class="${faded ? "muted" : "p"} grow">${place}</span>${tag}</span>`;
const pref = (name, colour, label) =>
  `<span class="row" style="gap:6px"><span style="width:26px;height:26px;border-radius:50%;background:${colour};display:flex;align-items:center;justify-content:center;color:#1F2A30">${icon(name, 14)}</span><span class="small">${label}</span></span>`;
screens.trip = `<div class="phone">
  <div class="body">
    <div class="head">${back}<div class="titles"><div class="small muted">Saturday 28 November</div><h1>Selfoss to Vík</h1></div><span class="iconbtn">${icon("share", 20)}</span></div>
    <div class="ticket">
      <div class="when"><span class="cap muted grow">Your part of the ride</span>${instant}</div>
      <div class="top"><div class="route" style="grid-template-columns:auto 16px 1fr auto">
        <span class="t" style="font-size:24px;line-height:30px">10:00</span><span class="dot"></span><span class="p">N1 Selfoss</span><span class="link">Change</span>
        <span></span><span class="rail" style="min-height:26px"></span><span class="dur">1 h 35 min</span><span></span>
        <span class="t" style="font-size:24px;line-height:30px">11:35</span><span class="dot end"></span><span class="p">N1 Vík</span><span class="link">Change</span>
      </div></div>
      <div class="cut"></div>
      <div class="foot"><div class="grow"><div class="strong">Seats</div><div class="small muted">2 free on your part</div></div>${stepper(1)}</div>
    </div>
    <div class="card stack" style="gap:12px">
      <div class="row">${avatar("Jón", "lg")}<div class="grow"><div class="fig sm" style="font-size:19px">Jón</div><div class="row small" style="gap:8px">${star("4.9")}<span class="muted">12 rides</span><span class="tag pos">${icon("check", 12)}Phone</span></div></div>${chev}</div>
      <div class="line"></div>
      <div class="row"><span class="listrow" style="padding:0;min-height:0"><span class="ri">${icon("car", 20)}</span></span><div class="grow"><div class="strong">Blue Kia Ceed</div><div class="small muted">You see the number plate once your seat is confirmed</div></div></div>
      <div class="row" style="flex-wrap:wrap;gap:8px 16px">${pref("message-circle", "#8FCBE6", "Some chat")}${pref("luggage", "#F4C04E", "One suitcase")}${pref("paw-print", "#A99BEB", "Ask about pets")}${pref("cigarette-off", "#F08C9C", "No smoking")}</div>
    </div>
    <div class="card row" style="gap:16px"><span style="flex:none">${sized(drawings.seats, 150, 116)}</span><div class="grow"><div class="strong">Where you sit</div><div class="small muted">2 of 3 seats are free. Seats are not numbered: you agree in the car.</div></div></div>
    <div class="card stack" style="gap:12px">
      <div class="row"><h2 class="grow">The whole route</h2><span class="small muted">82 km</span></div>
      <div style="border-radius:16px;overflow:hidden;line-height:0">${sized(drawings.tripMap, 326, 180, 'preserveAspectRatio="xMidYMid slice"')}</div>
      <div class="route" style="row-gap:10px">${stop("10:00", "N1 Selfoss", `<span class="tag pos">Get in</span>`)}${stop("10:30", "N1 Hella", "", true)}${stop("10:40", "N1 Hvolsvöllur", "", true)}${stop("11:35", "N1 Vík", `<span class="tag pos">Get out</span>`)}</div>
    </div>
    ${rows(row("shield-check", "Free cancellation", "Up to 15 min before"), row("cloud-sun", "Weather and roads"), row("flag", "Report this ride"))}
  </div>
  <div class="bottombar"><div><div class="fig">1,500 ISK</div><div class="small muted">1 seat</div></div><span class="btn primary main">Book</span></div>
</div>`;

// ---- A booking: its title says where it stands, the road shows it.
const steps = ["Asked", "Confirmed", "Trip day", "Done"];
const myTicket = ticket({
  day: "Fri 27 Nov",
  tags: `<span class="tag plain">${icon("ticket", 13)}Passenger</span>`,
  from: ["18:30", "Mjódd bus terminal"],
  to: ["18:40", "Olís Norðlingaholt"],
  duration: "10 min",
  foot: `<span class="strong">1 seat</span><span class="grow"></span><span class="fig sm">100 ISK</span>`,
  mine: true,
});
const driverCard = (plate) => `<div class="card stack" style="gap:12px">
  <div class="row">${avatar("Bára", "lg")}<div class="grow"><div class="fig sm" style="font-size:19px">Bára</div><div class="row small" style="gap:8px">${star("4.8")}<span class="muted">14 rides</span></div></div><span class="btn secondary sm">${icon("message-circle", 18)}Message</span></div>
  <div class="line"></div>
  <div class="row"><span class="listrow" style="padding:0;min-height:0"><span class="ri">${icon("car", 20)}</span></span><span class="grow strong">White Toyota Yaris</span>${plate}</div>
</div>`;
const stand = `<div class="card stack" style="gap:12px">
  <div class="row"><h2 class="grow">Where to stand</h2><span class="link">Open in maps</span></div>
  <div class="row" style="align-items:flex-start"><span style="width:96px;height:72px;border-radius:14px;overflow:hidden;flex:none;line-height:0">${sized(drawings.tripMap, 96, 72, 'preserveAspectRatio="xMidYMid slice"', "282 560 76 57")}</span><div class="grow"><div class="strong">Mjódd bus terminal</div><div class="small muted">By the bus shelter, on the side of the shops.</div></div></div>
</div>`;
screens.booking = `<div class="phone">
  <div class="body">
    ${head("Your seat is confirmed", "Bára said yes. See you on Friday at 18:30.")}
    <div class="card" style="padding:14px 12px 12px">${road(steps, 1)}</div>
    ${myTicket}
    ${driverCard("")}
    ${stand}
    <div class="note">${icon("info", 20)}<span class="small">Pay Bára 100 ISK in cash or by bank transfer when you get in.</span></div>
    ${rows(row("share", "Share trip details"), row("cloud-sun", "Weather and roads"), row("flag", "Report a problem"), row("x", "Cancel booking", "", true))}
  </div>
</div>`;

screens["trip-day"] = `<div class="phone">
  <div class="body">
    ${head("Leaves in 10 minutes", "Today at 18:30 from Mjódd bus terminal.")}
    <div class="card" style="padding:14px 12px 12px">${road(steps, 2)}</div>
    ${stand}
    ${driverCard(`<span class="tag plain" style="color:var(--text);border:2px solid var(--control);background:var(--surface);height:28px;font-size:15px;border-radius:8px">AB 123</span>`)}
    <div class="note">${icon("info", 20)}<span class="small">Pay Bára 100 ISK in cash or by bank transfer when you get in.</span></div>
    ${rows(row("share", "Share trip details"), row("flag", "Report a problem"), row("x", "Cancel booking", "", true))}
  </div>
  <div class="bottombar"><span class="btn primary main">${icon("map-pin", 20)}I'm here</span></div>
</div>`;

// ---- Offer a ride, the last step.
const edit = (label, value) =>
  `<div class="listrow"><div class="grow"><div class="cap muted">${label}</div><div>${value}</div></div><span class="link">Change</span></div>`;
screens["offer-check"] = `<div class="phone">
  <div class="body">
    <div class="row">${back}<div class="grow">${road(["Route", "Time", "Seats", "Price", "Check"], 4)}</div></div>
    <div><h1>Check and publish</h1><p class="muted" style="margin-top:2px">This is how people will see your ride.</p></div>
    ${ticket({ day: "Fri 27 Nov", tags: approves, from: ["18:30", "Mjódd bus terminal"], to: ["20:55", "N1 Vík"], duration: "2 h 25 min, 5 stops", price: "2,900 ISK", per: "whole way", foot: rideFoot("Bára", newDriver, "3 seats") })}
    <div class="card flush">
      ${edit("Route", "Mjódd to Vík, with 5 stops on the way")}
      ${edit("Time", "Friday 27 November, 18:30 to 20:55")}
      ${edit("Price", "2,900 ISK the whole way")}
      ${edit("Seats and booking", "3 seats. You approve each passenger")}
      ${edit("Car", "White Toyota Yaris")}
      ${edit("Preferences and note", "One suitcase, no smoking, some chat. No note")}
    </div>
    <div class="needs">
      <div class="row"><span class="bell">${icon("id-card", 20)}</span><div class="grow"><div class="strong">One thing before your first ride</div><div class="small" style="color:var(--sun-text)">Photo and car are done. Your driving licence is left.</div></div></div>
      <span class="btn secondary sm" style="align-self:flex-end">Confirm your licence</span>
    </div>
    ${rows(row("trash-2", "Delete draft", "", true))}
  </div>
  <div class="bottombar"><span class="btn primary main">Publish ride</span></div>
</div>`;

// ---- The driver's ride.
const seatsStrip = `<div class="card stack" style="gap:10px">
  <div class="row"><h2 class="grow">Seats</h2><span class="link">Each stretch</span></div>
  <div class="row" style="gap:10px"><span class="row" style="gap:4px">${[1, 0, 0].map((taken) => `<span style="width:28px;height:28px;border-radius:9px;${taken ? "background:var(--primary)" : "border:2px dashed var(--control)"}"></span>`).join("")}</span><span class="grow"><span class="strong">1 of 3 taken</span><br><span class="small muted">at the busiest, Mjódd to Selfoss</span></span></div>
</div>`;
const request = `<div class="needs">
  <div class="row">${avatar("Dóra", "lg")}<div class="grow"><div class="fig sm" style="font-size:19px">Dóra</div><div class="row small" style="gap:8px">${star("4.7")}<span style="color:var(--sun-text)">8 rides</span></div></div><span class="cap" style="color:var(--sun-text)">11 h left</span></div>
  <div class="card" style="padding:12px 14px;border-bottom-width:0;border-radius:16px">${route(["18:30", "Mjódd bus terminal"], ["19:20", "N1 Selfoss"], "1 seat, 800 ISK")}<p class="small muted" style="margin-top:8px">“One small bag. I can be there a bit early.”</p></div>
  <div class="small" style="color:var(--sun-text)">If you accept, 2 of 3 seats are taken from Mjódd to Selfoss.</div>
  <div class="row"><span class="btn secondary" style="flex:1">Decline</span><span class="btn primary" style="flex:1">Accept</span></div>
  <span class="link" style="align-self:center;font-weight:600;color:var(--sun-text);text-decoration:underline">Report Dóra</span>
</div>`;
const passenger = (name, part, state) =>
  `<div class="listrow" style="align-items:flex-start"><span style="margin-top:2px">${avatar(name)}</span><div class="grow"><div class="strong">${name}</div><div class="small muted">${part}</div>${state}</div><span class="iconbtn" style="background:var(--bg);border:0;width:40px;height:40px">${icon("message-circle", 18)}</span>${chevDown}</div>`;
const manage = rows(
  row("pencil", "Edit the ride"),
  row("share", "Share this ride"),
  row("repeat", "Post it again"),
  row("undo-2", "Post the way back"),
  row("x", "Cancel the ride", "", true),
);
const driverTicket = ticket({
  day: "Fri 27 Nov",
  tags: `<span class="tag plain">${icon("car", 13)}You drive</span>`,
  corner: share,
  from: ["18:30", "Mjódd bus terminal"],
  to: ["20:55", "N1 Vík"],
  duration: "2 h 25 min, 5 stops",
  foot: `<span class="strong">2,900 ISK</span><span class="muted">the whole way</span><span class="grow"></span><span class="muted">White Toyota Yaris</span>`,
  mine: true,
});
screens["driver-ride"] = `<div class="phone">
  <div class="body">
    ${head("Your ride to Vík", "1 request needs your answer.")}
    ${driverTicket}
    <div class="sect">Needs you</div>
    ${request}
    <div class="sect">Passengers<span class="small muted" style="font-family:Nunito;font-weight:400">1 confirmed</span></div>
    <div class="card flush">${passenger("Gunnar", "Mjódd to Hella, 1 seat, 600 ISK", `<span class="tag pos" style="margin-top:4px">Confirmed</span>`)}${row("messages-square", "Message all passengers")}</div>
    ${seatsStrip}
    <div class="sect">Manage</div>
    ${manage}
  </div>
</div>`;

// ---- My rides.
screens["my-rides"] = `<div class="phone">
  <div class="body">
    <div class="row"><h1 class="grow">My rides</h1><span class="btn secondary sm">${icon("plus", 18)}Offer a ride</span></div>
    <div class="seg"><span class="on">Coming up</span><span>Past</span></div>
    <div class="sect">Needs you</div>
    ${ticket({ day: "Fri 27 Nov", tags: `<span class="tag plain">${icon("car", 13)}You drive</span>`, from: ["18:30", "Mjódd bus terminal"], to: ["20:55", "N1 Vík"], duration: "2 h 25 min, 5 stops", foot: `<span class="tag warn">${icon("bell", 13)}Answer Dóra's request</span><span class="grow"></span><span class="muted">1 of 3 seats taken</span>`, mine: true })}
    <div class="sect">Coming up</div>
    ${ticket({ day: "Sat 28 Nov", tags: `<span class="tag plain">${icon("ticket", 13)}Passenger</span>`, from: ["10:00", "N1 Selfoss"], to: ["11:35", "N1 Vík"], duration: "1 h 35 min", price: "1,500 ISK", per: "1 seat", foot: `${avatar("Jón", "sm")}<span class="who">Jón</span><span class="grow"></span><span class="tag pos">${icon("check", 13)}Seat confirmed</span>`, mine: true })}
    ${ticket({ day: "Wed 2 Dec", tags: `<span class="tag plain">${icon("ticket", 13)}Passenger</span>`, from: ["07:45", "Hof bus stop, Akureyri"], to: ["12:50", "BSÍ bus terminal"], duration: "5 h 5 min", price: "5,800 ISK", per: "1 seat", foot: `${avatar("Anna", "sm")}<span class="who">Anna</span><span class="grow"></span><span class="tag info">Waiting for Anna's answer</span>` })}
  </div>
  ${tabbar(1, en, 1)}
</div>`;

// ---- A conversation.
const bubble = (text, mine, time = "") =>
  `<div style="align-self:${mine ? "flex-end" : "flex-start"};max-width:78%"><div style="background:${mine ? "var(--primary-soft)" : "var(--surface)"};border-radius:18px;padding:10px 14px;${mine ? "" : "border-bottom:2px solid var(--edge)"}">${text}</div>${time === "" ? "" : `<div class="cap muted" style="text-align:${mine ? "right" : "left"};margin-top:4px;font-weight:400">${time}</div>`}</div>`;
screens.chat = `<div class="phone" style="min-height:760px">
  <div style="background:var(--surface);border-bottom:2px solid var(--border);padding:12px 16px 10px" class="stack tight">
    <div class="row">${icon("chevron-left")}${avatar("Bára")}<div class="grow"><div class="fig sm" style="font-size:19px">Bára</div><div class="small muted">Driver, White Toyota Yaris</div></div><span class="iconbtn flat">${icon("ellipsis-vertical", 20)}</span></div>
    <div class="row" style="background:var(--bg);border-radius:14px;padding:8px 12px;gap:8px">${icon("ticket", 18)}<span class="small grow" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span class="strong">Fri 27 Nov, 18:30</span> Mjódd to Norðlingaholt</span>${chev}</div>
  </div>
  <div class="body" style="gap:10px">
    <div class="row small muted" style="gap:8px;align-items:flex-start">${icon("shield-check", 18)}<span>Pay the driver only the price in the app. PuffinRide never asks for card details in a chat.</span></div>
    <div class="cap muted" style="text-align:center">Thursday 26 November</div>
    ${bubble("One small bag.", true)}
    <div class="small muted" style="text-align:center">Your seat is confirmed. You can message each other here.</div>
    ${bubble("Where shall I wait?", true, "03:10, seen")}
    ${bubble("By the bus shelter, on the side of the shops. I drive a white Yaris.", false, "03:12")}
    <span class="grow"></span>
    <div class="row" style="gap:8px;overflow:hidden"><span class="chip">I'm running late</span><span class="chip">I'm at the meeting point</span><span class="chip">On my way</span></div>
  </div>
  <div class="bottombar" style="gap:10px;padding-top:10px"><div class="field grow" style="height:48px;border-radius:24px">Write a message</div><span class="btn primary" style="width:48px;padding:0;border-radius:24px">${icon("send", 20)}</span></div>
</div>`;

// ---- Profile and settings as one place.
screens.account = `<div class="phone">
  <div class="body">
    <h1>Profile</h1>
    <div class="card stack" style="gap:12px">
      <div class="row">${avatar("Bára", "lg")}<div class="grow"><div class="fig sm" style="font-size:19px">Bára</div><div class="small muted">Member since November 2026</div></div><span class="btn secondary sm">Edit</span></div>
      <div class="row" style="gap:8px;flex-wrap:wrap">${star("4.8")}<span class="small muted">14 rides</span><span class="tag pos">${icon("check", 12)}Phone</span><span class="tag pos">${icon("check", 12)}Email</span></div>
      <span class="link">See your profile as others do</span>
    </div>
    <div class="sect">Driving</div>
    ${rows(row("car", "My cars", "Toyota Yaris"), row("id-card", "Driving licence", "Confirmed"))}
    <div class="sect">Account</div>
    ${rows(row("mail", "Email", "bara@example.com"), row("phone", "Phone number", "767 8578", false, false), row("key", "Ways to sign in", "Email, Google"), row("bell", "Notifications"), row("languages", "Language", "English"))}
    <div class="sect">Safety and privacy</div>
    ${rows(row("lock", "Privacy and your data"), row("ban", "Blocked people"), row("flag", "My reports"), row("bell-ring", "Notices"))}
    <div class="sect">Help</div>
    ${rows(row("map-pin", "Meeting points"), row("megaphone", "Send feedback"), row("inbox", "My feedback"), row("info", "About PuffinRide"), row("file-text", "Legal documents"))}
    ${rows(row("log-out", "Sign out"))}
  </div>
  ${tabbar(4, en, 1)}
</div>`;

// ---- Sign in: one question at a time.
const google = `<svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.96 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"/></svg>`;
screens["sign-in"] = `<div class="phone" style="min-height:700px">
  ${sceneTop()}
  <div class="body">
    <div class="row">${back}<div class="grow"><h1>Sign in or join</h1></div></div>
    <div class="ticket"><div class="when"><span class="cap muted grow">You're booking</span><span class="cap muted">Sat 28 Nov</span></div><div class="top">${route(["10:00", "N1 Selfoss"], ["11:35", "N1 Vík"], "1 seat, with Jón")}<div class="price"><div class="fig">1,500 ISK</div></div></div></div>
    <span class="btn secondary wide">${google}Continue with Google</span>
    <div class="row"><span class="line grow"></span><span class="small muted">or</span><span class="line grow"></span></div>
    <div><div class="label">Email</div><div class="field"></div></div>
    <span class="btn primary main" style="flex:none">Continue</span>
    <p class="small muted">We email you a 6-digit code. If you have set a password, you can use it instead on the next screen.</p>
  </div>
</div>`;

// ---- The parts every screen is made of.
screens.parts = `<div class="phone" style="width:760px;border-radius:22px">
  <div class="body" style="gap:20px;padding:24px">
    <div><h2>One ride, one ticket</h2><p class="small muted">The same card wherever a ride shows: Find, results, My rides, a booking, a chat. Below the tear line it says what that place needs.</p></div>
    <div class="row" style="align-items:flex-start;gap:16px"><div class="grow">${sample.vik()}</div><div class="grow">${ticket({ day: "Sat 28 Nov", tags: `<span class="tag plain">${icon("ticket", 13)}Passenger</span>`, from: ["10:00", "N1 Selfoss"], to: ["11:35", "N1 Vík"], duration: "1 h 35 min", price: "1,500 ISK", per: "1 seat", foot: `${avatar("Jón", "sm")}<span class="who">Jón</span><span class="grow"></span><span class="tag pos">${icon("check", 13)}Seat confirmed</span>`, mine: true })}</div></div>
    <div><h2>The road shows where things stand</h2><p class="small muted">A booking, and the steps of offering a ride, are stops on a road. The car stands at the one you are on.</p></div>
    <div class="row" style="gap:16px"><div class="card grow" style="padding:14px 12px 12px">${road(steps, 1)}</div><div class="card grow" style="padding:14px 12px 12px">${road(["Route", "Time", "Seats", "Price", "Check"], 2)}</div></div>
    <div><h2>What needs you comes first, in the car's yellow</h2><p class="small muted">A request to answer, a seat to pay for, a ride that leaves soon. One card, one button.</p></div>
    <div class="needs">
      <div class="row" style="align-items:flex-start"><span class="bell">${icon("bell", 20)}</span><div class="grow"><div class="strong">Dóra asks for 1 seat</div><div class="small" style="color:var(--sun-text)">Mjódd to Selfoss, Fri 27 Nov. 11 h left to answer.</div></div><span class="btn primary sm">See the request</span></div>
    </div>
    <div><h2>One main button, and the rest as tidy rows</h2><p class="small muted">The main thing to do sits at the bottom of the screen. Everything else is a row with an icon; what can't be undone is red and last.</p></div>
    <div class="row" style="align-items:flex-start;gap:16px"><div class="grow">${rows(row("pencil", "Edit the ride"), row("share", "Share this ride"), row("x", "Cancel the ride", "", true))}</div><div class="grow card" style="padding:0;overflow:hidden"><div class="bottombar" style="border-top:0"><div><div class="fig">1,500 ISK</div><div class="small muted">1 seat</div></div><span class="btn primary main">Book</span></div></div></div>
  </div>
</div>`;

// ---- A laptop: Find, signed out.
const how = (n, title, text) =>
  `<div class="row" style="align-items:flex-start"><span class="avatar sm" style="background:var(--primary-soft);color:var(--primary)">${n}</span><div class="grow"><div class="strong">${title}</div><div class="small muted">${text}</div></div></div>`;
screens["laptop-home"] = `<div class="laptop">
  ${topbar(0)}
  <div class="page">
    <div style="position:relative;border-radius:22px;overflow:hidden;line-height:0;height:230px;background:#B7DDB9">${sized(drawings.sceneWide, 1112, 190, 'preserveAspectRatio="none"')}
      <div style="position:absolute;left:40px;top:34px;line-height:24px;width:560px"><h1 style="font-size:40px;line-height:46px">Share your ride</h1><p style="margin-top:6px;font-size:19px;line-height:26px">Carpool across Iceland: find a seat in someone else's car, or offer the empty seats in yours.</p></div>
      <span style="position:absolute;right:120px;top:56px">${car(230)}</span>
    </div>
    <div class="card row" style="margin:-56px 24px 0;position:relative;gap:12px;padding:14px 16px">
      <div class="grow"><div class="cap muted" style="margin-bottom:4px">From</div><div class="row" style="background:var(--bg);border-radius:16px;height:48px;padding:0 16px" class="muted"><span class="muted">Choose a town or meeting point</span></div></div>
      <span class="iconbtn" style="background:var(--bg);border:0;margin-top:22px">${icon("arrow-up-down", 20)}</span>
      <div class="grow"><div class="cap muted" style="margin-bottom:4px">To</div><div class="row" style="background:var(--bg);border-radius:16px;height:48px;padding:0 16px"><span class="muted">Choose a town or meeting point</span></div></div>
      <div><div class="cap muted" style="margin-bottom:4px">Date</div><div class="row" style="background:var(--bg);border-radius:16px;height:48px;padding:0 16px;gap:6px">Any day${icon("chevron-down", 18)}</div></div>
      <div><div class="cap muted" style="margin-bottom:4px">Seats</div><div style="height:48px;display:flex;align-items:center">${stepper(1)}</div></div>
      <span class="btn primary" style="margin-top:22px">Find a ride</span>
    </div>
    <div class="row" style="align-items:flex-start;gap:24px;margin-top:8px">
      <div class="grow stack">
        <div class="sect">Leaving soon<span class="link">See all rides</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">${sample.keflavik()}${sample.akureyri()}${sample.selfoss()}${sample.vik()}</div>
      </div>
      <div class="stack" style="width:400px;flex:none">
        <div class="sect">How it works</div>
        <div class="card stack" style="gap:14px">${how(1, "Find a ride", "Choose where from, where to and the day.")}${how(2, "Book a seat", "At once, or the driver says yes first.")}${how(3, "Meet and go", "Get in at a meeting point, at the time the ride shows.")}<div class="line"></div><div class="row"><div class="grow"><div class="strong">Driving somewhere?</div><div class="small muted">Offer the empty seats in your car.</div></div><span class="btn secondary sm">Offer a ride</span></div></div>
        <div class="card" style="padding:0;overflow:hidden;line-height:0">${sized(drawings.iceland, 400, 288)}</div>
      </div>
    </div>
  </div>
</div>`;

// ---- A laptop: the driver's ride.
screens["laptop-driver-ride"] = `<div class="laptop">
  ${topbar(1)}
  <div class="page">
    ${head("Your ride to Vík", "Friday 27 November. 1 request needs your answer.")}
    <div class="row" style="align-items:flex-start;gap:24px">
      <div class="grow stack">
        <div class="sect">Needs you</div>
        ${request}
        <div class="sect">Passengers<span class="small muted" style="font-family:Nunito;font-weight:400">1 confirmed</span></div>
        <div class="card flush">${passenger("Gunnar", "Mjódd to Hella, 1 seat, 600 ISK", `<span class="tag pos" style="margin-top:4px">Confirmed</span>`)}${row("messages-square", "Message all passengers")}</div>
        <div class="sect">Drive it again</div>
        ${rows(row("repeat", "Post it again"), row("undo-2", "Post the way back"))}
      </div>
      <div class="stack" style="width:400px;flex:none">
        ${driverTicket}
        ${seatsStrip}
        ${rows(row("pencil", "Edit the ride"), row("share", "Share this ride"), row("x", "Cancel the ride", "", true))}
      </div>
    </div>
  </div>
</div>`;

// Each screen again as the first screen of a phone (390 by 844) or a small
// laptop (1280 by 720): what shows before any scrolling, bars in their place.
for (const [name, markup] of Object.entries(screens)) {
  if (name === "parts") continue;
  screens[`${name}--first`] = markup.replace(/class="(phone|laptop)/u, 'class="$1 first');
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${kit.css}
.shot { display: inline-block; margin: 0 24px 24px 0; vertical-align: top; }</style></head><body>${Object.entries(
  screens,
)
  .map(([name, markup]) => `<div class="shot" id="${name}">${markup}</div>`)
  .join("")}</body></html>`;
fs.writeFileSync(path.join(out, "screens.html"), html);

(async () => {
  const { chromium } = require(
    require.resolve("@playwright/test", { paths: [path.join(kit.repo, "apps/mobile")] }),
  );
  const browser = await chromium.launch(
    process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
  );
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 2,
  });
  await page.goto(`file://${path.join(out, "screens.html")}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const only = process.argv[3];
  for (const name of Object.keys(screens)) {
    if (only !== undefined && !only.split(",").includes(name)) continue;
    await page
      .locator(`#${name} > *`)
      .first()
      .screenshot({ path: path.join(out, `${name}.png`), omitBackground: true });
    console.log(name);
  }
  await browser.close();
})();
