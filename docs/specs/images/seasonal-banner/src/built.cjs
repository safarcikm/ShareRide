// Takes Find, as built, on each of spec 36's thirteen days:
//   node built.cjs [website] [out folder]
// The website is the app's web export served on its own, such as
// `EXPO_PUBLIC_API_URL=http://localhost:3001 npx expo export --platform web`
// then `node scripts/serve-web.ts 8082` in apps/mobile (the default
// http://localhost:8082). The API is answered in the page: no rides, signed
// out. Each day comes from `?day=`, on a phone and a laptop, light and dark,
// laid out in one sheet per screen and scheme, saved as WebP.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const site = process.argv[2] ?? "http://localhost:8082";
const out = path.resolve(process.argv[3] ?? path.join(__dirname, ".."));
const api = "http://localhost:3001";

// A date in 2027 for each day, as packages/domain's bannerFor gives them.
const days = {
  christmas: "2027-12-24",
  newyear: "2027-12-31",
  easter: "2027-03-28",
  summerday: "2027-04-22",
  june17: "2027-06-17",
  longweekend: "2027-07-30",
  winterday: "2027-10-23",
  dec1: "2027-12-01",
  bondadagur: "2027-01-22",
  konudagur: "2027-02-21",
  bolludagur: "2027-02-08",
  oskudagur: "2027-02-10",
  seafarers: "2027-06-06",
};
const screens = {
  phone: { viewport: { width: 390, height: 844 }, height: 420, cols: 5, scale: 1 },
  laptop: { viewport: { width: 1280, height: 900 }, height: 420, cols: 2, scale: 0.75 },
};
const config = {
  beta: false,
  paused: [],
  maxSeats: 8,
  freeCancellationMinutes: 15,
  maxMoveMinutes: 120,
  reliabilityMonths: 12,
  signInProviders: [],
  emailSignIn: true,
  festiveDays: true,
};
const answers = {
  "/v1/config": config,
  "/v1/trips/soonest": { results: [] },
  "/v1/meeting-points": { meetingPoints: [] },
};

/** The API, answered in the page: the settings, no rides, and nobody signed in. */
async function answerApi(tab) {
  await tab.route(`${api}/**`, (route) => {
    const request = route.request();
    const headers = {
      "access-control-allow-origin": new URL(site).origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": request.headers()["access-control-request-headers"] ?? "*",
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const answer = answers[new URL(request.url()).pathname];
    return answer === undefined
      ? route.fulfill({ status: 401, headers, json: { error: "unauthorized" } })
      : route.fulfill({ status: 200, headers, json: answer });
  });
}

(async () => {
  const browser = await chromium.launch();
  for (const [device, screen] of Object.entries(screens)) {
    for (const scheme of ["light", "dark"]) {
      const shots = [];
      for (const [day, date] of Object.entries(days)) {
        const tab = await browser.newPage({ viewport: screen.viewport, colorScheme: scheme });
        await answerApi(tab);
        await tab.goto(`${site}/?day=${date}`);
        // Once the car has arrived and every moment is over.
        await tab.waitForTimeout(4500);
        const { width } = screen.viewport;
        const png = await tab.screenshot({ clip: { x: 0, y: 0, width, height: screen.height } });
        shots.push({ day, b64: png.toString("base64") });
        await tab.close();
      }
      const tab = await browser.newPage({ colorScheme: scheme });
      const webp = await tab.evaluate(
        async ({ list, cols, scale, dark }) => {
          const gap = 16,
            pad = 20,
            label = 28;
          const images = await Promise.all(
            list.map(async (shot) => {
              const img = new Image();
              img.src = `data:image/png;base64,${shot.b64}`;
              await img.decode();
              return img;
            }),
          );
          const w = images[0].width * scale,
            h = images[0].height * scale;
          const rows = Math.ceil(images.length / cols);
          const canvas = document.createElement("canvas");
          canvas.width = pad * 2 + cols * w + (cols - 1) * gap;
          canvas.height = pad * 2 + rows * (label + h) + (rows - 1) * gap;
          const g = canvas.getContext("2d");
          g.fillStyle = dark ? "#101418" : "#ffffff";
          g.fillRect(0, 0, canvas.width, canvas.height);
          images.forEach((img, i) => {
            const x = pad + (i % cols) * (w + gap),
              y = pad + Math.floor(i / cols) * (label + h + gap);
            g.fillStyle = dark ? "#e8eef0" : "#1c2a2e";
            g.font = "600 17px sans-serif";
            g.fillText(list[i].day, x, y + 18);
            g.drawImage(img, x, y + label, w, h);
          });
          return canvas.toDataURL("image/webp", 0.9).split(",")[1];
        },
        { list: shots, cols: screen.cols, scale: screen.scale, dark: scheme === "dark" },
      );
      const file = `4-built-${device}-${scheme}.webp`;
      fs.writeFileSync(path.join(out, file), Buffer.from(webp, "base64"));
      console.log(file);
      await tab.close();
    }
  }
  await browser.close();
})();
