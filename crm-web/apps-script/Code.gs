/**
 * CRM TexLink: servidor gratuito en Google Apps Script.
 *
 * - Los clientes se guardan en una hoja de Google que crea el propio script («CRM TexLink (datos)»).
 * - Los tech packs se guardan en Google Drive, en la carpeta «CRM TexLink - Tech packs».
 * - El acceso es con usuario y contraseña. Las contraseñas se guardan cifradas.
 *
 * Instrucciones paso a paso: crm-web/LEEME.md
 */

// ===== 1. CONFIGURA ESTO ANTES DE EJECUTAR instalar() =====
// Un usuario por persona. rol "editor" puede cambiar datos y subir archivos; "lector" solo mira.
// Las claves deben tener al menos 8 caracteres. Cuando termines, BORRA las claves de aquí.
const USUARIOS = {
  // "lucas":  { clave: "escribe-una-clave-larga", rol: "editor" },
  // "marcos": { clave: "escribe-otra-clave-larga", rol: "editor" },
};

// Hojas de Google que el CRM puede leer (el ID es lo que va entre /d/ y /edit en la dirección de la hoja).
const HOJAS_ORIGEN = {
  c2: { id: "PEGA_AQUI_EL_ID_DE_LA_HOJA_DE_LA_CAMPANA_2" },
  c1: { id: "PEGA_AQUI_EL_ID_DE_LA_HOJA_DE_LA_CAMPANA_1" },
};
// ==========================================================

const SESION_HORAS = 12;
const MAX_ARCHIVO_MB = 15;
const MAX_INTENTOS = 5;
const COLUMNAS = ["id", "actualizado", "nombre", "marca", "fase", "puntuacion", "responsable", "json"];
const ID_VALIDO = /^[A-Za-z0-9_.~:@+-]{1,200}$/;

// ---------- utilidades ----------
function props_() { return PropertiesService.getScriptProperties(); }
function hex_(bytes) { return bytes.map(function (b) { return ((b < 0 ? b + 256 : b) + 256).toString(16).slice(1); }).join(""); }
function sha256_(txt) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, txt, Utilities.Charset.UTF_8)); }
function hmac_(txt, clave) { return hex_(Utilities.computeHmacSha256Signature(txt, clave)); }
function err_(codigo, mensaje) { const e = new Error(mensaje); e.code = codigo; return e; }

// ---------- instalación (se ejecuta una vez a mano) ----------
function instalar() {
  const p = props_();
  const usuarios = {};
  Object.keys(USUARIOS).forEach(function (nombre) {
    const u = USUARIOS[nombre];
    if (!u || !u.clave || String(u.clave).length < 8) throw new Error("La clave de «" + nombre + "» debe tener al menos 8 caracteres.");
    const sal = Utilities.getUuid();
    usuarios[nombre.toLowerCase().trim()] = { sal: sal, hash: sha256_(sal + u.clave), rol: u.rol === "lector" ? "lector" : "editor" };
  });
  if (!Object.keys(usuarios).length) throw new Error("Escribe al menos un usuario dentro de USUARIOS.");
  p.setProperty("USUARIOS", JSON.stringify(usuarios));
  if (!p.getProperty("SECRETO")) p.setProperty("SECRETO", Utilities.getUuid() + Utilities.getUuid());
  const hoja = hoja_();
  carpeta_();
  Logger.log("Instalado. Usuarios: " + Object.keys(usuarios).join(", "));
  Logger.log("Hoja de datos: " + hoja.getParent().getUrl());
  Logger.log("AHORA: borra las claves de USUARIOS en el código y guarda. Después pulsa Implementar > Nueva implementación > Aplicación web.");
}

// Cierra la sesión de todo el mundo (por ejemplo, si pierdes un portátil). Se ejecuta a mano desde el editor.
function cerrarSesiones() {
  props_().setProperty("SECRETO", Utilities.getUuid() + Utilities.getUuid());
  Logger.log("Todas las sesiones se han cerrado.");
}

function hoja_() {
  const p = props_();
  let ss = null;
  const id = p.getProperty("SS_ID");
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create("CRM TexLink (datos)"); p.setProperty("SS_ID", ss.getId()); }
  let sh = ss.getSheetByName("clientes");
  if (!sh) {
    sh = ss.getSheets()[0];
    sh.setName("clientes");
    sh.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function carpeta_() {
  const p = props_();
  let id = p.getProperty("CARPETA_ID");
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* se recrea */ } }
  const c = DriveApp.createFolder("CRM TexLink - Tech packs");
  p.setProperty("CARPETA_ID", c.getId());
  return c;
}

