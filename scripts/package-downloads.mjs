import fs from "node:fs";
const html = fs.readFileSync("dist/our-korea.html");
fs.mkdirSync("downloads", { recursive: true });
fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync("downloads/index.html", html);
fs.writeFileSync("docs/index.html", html);
fs.writeFileSync("docs/.nojekyll", "");
console.log(
  "Updated standalone downloads and branch-based /docs GitHub Pages app",
);
