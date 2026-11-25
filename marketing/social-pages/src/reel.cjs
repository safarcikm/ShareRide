// node reel.cjs <reel.html> <out.mp4> [cover.png]
// Plays the reel's CSS animations frame by frame (30 a second, 15 seconds), screenshots each frame and
// hands them to ffmpeg: H.264, yuv420p, with a silent sound track, as Instagram and Facebook take it.
// The cover is the frame at 14 seconds (the end card).
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");

const FPS = 30;
const SECONDS = 15;
const COVER_AT = 14;

(async () => {
  const [, , html, out, cover] = process.argv;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto("file://" + path.resolve(html));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
  const seek = (ms) =>
    page.evaluate((t) => {
      for (const a of document.getAnimations()) a.currentTime = t;
    }, ms);

  const ffmpeg = spawn(
    "ffmpeg",
    [
      ["-y", "-loglevel", "error"],
      ["-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-"],
      ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"],
      [
        "-c:v",
        "libx264",
        "-profile:v",
        "high",
        "-preset",
        "slow",
        "-crf",
        "16",
        "-pix_fmt",
        "yuv420p",
      ],
      [
        "-r",
        String(FPS),
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-shortest",
        "-movflags",
        "+faststart",
        out,
      ],
    ].flat(),
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const done = new Promise((resolve, reject) =>
    ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg " + code)))),
  );

  const board = page.locator("#board");
  for (let i = 0; i < FPS * SECONDS; i++) {
    await seek((i * 1000) / FPS);
    const png = await board.screenshot({ type: "png" });
    if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
  }
  ffmpeg.stdin.end();
  await done;
  if (cover) {
    await seek(COVER_AT * 1000);
    await board.screenshot({ path: cover });
  }
  await browser.close();
  console.log("reel", out);
})();
