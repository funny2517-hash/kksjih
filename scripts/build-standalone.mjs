import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const jsFile = html.match(/src="([^"]+\.js)"/)[1];
let js = fs.readFileSync(path.join(root, jsFile), "utf8");
for (const filename of ["hierarchy.geojson", "rest-areas.json"]) {
  const needle = `fetch("/data/${filename}")`;
  if (!js.includes(needle)) throw Error(`Missing data fetch: ${filename}`);
  const data = JSON.parse(
    fs.readFileSync(path.join(root, "data", filename), "utf8"),
  );
  js = js.replace(
    needle,
    () =>
      `Promise.resolve(new Response(JSON.stringify(${JSON.stringify(data)})))`,
  );
}
html = html.replace(
  /<script[^>]+src="[^"]+"[^>]*><\/script>/,
  () =>
    '<script type="module">' +
    js.replaceAll("</script", "<\\/script") +
    "</script>",
);
html = html.replace(
  /<link[^>]+href="([^"]+\.css)"[^>]*>/,
  (_, file) =>
    "<style>" + fs.readFileSync(path.join(root, file), "utf8") + "</style>",
);
fs.writeFileSync(path.join(root, "our-korea.html"), html);
console.log("Standalone app: dist/our-korea.html");
