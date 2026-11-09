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

// Clave que usa el formulario de tech packs para enviar fichas. Si la dejas vacía, configurarFormulario() genera una.
const CLAVE_FORMULARIO = "";
// ==========================================================

const SESION_HORAS = 12;
const MAX_ARCHIVO_MB = 15;
const MAX_INTENTOS = 5;
const COLUMNAS = ["id", "actualizado", "nombre", "marca", "fase", "puntuacion", "responsable", "json", "telefono_norm"];
const COLUMNAS_TP = ["id", "actualizado", "estado", "clienteId", "telefono_norm", "referencia", "json"];
const ESTADOS_TP = ["nuevo", "presupuestado", "mockup", "produccion"];
const MAX_IMAGENES = 8;
const MAX_IMAGEN_BYTES = 1500000;
const MAX_TOTAL_IMAGENES = 7000000;
const MAX_FICHAS_DIA = 200;
const MAX_FICHAS_HORA_TEL = 5;
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
  if (sh.getLastColumn() < COLUMNAS.length) sh.getRange(1, COLUMNAS.length).setValue(COLUMNAS[COLUMNAS.length - 1]);
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

const ESCRITURAS = { update: 1, set: 1, batch: 1, upload: 1, deleteFile: 1, tp_update: 1 };

function enrutar_(req) {
  const accion = String(req.action || "");
  if (accion === "login") return entrar_(req);
  if (accion === "techpack_submit") return recibirFicha_(req);
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
    case "tp_list": return listarFichas_(Number(req.since) || 0);
    case "tp_update": return actualizarFicha_(req.id, req.patch);
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
  return [id, ahora, doc.name || "", doc.brand || "", doc.stage || "", doc.score || 0, doc.resp || "Lucas", json, normTel_(doc.raw && doc.raw.tel)];
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

// ---------- formulario de tech packs ----------
// Quita espacios, guiones, puntos y paréntesis. +34 y 0034 quedan como 34XXXXXXXXX.
// Si son 9 dígitos y empiezan por 6, 7 o 9, antepone 34. Otros números se dejan con su prefijo internacional.
function normTel_(bruto) {
  let d = String(bruto == null ? "" : bruto).replace(/\D/g, "");
  if (d.indexOf("0034") === 0) d = d.slice(2);
  else if (d.indexOf("00") === 0) d = d.slice(2);
  if (d.length === 9 && /^[679]/.test(d)) d = "34" + d;
  return d;
}

function texto_(v, max) { return String(v == null ? "" : v).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim().slice(0, max); }
function numero_(v) { const n = Number(v); return isFinite(n) && n >= 0 ? Math.min(Math.round(n), 1000000) : 0; }
function igual_(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Se ejecuta una vez a mano: guarda la clave del formulario y crea la pestaña de fichas.
function configurarFormulario() {
  const p = props_();
  const clave = String(CLAVE_FORMULARIO || "").trim() || p.getProperty("FORM_KEY") || Utilities.getUuid().replace(/-/g, "");
  if (clave.length < 16) throw new Error("La clave del formulario debe tener al menos 16 caracteres.");
  p.setProperty("FORM_KEY", clave);
  hojaTp_();
  Logger.log("Formulario configurado. Clave del formulario: " + clave);
}

// Opcional: rellena la columna de teléfono normalizado de los clientes que ya tenías.
function migrarTelefonos() {
  const sh = hoja_();
  const ultima = sh.getLastRow();
  if (ultima < 2) return;
  const filas = sh.getRange(2, 1, ultima - 1, COLUMNAS.length).getValues();
  const col = filas.map(function (f) {
    try { return [normTel_(JSON.parse(f[7]).raw && JSON.parse(f[7]).raw.tel)]; } catch (e) { return [""]; }
  });
  sh.getRange(2, COLUMNAS.length, col.length, 1).setValues(col);
  Logger.log("Teléfonos normalizados: " + col.filter(function (c) { return c[0]; }).length + " de " + col.length);
}

function hojaTp_() {
  const ss = hoja_().getParent();
  let sh = ss.getSheetByName("techpacks");
  if (!sh) {
    sh = ss.insertSheet("techpacks");
    sh.getRange(1, 1, 1, COLUMNAS_TP.length).setValues([COLUMNAS_TP]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function idsTp_(sh) {
  const ultima = sh.getLastRow();
  const mapa = {};
  if (ultima > 1) sh.getRange(2, 1, ultima - 1, 1).getValues().forEach(function (f, i) { mapa[f[0]] = i + 2; });
  return mapa;
}

function firmaImagen_(bytes, mime) {
  const b = bytes.slice(0, 12).map(function (x) { return x & 255; });
  if (mime === "image/jpeg") return b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (mime === "image/png") return b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71;
  if (mime === "image/gif") return b[0] === 71 && b[1] === 73 && b[2] === 70;
  if (mime === "image/webp") return b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70 && b[8] === 87 && b[9] === 69 && b[10] === 66 && b[11] === 80;
  return false;
}

function validarImagenes_(lista) {
  const salida = [];
  if (lista == null || (Array.isArray(lista) && !lista.length)) return salida;
  if (!Array.isArray(lista) || lista.length > MAX_IMAGENES) throw err_("bad_request", "Máximo " + MAX_IMAGENES + " imágenes.");
  let total = 0;
  lista.forEach(function (im, i) {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+\/=]+)$/.exec(String((im && im.data) || ""));
    if (!m) throw err_("bad_request", "La imagen " + (i + 1) + " no es válida.");
    const bytes = Utilities.base64Decode(m[2]);
    if (bytes.length < 100 || bytes.length > MAX_IMAGEN_BYTES) throw err_("too_large", "La imagen " + (i + 1) + " es demasiado grande.");
    total += bytes.length;
    if (total > MAX_TOTAL_IMAGENES) throw err_("too_large", "Las imágenes pesan demasiado.");
    if (!firmaImagen_(bytes, m[1])) throw err_("bad_request", "La imagen " + (i + 1) + " no es válida.");
    salida.push({ bytes: bytes, mime: m[1], nombre: limpiar_((im && im.nombre) || ("imagen-" + (i + 1))) });
  });
  return salida;
}

function contarDia_() {
  const p = props_();
  const clave = "FICHAS_" + new Date().toISOString().slice(0, 10);
  p.getKeys().forEach(function (k) { if (k.indexOf("FICHAS_") === 0 && k !== clave) p.deleteProperty(k); });
  const n = Number(p.getProperty(clave) || 0);
  if (n >= MAX_FICHAS_DIA) throw err_("limit", "Se ha alcanzado el máximo de envíos de hoy.");
  p.setProperty(clave, String(n + 1));
}

function buscarCliente_(sh, tel) {
  const ultima = sh.getLastRow();
  if (ultima < 2) return null;
  const filas = sh.getRange(2, 1, ultima - 1, COLUMNAS.length).getValues();
  let oculto = null;
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    let doc = null, tn = String(f[8] || "");
    if (!tn) { try { doc = JSON.parse(f[7]); tn = normTel_(doc.raw && doc.raw.tel); } catch (e) { continue; } }
    if (!tn || tn !== tel) continue;
    if (!doc) { try { doc = JSON.parse(f[7]); } catch (e) { continue; } }
    const c = { fila: i + 2, id: f[0], doc: doc };
    if (!doc.dup) return c;
    if (!oculto) oculto = c;
  }
  if (oculto) {
    for (let j = 0; j < filas.length; j++) {
      if (filas[j][0] === oculto.doc.dup) { try { return { fila: j + 2, id: filas[j][0], doc: JSON.parse(filas[j][7]) }; } catch (e) { /* sigue */ } }
    }
  }
  return oculto;
}

function fechaES_(ms) {
  const d = new Date(ms);
  return ("0" + d.getUTCDate()).slice(-2) + "/" + ("0" + (d.getUTCMonth() + 1)).slice(-2) + "/" + d.getUTCFullYear();
}

function guardarImagenes_(clienteId, clienteNombre, fichaId, imagenes, ms) {
  if (!imagenes.length) return [];
  const raiz = carpeta_();
  const nombreCliente = limpiar_(clienteNombre + " (" + clienteId + ")");
  const existentes = raiz.getFoldersByName(nombreCliente);
  const carpetaCliente = existentes.hasNext() ? existentes.next() : raiz.createFolder(nombreCliente);
  const carpeta = carpetaCliente.createFolder("ficha " + new Date(ms).toISOString().slice(0, 10) + " " + fichaId.slice(-6));
  return imagenes.map(function (im, i) {
    const ext = im.mime === "image/jpeg" ? "jpg" : im.mime.split("/")[1];
    const base = limpiar_("ref-" + (i + 1) + " " + im.nombre.replace(/\.[^.]+$/, ""));
    const f = carpeta.createFile(Utilities.newBlob(im.bytes, im.mime, base + "." + ext));
    return { id: f.getId(), nombre: base + "." + ext, tipo: im.mime, size: im.bytes.length };
  });
}

// Recibe una ficha desde el formulario. Es público: se protege con la clave del formulario,
// un campo trampa, comprobaciones de las imágenes y topes por teléfono y por día.
function recibirFicha_(req) {
  const clave = props_().getProperty("FORM_KEY") || "";
  if (!clave) throw err_("not_configured", "El formulario no está configurado.");
  if (!igual_(String(req.clave || ""), clave)) throw err_("forbidden", "Clave del formulario no válida.");
  if (texto_(req.web, 50)) return { ok: true, ignorado: true };
  const cliente = texto_(req.cliente, 150);
  const tel = normTel_(req.telefono);
  if (!cliente) throw err_("bad_request", "Falta el cliente.");
  if (tel.length < 9 || tel.length > 15) throw err_("bad_phone", "Teléfono no válido.");
  const envioId = String(req.envioId || "");
  if (!/^[A-Za-z0-9-]{8,64}$/.test(envioId)) throw err_("bad_request", "Envío no válido.");
  const imagenes = validarImagenes_(req.imagenes);
  const cache = CacheService.getScriptCache();
  const claveTel = "ficha:" + tel;
  const usos = Number(cache.get(claveTel) || 0);
  if (usos >= MAX_FICHAS_HORA_TEL) throw err_("limit", "Demasiados envíos seguidos con este teléfono.");

  const cerrojo = LockService.getScriptLock();
  cerrojo.waitLock(28000);
  try {
    const shTp = hojaTp_();
    const id = "tp-" + envioId;
    if (idsTp_(shTp)[id]) return { ok: true, duplicado: true, id: id };
    contarDia_();
    cache.put(claveTel, String(usos + 1), 3600);
    const ahora = Date.now();
    const sh = hoja_();
    const ref = texto_(req.referencia, 20).toUpperCase();
    const refOk = /^[A-Z0-9-]{1,20}$/.test(ref) ? ref : "";
    const tallas = req.tallas || {};
    const unidades = numero_(req.totalUnidades);
    const tipo = texto_(req.tipoPrenda, 80);

    let c = buscarCliente_(sh, tel);
    let nuevo = false;
    if (!c) {
      nuevo = true;
      const cid = "f-" + ahora.toString(36) + Math.random().toString(36).slice(2, 6);
      const raw = { fecha: fechaES_(ahora), plataforma: "Formulario", tel: texto_(req.telefonoOriginal, 40) || tel, unidades: unidades ? String(unidades) : "", techpack: "Completo", notas: ("Ficha: " + tipo + (unidades ? " · " + unidades + " uds" : "")).trim() };
      if (refOk) raw.referencia = refOk;
      Object.keys(raw).forEach(function (k) { if (raw[k] === "") delete raw[k]; });
      const doc = { src: cid, camp: 5, name: cliente, brand: "", seg: "marca", stage: "nuevo", score: 0, tags: ["formulario", "tech-pack-recibido"],
        reason: "Entró por el formulario de tech pack.", next: "Primer contacto: confirmar los datos de la ficha.", sug: "", ai: false, raw: raw, tpForm: 0 };
      c = { fila: sh.getLastRow() + 1, id: cid, doc: doc };
    }
    const imgs = guardarImagenes_(c.id, c.doc.name || cliente, id, imagenes, ahora);
    const ficha = {
      id: id, enviado: new Date(ahora).toISOString(), estado: "nuevo", clienteId: c.id, clienteNombre: cliente, nuevoCliente: nuevo,
      telefono: tel, telefonoOriginal: texto_(req.telefonoOriginal, 40), referencia: refOk, tipoPrenda: tipo, unidades: unidades,
      campos: {
        fechaReunion: texto_(req.fechaReunion, 20), composicion: texto_(req.composicion, 80), gramaje: texto_(req.gramaje, 40), corte: texto_(req.corte, 80),
        color: texto_(req.color, 120), branding: texto_(req.branding, 1500), etiquetaCuello: texto_(req.etiquetaCuello, 40),
        tallas: { s: numero_(tallas.s), m: numero_(tallas.m), l: numero_(tallas.l), xl: numero_(tallas.xl), xxl: numero_(tallas.xxl) },
        notasTallaje: texto_(req.notasTallaje, 800), fechaEntrega: texto_(req.fechaEntrega, 20), modalidadEnvio: texto_(req.modalidadEnvio, 60), notas: texto_(req.notas, 1500),
      },
      imagenes: imgs,
    };
    const jsonFicha = JSON.stringify(ficha);
    if (jsonFicha.length > 45000) throw err_("too_large", "La ficha tiene demasiados datos.");
    shTp.getRange(shTp.getLastRow() + 1, 1, 1, COLUMNAS_TP.length).setValues([[id, ahora, "nuevo", c.id, tel, refOk, jsonFicha]]);

    const doc = c.doc;
    doc.tags = Array.isArray(doc.tags) ? doc.tags : [];
    if (doc.tags.indexOf("tech-pack-recibido") < 0) doc.tags.push("tech-pack-recibido");
    doc.tpForm = (Number(doc.tpForm) || 0) + 1;
    doc.tpFormUltimo = ficha.enviado;
    if (!doc.raw) doc.raw = {};
    if (!doc.raw.tel) doc.raw.tel = texto_(req.telefonoOriginal, 40) || tel;
    if (refOk && !doc.raw.referencia) doc.raw.referencia = refOk;
    sh.getRange(c.fila, 1, 1, COLUMNAS.length).setValues([fila_(c.id, doc, ahora)]);
    return { ok: true, id: id, clienteId: c.id, nuevo: nuevo, imagenes: imgs.length };
  } finally {
    cerrojo.releaseLock();
  }
}

function listarFichas_(desde) {
  const sh = hojaTp_();
  const ultima = sh.getLastRow();
  const docs = [];
  let max = desde;
  if (ultima > 1) {
    sh.getRange(2, 1, ultima - 1, COLUMNAS_TP.length).getValues().forEach(function (f) {
      const t = Number(f[1]) || 0;
      if (t >= desde) {
        try { docs.push({ id: f[0], doc: JSON.parse(f[6]) }); } catch (e) { /* fila dañada */ }
        if (t > max) max = t;
      }
    });
  }
  return { docs: docs, max: max };
}

function actualizarFicha_(id, parche) {
  if (!/^tp-[A-Za-z0-9-]{8,64}$/.test(String(id || ""))) throw err_("bad_request", "Ficha no válida.");
  if (!parche || typeof parche !== "object" || ESTADOS_TP.indexOf(parche.estado) < 0) throw err_("bad_request", "Estado no válido.");
  const sh = hojaTp_();
  const f = idsTp_(sh)[id];
  if (!f) throw err_("not_found", "La ficha no existe.");
  const fila = sh.getRange(f, 1, 1, COLUMNAS_TP.length).getValues()[0];
  const doc = JSON.parse(fila[6]);
  doc.estado = parche.estado;
  const ahora = Date.now();
  sh.getRange(f, 1, 1, COLUMNAS_TP.length).setValues([[id, ahora, parche.estado, fila[3], fila[4], fila[5], JSON.stringify(doc)]]);
  return { updatedAt: ahora, max: ahora };
}
