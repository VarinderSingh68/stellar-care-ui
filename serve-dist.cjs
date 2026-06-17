const http = require("http");
const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "dist");
const host = "127.0.0.1";
const port = 8080;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Server error");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(rootDir, safePath);

  if (urlPath === "/") {
    filePath = path.join(rootDir, "index.html");
  }

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isDirectory()) {
      return sendFile(res, path.join(filePath, "index.html"));
    }

    if (!error && stats.isFile()) {
      return sendFile(res, filePath);
    }

    return sendFile(res, path.join(rootDir, "index.html"));
  });
});

server.listen(port, host, () => {
  console.log(`Static frontend running at http://${host}:${port}`);
});
