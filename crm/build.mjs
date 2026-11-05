// Une src/ en el index.html que se publica como Artifact.
// Uso: node crm/build.mjs   (genera crm/index.html)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
const jsFiles = fs.readdirSync(path.join(dir, "src/js")).filter((f) => f.endsWith(".js")).sort();
const js = jsFiles.map((f) => read("src/js/" + f)).join("\n");
const css = ["src/styles.css", "src/styles-techpack.css", "src/styles-responsable.css"].map(read).join("\n");
const out = read("src/index.template.html").replace("/*@@CSS@@*/", () => css).replace("/*@@JS@@*/", () => js);
fs.writeFileSync(path.join(dir, "index.html"), out);
console.log("index.html generado:", out.length, "caracteres");
