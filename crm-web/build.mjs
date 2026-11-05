// Construye la versión web del CRM: crm-web/dist/crm/index.html (+ config.js la primera vez).
// Uso: node crm-web/build.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const shared = path.join(dir, "..", "crm", "src");
const read = (f) => fs.readFileSync(f, "utf8");

// JS: los trozos compartidos con la versión de claude.ai más los propios de la web, por orden alfabético.
const trozos = [
  ...fs.readdirSync(path.join(shared, "js")).filter((f) => f.endsWith(".js")).map((f) => [f, path.join(shared, "js", f)]),
  ...fs.readdirSync(path.join(dir, "src/js")).filter((f) => f.endsWith(".js")).map((f) => [f, path.join(dir, "src/js", f)]),
].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
let js = trozos.map((t) => read(t[1])).join("\n");

// Los identificadores de las hojas de Google no viajan a la web: el servidor los conoce por su clave (c1, c2).
js = js.replace(/\{camp:(\d),id:"[^"]+"/g, (m, c) => `{camp:${c},id:"c${c}"`);

const css = [
  path.join(shared, "styles.css"),
  path.join(shared, "styles-techpack.css"),
  path.join(shared, "styles-responsable.css"),
  path.join(dir, "src/styles-web.css"),
].map(read).join("\n");

const out = read(path.join(dir, "src/index.template.html"))
  .replace("/*@@CSS@@*/", () => css)
  .replace("/*@@ADAPTER@@*/", () => read(path.join(dir, "src/adapter.js")))
  .replace("/*@@JS@@*/", () => js);

const dest = path.join(dir, "dist", "crm");
fs.mkdirSync(dest, { recursive: true });
fs.writeFileSync(path.join(dest, "index.html"), out);
const cfg = path.join(dest, "config.js");
if (!fs.existsSync(cfg)) fs.copyFileSync(path.join(dir, "config.example.js"), cfg);
console.log("Generado:", path.join(dest, "index.html"), `(${out.length} caracteres)`);
console.log("Configura:", cfg);
