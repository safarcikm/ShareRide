// Serves the exported web app (dist) for the browser tests. Paths that are
// not files get index.html, so a reload on /profile opens the app there; a
// web host for ShareRide needs the same fallback ("single" web output).
//   node scripts/serve-web.ts [port]
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..", "dist");
const port = Number(process.argv[2] ?? "8082");
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

createServer((request, response) => {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const wanted = normalize(join(root, pathname));
  const inside = wanted === root || wanted.startsWith(root + sep);
  const file = inside && isFile(wanted) ? wanted : join(root, "index.html");
  response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
  // Only this computer can reach it.
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`Serving ${root} on http://localhost:${String(port)}\n`);
});
