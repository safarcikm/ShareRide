// The parts the redesign's drawings are made of: the app's own colours,
// fonts, icons and drawings, and the new parts the redesign proposes (the
// ride ticket, the road with the car, the "needs you" card, action rows).
// Used by build.cjs. Drawings only: nothing here ships in the app.
const fs = require("node:fs");
const path = require("node:path");

const here = __dirname;
const repo = process.env.REPO ?? path.resolve(here, "../../../../../..");
const mobile = path.join(repo, "apps/mobile");
const asset = (name) => fs.readFileSync(path.join(here, "assets", name), "utf8");

/** A font file of the app, as a data URL. */
function font(pkg, face) {
  const file = path.join(
    mobile,
    "node_modules/@expo-google-fonts",
    pkg,
    face.split("_")[1],
    `${face}.ttf`,
  );
  return `data:font/ttf;base64,${fs.readFileSync(file).toString("base64")}`;
}

/** A Lucide icon, as the app draws it: 2.4 stroke, the text's colour. */
function icon(name, size = 22, extra = "") {
  const file = path.join(mobile, "node_modules/lucide-react-native/dist/esm/icons", `${name}.mjs`);
  const source = fs.readFileSync(file, "utf8");
  // An icon with a second name only points at the first one.
  const first = /export \{ default \} from '\.\/(.+)\.mjs'/u.exec(source);
  if (first !== null) return icon(first[1], size, extra);
  const data = /const __iconData = (\{[\s\S]*?\n\});/u.exec(source);
  if (data === null) throw new Error(`No icon ${name}`);
  const parts = Function(`return ${data[1]}`)().node;
  const inner = parts
    .map(([tag, attrs]) => {
      const text = Object.entries(attrs)
        .filter(([key]) => key !== "key")
        .map(([key, value]) => `${key}="${value}"`)
        .join(" ");
      return `<${tag} ${text}/>`;
    })
    .join("");
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</svg>`;
}

const drawings = {
  scene: asset("front-phone-0-390x189.svg"),
  sceneDark: asset("dark-front-0-390x189.svg"),
  sceneWide: asset("front-laptop-1-1144x163.svg"),
  car: asset("front-phone-2-170x97.svg"),
  puffin: asset("myrides-phone-0-115x120.svg"),
  seats: asset("trip-18-325x252.svg"),
  tripMap: asset("trip-19-354x272.svg"),
  iceland: asset("front-laptop-12-396x285.svg"),
  logo: fs
    .readFileSync(path.join(mobile, "assets/logo/icon.svg"), "utf8")
    .replace(/<title>.*?<\/title>/u, "")
    .replace('width="1024" height="1024"', ""),
};

/**
 * A drawing at another size. A drawing with no viewBox gets its own size as
 * one; `box` shows only that part of the drawing instead.
 */
function sized(svg, width, height, more = "", box) {
  return svg.replace(/^<svg[^>]*?>/u, (open) => {
    const own = (name) => new RegExp(`\\s${name}="([^"]+)"`, "u").exec(open)?.[1];
    const [w, h, viewBox] = [own("width"), own("height"), own("viewBox")];
    const numbers = w !== undefined && h !== undefined && !w.includes("%");
    const shown = box ?? viewBox ?? (numbers ? `0 0 ${w} ${h}` : undefined);
    const rest = open.replace(/\s(width|height|viewBox)="[^"]+"/gu, "").replace(/>$/u, "");
    return `${rest} width="${width}" height="${height}"${shown === undefined ? "" : ` viewBox="${shown}"`} ${more}>`;
  });
}