// ---------- entrada ----------
function doGet() {
  return ContentService.createTextOutput("CRM TexLink: servidor activo.").setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  let salida;
  try {
    const peticion = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    salida = enrutar_(peticion);
  } catch (ex) {
    salida = { ok: false, error: ex.code || "server", message: ex.code ? ex.message : "Error del servidor." };
    if (!ex.code) console.error(ex.stack || String(ex));
  }
  return ContentService.createTextOutput(JSON.stringify(salida)).setMimeType(ContentService.MimeType.JSON);
}

const ESCRITURAS = { update: 1, set: 1, batch: 1, upload: 1, deleteFile: 1 };

function enrutar_(req) {
  const accion = String(req.action || "");
  if (accion === "login") return entrar_(req);
  const ses = verificar_(req.token);
  let r;
  if (ESCRITURAS[accion]) {
    if (ses.r !== "editor") throw err_("forbidden", "Tu usuario solo puede mirar.");
    const cerrojo = LockService.getScriptLock();
    cerrojo.waitLock(25000);
    try { r = ejecutar_(accion, req); } finally { cerrojo.releaseLock(); }
  } else {
    r = ejecutar_(accion, req, ses);
  }
  r.ok = true;
  r.yo = { user: ses.u, rol: ses.r };
  return r;
}

function ejecutar_(accion, req, ses) {
  switch (accion) {
    case "list": return listar_(Number(req.since) || 0);
    case "update": return actualizar_(req.id, req.patch);
    case "set": return guardar_([{ id: req.id, doc: req.doc }]);
    case "batch": return guardar_(req.docs);
    case "sheet": if (ses && ses.r !== "editor") throw err_("forbidden", "Tu usuario solo puede mirar."); return leerHoja_(req.spreadsheetId, req.range);
    case "upload": return subir_(req);
    case "download": return descargar_(req.id);
    case "deleteFile": return borrar_(req.id);
    default: throw err_("bad_request", "Acción desconocida.");
  }
}

// ---------- acceso ----------
function secreto_() { return props_().getProperty("SECRETO") || ""; }

function entrar_(req) {
  const usuario = String(req.user || "").toLowerCase().trim();
  const cache = CacheService.getScriptCache();
  const clave = "fallos:" + usuario;
  const fallos = Number(cache.get(clave) || 0);
  if (fallos >= MAX_INTENTOS) throw err_("locked", "Demasiados intentos. Espera 15 minutos.");
  const usuarios = JSON.parse(props_().getProperty("USUARIOS") || "{}");
  const u = usuarios[usuario];
  if (!u || sha256_(u.sal + String(req.password || "")) !== u.hash) {
    cache.put(clave, String(fallos + 1), 900);
    throw err_("bad_login", "Usuario o contraseña incorrectos.");
  }
  cache.remove(clave);
  const exp = Date.now() + SESION_HORAS * 3600 * 1000;
  const cuerpo = Utilities.base64EncodeWebSafe(JSON.stringify({ u: usuario, r: u.rol, e: exp }));
  return { ok: true, token: cuerpo + "." + hmac_(cuerpo, secreto_()), user: usuario, rol: u.rol, exp: exp };
}

function verificar_(token) {
  const partes = String(token || "").split(".");
  if (partes.length !== 2 || !secreto_() || hmac_(partes[0], secreto_()) !== partes[1]) throw err_("auth", "Sesión no válida.");
  let d;
  try { d = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString()); } catch (e) { throw err_("auth", "Sesión no válida."); }
  if (!d || d.e < Date.now()) throw err_("auth", "La sesión ha caducado.");
  return d;
}

// ---------- clientes ----------
function ids_(sh) {
  const ultima = sh.getLastRow();
  const mapa = {};
  if (ultima > 1) sh.getRange(2, 1, ultima - 1, 1).getValues().forEach(function (f, i) { mapa[f[0]] = i + 2; });
  return mapa;
}

function fila_(id, doc, ahora) {
  const json = JSON.stringify(doc);
  if (json.length > 45000) throw err_("too_large", "El cliente tiene demasiados datos.");
  return [id, ahora, doc.name || "", doc.brand || "", doc.stage || "", doc.score || 0, doc.resp || "Lucas", json];
}

function listar_(desde) {
  const sh = hoja_();
  const ultima = sh.getLastRow();
  const docs = [];
  let max = desde;
  if (ultima > 1) {
    sh.getRange(2, 1, ultima - 1, COLUMNAS.length).getValues().forEach(function (f) {
      const t = Number(f[1]) || 0;
      if (t >= desde) {
        try { docs.push({ id: f[0], doc: JSON.parse(f[7]) }); } catch (e) { /* fila dañada: se ignora */ }
        if (t > max) max = t;
      }
    });
  }
  return { docs: docs, max: max };
}

