// Serves a web build of the app from the folder the link `current` names,
// read again at every request, so the pictures script can switch between
// builds of the looks on the same address and keep its signed-in people.
//   node serve-looks.cjs <folder holding the link "current"> [port]
const { createReadStream, statSync, realpathSync } = require("node:fs");
const { createServer } = require("node:http");
const { extname, join, normalize, sep } = require("node:path");

const home = process.argv[2];
const port = Number(process.argv[3] ?? "8082");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};
const isFile = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};
createServer((request, response) => {
  const root = realpathSync(join(home, "current"));
  const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname));
  let file = join(root, path);
  if (!file.startsWith(root + sep) || !isFile(file)) file = join(root, "index.html");
  response.writeHead(200, {
    "Content-Type": types[extname(file)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1");