/** The puffins' car, `width` wide. Each copy gets its own clip ids. */
let cars = 0;
function car(width) {
  cars += 1;
  const svg = drawings.car
    .replace(/id="([^"]+)"/gu, `id="$1-${cars}"`)
    .replace(/url\(#([^)]+)\)/gu, `url(#$1-${cars})`);
  return sized(svg, width, Math.round((width * 97) / 170));
}

const css = `
@font-face { font-family: Fredoka; font-weight: 600; src: url(${font("fredoka", "Fredoka_600SemiBold")}); }
@font-face { font-family: Fredoka; font-weight: 500; src: url(${font("fredoka", "Fredoka_500Medium")}); }
@font-face { font-family: Nunito; font-weight: 400; src: url(${font("nunito", "Nunito_400Regular")}); }
@font-face { font-family: Nunito; font-weight: 600; src: url(${font("nunito", "Nunito_600SemiBold")}); }
@font-face { font-family: Nunito; font-weight: 700; src: url(${font("nunito", "Nunito_700Bold")}); }
:root, .light {
  --bg: #EEF3F4; --surface: #FFFFFF; --text: #1F2A30; --muted: #56636B;
  --primary: #2F6B4F; --on-primary: #FFFFFF; --primary-edge: #1F4A36; --primary-soft: #E2EFE7;
  --border: #DCE5E8; --control: #7F8C93; --edge: #D2DDE1;
  --sun: #F4C04E; --sun-soft: #FFF3DC; --sun-text: #8A4B00;
  --info: #1F5F8B; --info-soft: #E1EDF6; --error: #B3261E; --error-soft: #FCE8E6;
  --sky: #D7E9F0; --road: #C6CED2; --road-line: #FFFFFF; --star: #B97F0F;
  --glacier: #8FCBE6; --lupine: #A99BEB; --crowberry: #F08C9C; --moss-light: #9ED0A0;
}
.dark {
  --bg: #121A1E; --surface: #1B252B; --text: #ECF2F4; --muted: #A6B4BB;
  --primary: #7CC49E; --on-primary: #0C2117; --primary-edge: #4E8E6C; --primary-soft: #203A2D;
  --border: #2C3940; --control: #6E7D85; --edge: #0B1013;
  --sun: #F4C04E; --sun-soft: #2E2614; --sun-text: #F2C46B;
  --info: #8FCBE6; --info-soft: #16303F; --error: #FFB4AB; --error-soft: #3B1A17;
  --sky: #142630; --road: #3E525C; --road-line: #6E7D85; --star: #E9B44C;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #3A3C47; font-family: Nunito, sans-serif; font-size: 17px; line-height: 24px; color: var(--text); padding: 24px; }
.ic { flex: none; display: block; }
h1, h2, h3, .fig, .btn { font-family: Fredoka, sans-serif; font-weight: 600; word-spacing: 0.06em; font-kerning: none; }
h1 { font-size: 28px; line-height: 34px; }
h2 { font-size: 19px; line-height: 24px; }
.small { font-size: 15px; line-height: 20px; }
.cap { font-size: 13px; line-height: 18px; font-weight: 700; }
.muted { color: var(--muted); }
.strong { font-weight: 700; }
.fig { font-size: 22px; line-height: 28px; }
.fig.sm { font-size: 17px; line-height: 22px; font-weight: 600; }
.row { display: flex; align-items: center; gap: 12px; }
.grow { flex: 1; min-width: 0; }
.stack { display: flex; flex-direction: column; gap: 16px; }
.stack.tight { gap: 8px; }

/* A phone, 390 wide, and a laptop window, 1280 wide. */
.phone { width: 390px; background: var(--bg); color: var(--text); border-radius: 30px; overflow: hidden; position: relative; display: flex; flex-direction: column; }
.phone .body { padding: 16px; display: flex; flex-direction: column; gap: 16px; flex: 1; }
.laptop { width: 1280px; background: var(--bg); color: var(--text); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
.phone.first { height: 844px; }
.phone.first > .body { flex: 1 1 0; min-height: 0; overflow: hidden; }
.laptop.first { height: 720px; }
.laptop.first > .page { flex: 1 1 0; min-height: 0; overflow: hidden; }
/* What is under the first screen is cut off, never squeezed into it. */
.first > .body > *, .first > .page > * { flex-shrink: 0; }
.laptop .page { width: 1144px; margin: 0 auto; padding: 24px 16px 32px; display: flex; flex-direction: column; gap: 16px; }

/* Bars. */
.tabbar { background: var(--surface); border-top: 2px solid var(--border); display: flex; padding: 6px 4px 10px; }
.tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; color: var(--muted); font-size: 13px; line-height: 18px; font-weight: 700; position: relative; }
.tab .pill { width: 56px; height: 32px; border-radius: 999px; display: flex; align-items: center; justify-content: center; }
.tab.on { color: var(--primary); }
.tab.on .pill { background: var(--primary-soft); }
.badge { position: absolute; top: -2px; left: calc(50% + 6px); min-width: 20px; height: 20px; padding: 0 5px; border-radius: 999px; background: var(--primary); color: var(--on-primary); font-size: 12px; line-height: 16px; font-weight: 700; border: 2px solid var(--surface); text-align: center; }
.bottombar { background: var(--surface); border-top: 2px solid var(--border); padding: 12px 16px 16px; display: flex; align-items: center; gap: 16px; }
.topbar { background: var(--surface); border-bottom: 2px solid var(--border); }
.topbar .in { width: 1144px; margin: 0 auto; padding: 10px 16px; display: flex; align-items: center; gap: 28px; font-size: 15px; font-weight: 700; }
.topbar .name { font-family: Fredoka; font-weight: 600; font-size: 19px; }
.topbar .on { color: var(--primary); text-decoration: underline; text-underline-offset: 6px; text-decoration-thickness: 2px; }

/* Buttons. */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 48px; padding: 0 24px; border-radius: 16px; font-size: 18px; line-height: 22px; white-space: nowrap; }
.btn.primary { background: var(--primary); color: var(--on-primary); border-bottom: 4px solid var(--primary-edge); }
.btn.secondary { background: var(--surface); color: var(--text); border: 2px solid var(--control); border-bottom: 3px solid var(--control); box-shadow: 0 3px 0 var(--edge); }
.btn.main { height: 56px; font-size: 19px; flex: 1; }
.btn.sm { height: 40px; padding: 0 16px; font-size: 16px; border-radius: 14px; }
.btn.wide { width: 100%; }
.iconbtn { width: 44px; height: 44px; border-radius: 999px; background: var(--surface); border-bottom: 3px solid var(--edge); display: flex; align-items: center; justify-content: center; flex: none; }
.iconbtn.flat { background: transparent; border: 0; color: var(--muted); }
.link { color: var(--primary); font-weight: 700; font-size: 15px; }

/* Cards and rows. */
.card { background: var(--surface); border-radius: 22px; border-bottom: 3px solid var(--edge); padding: 16px; }
.card.flush { padding: 0; overflow: hidden; }
.line { height: 2px; background: var(--border); border-radius: 2px; }
.listrow { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 16px; }
.listrow + .listrow { border-top: 2px solid var(--border); }
.listrow .ri { width: 36px; height: 36px; border-radius: 12px; background: var(--bg); display: flex; align-items: center; justify-content: center; color: var(--text); flex: none; }
.listrow .val { color: var(--muted); font-size: 15px; }
.listrow.danger { color: var(--error); }
.listrow.danger .ri { background: var(--error-soft); color: var(--error); }
.chev { color: var(--muted); }
.sect { font-family: Fredoka; font-weight: 600; font-size: 19px; line-height: 24px; display: flex; align-items: baseline; justify-content: space-between; margin-top: 4px; }

/* Tags and chips. */
.tag { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; border-radius: 12px; font-size: 13px; line-height: 18px; font-weight: 700; white-space: nowrap; }
.tag.pos { background: var(--primary-soft); color: var(--primary); }
.tag.warn { background: var(--sun-soft); color: var(--sun-text); }
.tag.info { background: var(--info-soft); color: var(--info); }
.tag.plain { background: var(--bg); color: var(--muted); }
.chip { display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 14px; border-radius: 999px; background: var(--surface); border: 2px solid var(--control); font-size: 15px; font-weight: 700; white-space: nowrap; }
.chip.on { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
.seg { display: flex; background: var(--border); border-radius: 14px; padding: 4px; gap: 4px; }
.seg span { flex: 1; text-align: center; height: 36px; line-height: 36px; border-radius: 11px; font-size: 15px; font-weight: 700; color: var(--muted); }
.seg .on { background: var(--surface); color: var(--text); box-shadow: 0 2px 0 var(--edge); }
.avatar { width: 40px; height: 40px; border-radius: 999px; display: flex; align-items: center; justify-content: center; font-family: Fredoka; font-weight: 600; font-size: 17px; color: #1F2A30; flex: none; }
.avatar.lg { width: 56px; height: 56px; font-size: 22px; }
.avatar.sm { width: 28px; height: 28px; font-size: 13px; }

/* The page head: back, the title at the left, one more button. */
.head { display: flex; align-items: flex-start; gap: 12px; }
.head .titles { flex: 1; min-width: 0; padding-top: 5px; }

/* The ride ticket. */
.ticket { background: var(--surface); border-radius: 22px; border-bottom: 3px solid var(--edge); position: relative; display: flex; flex-direction: column; }
.ticket .top { flex: 1; }
.ticket.mine { border-bottom-color: var(--primary); }
.ticket .top { padding: 14px 16px 12px; display: flex; gap: 12px; }
.ticket .when { display: flex; align-items: center; gap: 8px; padding: 12px 16px 0; min-height: 40px; }
.ticket .when + .top { padding-top: 8px; }
.route { display: grid; grid-template-columns: auto 16px 1fr; column-gap: 10px; row-gap: 0; align-items: start; flex: 1; min-width: 0; }
.route .t { font-family: Fredoka; font-weight: 600; font-size: 19px; line-height: 26px; font-variant-numeric: tabular-nums; }
.route .p { font-weight: 700; line-height: 26px; }
.route .dot { width: 12px; height: 12px; border-radius: 50%; border: 3px solid var(--primary); background: var(--surface); justify-self: center; margin-top: 7px; }
.route .dot.end { background: var(--primary); }
.route .rail { width: 3px; align-self: stretch; min-height: 22px; background: var(--primary); justify-self: center; border-radius: 2px; margin: -5px 0 -7px; }
.route .dur { font-size: 14px; line-height: 20px; color: var(--muted); padding: 1px 0 3px; }
.price { text-align: right; flex: none; }
.cut { position: relative; height: 2px; margin: 0 14px; background-image: linear-gradient(to right, var(--border) 60%, transparent 0); background-size: 10px 2px; }
.cut::before, .cut::after { content: ""; position: absolute; top: -8px; width: 16px; height: 16px; border-radius: 50%; background: var(--bg); }
.cut::before { left: -22px; } .cut::after { right: -22px; }
.ticket .foot { padding: 10px 16px 11px; display: flex; align-items: center; gap: 10px; font-size: 15px; line-height: 20px; }
.ticket .foot .who { font-weight: 700; }
.star { color: var(--star); display: inline-flex; align-items: center; gap: 3px; font-weight: 700; }
.star .ic { fill: currentColor; }

/* What needs you. */
.needs { background: var(--sun-soft); border-radius: 22px; border-bottom: 3px solid var(--sun); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.needs .bell { width: 36px; height: 36px; border-radius: 12px; background: var(--sun); color: #1F2A30; display: flex; align-items: center; justify-content: center; flex: none; }

/* The road: where a ride or a draft stands, with the car at the step it is on. */
.roadwrap { padding: 2px 0 0; }
.road { position: relative; height: 44px; margin: 0 30px; }
.road .lane { position: absolute; left: -30px; right: -30px; bottom: 0; height: 12px; border-radius: 6px; background: var(--road); }
.road .lane::after { content: ""; position: absolute; left: 8px; right: 8px; top: 5px; height: 2px; background-image: linear-gradient(to right, var(--road-line) 55%, transparent 0); background-size: 14px 2px; }
.road .gone { position: absolute; left: -30px; bottom: 0; height: 12px; border-radius: 6px; background: var(--primary); }
.road .at { position: absolute; bottom: 4px; transform: translateX(-50%); line-height: 0; }
.road .mark { position: absolute; bottom: 1px; width: 10px; height: 10px; border-radius: 50%; transform: translateX(-50%); background: var(--surface); border: 2px solid var(--control); }
.road .mark.done { border-color: var(--surface); background: var(--surface); }
.roadnames { position: relative; height: 18px; margin: 6px 30px 0; }
.roadnames span { position: absolute; top: 0; transform: translateX(-50%); white-space: nowrap; font-size: 13px; line-height: 18px; font-weight: 700; color: var(--muted); }
.roadnames span:first-child { transform: none; left: -30px !important; }
.roadnames span:last-child { transform: none; left: auto !important; right: -30px; }
.roadnames .now { color: var(--text); }

/* A field. */
.field { height: 52px; border-radius: 16px; border: 2px solid var(--control); background: var(--surface); display: flex; align-items: center; padding: 0 16px; color: var(--muted); }
.label { font-size: 15px; line-height: 20px; font-weight: 700; margin-bottom: 6px; }
.note { background: var(--info-soft); border-radius: 16px; padding: 12px 14px; display: flex; gap: 10px; align-items: flex-start; }
.note .ic { color: var(--info); margin-top: 1px; }

/* The scene at a screen's top. */
.scene { position: relative; line-height: 0; }
.scene .over { position: absolute; left: 16px; right: 16px; top: 14px; display: flex; align-items: center; gap: 10px; line-height: 24px; }
.scene .name { font-family: Fredoka; font-weight: 600; font-size: 20px; color: var(--text); }
.scene .car { position: absolute; left: 50%; transform: translateX(-50%); bottom: 6px; }
`;

/** The road with the car at step `at` (from 0) of `names`. */
function road(names, at) {
  const last = names.length - 1;
  const spot = (index) => `${(index / last) * 100}%`;
  const marks = names
    .map((_, index) =>
      index === at
        ? ""
        : `<span class="mark ${index < at ? "done" : ""}" style="left:${spot(index)}"></span>`,
    )
    .join("");
  const gone = at === 0 ? "" : `<span class="gone" style="width:calc(${spot(at)} + 30px)"></span>`;
  const labels = names
    .map(
      (name, index) =>
        `<span class="${index === at ? "now" : ""}" style="left:${spot(index)}">${name}</span>`,
    )
    .join("");
  return `<div class="roadwrap"><div class="road"><span class="lane"></span>${gone}${marks}<span class="at" style="left:${spot(at)}">${car(60)}</span></div><div class="roadnames">${labels}</div></div>`;
}

const colours = {
  J: "#A99BEB",
  A: "#9ED0A0",
  S: "#8FCBE6",
  B: "#8FCBE6",
  D: "#F08C9C",
  G: "#F4C04E",
  K: "#9ED0A0",
};
const avatar = (name, size = "") =>
  `<span class="avatar ${size}" style="background:${colours[name[0]] ?? "#EADFCB"}">${name[0]}</span>`;

/** From and to, as a timetable: time, the line, the place. */
function route(from, to, duration = "") {
  return `<div class="route">
    <span class="t">${from[0]}</span><span class="dot"></span><span class="p">${from[1]}</span>
    <span></span><span class="rail"></span><span class="dur">${duration}</span>
    <span class="t">${to[0]}</span><span class="dot end"></span><span class="p">${to[1]}</span>
  </div>`;
}

/**
 * The ride ticket: the day, the stretch as a timetable and the price, then
 * a tear line and whatever this place needs to say under it.
 */
function ticket({
  day,
  tags = "",
  from,
  to,
  duration,
  price,
  per,
  foot,
  mine = false,
  corner = "",
}) {
  const cost =
    price === undefined
      ? ""
      : `<div class="price"><div class="fig">${price}</div><div class="small muted">${per ?? ""}</div></div>`;
  return `<div class="ticket ${mine ? "mine" : ""}">
    <div class="when"><span class="cap muted grow">${day}</span>${tags}${corner}</div>
    <div class="top">${route(from, to, duration)}${cost}</div>
    ${foot === undefined ? "" : `<div class="cut"></div><div class="foot">${foot}</div>`}
  </div>`;
}

function tabbar(on, t, unread = 0) {
  const tabs = [
    ["search", t.find],
    ["ticket", t.rides],
    ["car", t.offer],
    ["message-circle", t.messages],
    ["circle-user", t.profile],
  ];
  return `<div class="tabbar">${tabs
    .map(
      ([name, label], index) =>
        `<div class="tab ${index === on ? "on" : ""}"><span class="pill">${icon(name)}</span>${label}${index === 3 && unread > 0 ? `<span class="badge">${unread}</span>` : ""}</div>`,
    )
    .join("")}</div>`;
}

const en = {
  find: "Find",
  rides: "My rides",
  offer: "Offer",
  messages: "Messages",
  profile: "Profile",
};
const is = {
  find: "Leita",
  rides: "Ferðir",
  offer: "Bjóða",
  messages: "Skilaboð",
  profile: "Prófíll",
};

function topbar(on) {
  const names = ["Find", "My rides", "Offer", "Messages", "Profile"];
  return `<div class="topbar"><div class="in"><span style="width:36px;height:36px;border-radius:9px;overflow:hidden;display:block">${sized(drawings.logo, 36, 36)}</span><span class="name grow">PuffinRide</span>${names
    .map((name, index) => `<span class="${index === on ? "on" : ""}">${name}</span>`)
    .join("")}<span style="color:var(--primary)">Íslenska</span></div></div>`;
}

const logo = (size) =>
  `<span style="width:${size}px;height:${size}px;border-radius:${Math.round(size / 4)}px;overflow:hidden;display:block;flex:none">${sized(drawings.logo, size, size)}</span>`;

module.exports = {
  repo,
  css,
  icon,
  drawings,
  sized,
  car,
  road,
  avatar,
  route,
  ticket,
  tabbar,
  topbar,
  logo,
  en,
  is,
};