function actualizar_(id, parche) {
  if (!ID_VALIDO.test(String(id || ""))) throw err_("bad_request", "Identificador no válido.");
  if (!parche || typeof parche !== "object" || Array.isArray(parche)) throw err_("bad_request", "Cambio no válido.");
  const sh = hoja_();
  const f = ids_(sh)[id];
  if (!f) throw err_("not_found", "El cliente no existe.");
  const doc = JSON.parse(sh.getRange(f, 8).getValue());
  Object.keys(parche).forEach(function (k) { doc[k] = parche[k]; });
  const ahora = Date.now();
  sh.getRange(f, 1, 1, COLUMNAS.length).setValues([fila_(id, doc, ahora)]);
  return { updatedAt: ahora, max: ahora };
}

function guardar_(lista) {
  if (!Array.isArray(lista) || lista.length > 50) throw err_("bad_request", "Lote no válido.");
  const sh = hoja_();
  const mapa = ids_(sh);
  const ahora = Date.now();
  const nuevas = [];
  lista.forEach(function (x) {
    if (!x || !ID_VALIDO.test(String(x.id || "")) || !x.doc || typeof x.doc !== "object") throw err_("bad_request", "Cliente no válido.");
    const fila = fila_(x.id, x.doc, ahora);
    if (mapa[x.id]) sh.getRange(mapa[x.id], 1, 1, COLUMNAS.length).setValues([fila]);
    else nuevas.push(fila);
  });
  if (nuevas.length) sh.getRange(sh.getLastRow() + 1, 1, nuevas.length, COLUMNAS.length).setValues(nuevas);
  return { updatedAt: ahora, max: ahora };
}

// ---------- lectura de las hojas de origen ----------
function letraANumero_(letras) {
  let n = 0;
  for (let i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
  return n;
}

function leerHoja_(clave, rango) {
  const origen = HOJAS_ORIGEN[clave];
  let id = origen ? origen.id : "";
  if (!id) { Object.keys(HOJAS_ORIGEN).forEach(function (k) { if (HOJAS_ORIGEN[k].id === clave) id = clave; }); }
  if (!id) throw err_("forbidden", "Esa hoja no está permitida.");
  const m = /^'?(.+?)'?!([A-Z]{1,3})(\d{1,5}):([A-Z]{1,3})(\d{1,5})$/.exec(String(rango || ""));
  if (!m) throw err_("bad_request", "Rango no válido.");
  const sh = SpreadsheetApp.openById(id).getSheetByName(m[1]);
  if (!sh) throw err_("not_found", "No encuentro la pestaña «" + m[1] + "».");
  const c1 = letraANumero_(m[2]), f1 = Number(m[3]);
  const c2 = Math.min(letraANumero_(m[4]), sh.getMaxColumns()), f2 = Math.min(Number(m[5]), sh.getMaxRows());
  if (f2 < f1 || c2 < c1) return { values: [] };
  return { values: sh.getRange(f1, c1, f2 - f1 + 1, c2 - c1 + 1).getDisplayValues() };
}

// ---------- archivos (tech packs en Drive) ----------
function limpiar_(txt) { return String(txt || "").replace(/[\\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 120) || "archivo"; }

function dentro_(carpetaOArchivo, raizId) {
  const padres = carpetaOArchivo.getParents();
  while (padres.hasNext()) {
    const p = padres.next();
    if (p.getId() === raizId || dentro_(p, raizId)) return true;
  }
  return false;
}

function subir_(req) {
  const bytes = Utilities.base64Decode(String(req.b64 || ""));
  if (!bytes.length) throw err_("invalid_request", "El archivo está vacío.");
  if (bytes.length > MAX_ARCHIVO_MB * 1048576) throw err_("too_large", "El archivo pesa más de " + MAX_ARCHIVO_MB + " MB.");
  const raiz = carpeta_();
  const nombreCarpeta = limpiar_((req.leadName || "sin cliente") + " (" + (req.leadId || "") + ")");
  const existentes = raiz.getFoldersByName(nombreCarpeta);
  const sub = existentes.hasNext() ? existentes.next() : raiz.createFolder(nombreCarpeta);
  const mime = String(req.mime || "application/octet-stream");
  const archivo = sub.createFile(Utilities.newBlob(bytes, mime, limpiar_(req.name)));
  return { id: archivo.getId(), size: bytes.length, mime: archivo.getMimeType() };
}

function archivoPropio_(id) {
  if (!ID_VALIDO.test(String(id || ""))) throw err_("bad_request", "Archivo no válido.");
  let archivo;
  try { archivo = DriveApp.getFileById(id); } catch (e) { throw err_("not_found", "No encuentro el archivo."); }
  if (!dentro_(archivo, carpeta_().getId())) throw err_("forbidden", "Ese archivo no es del CRM.");
  return archivo;
}

function descargar_(id) {
  const archivo = archivoPropio_(id);
  const blob = archivo.getBlob();
  return { name: archivo.getName(), mime: blob.getContentType(), b64: Utilities.base64Encode(blob.getBytes()) };
}

function borrar_(id) {
  archivoPropio_(id).setTrashed(true);
  return { deleted: true };
}
