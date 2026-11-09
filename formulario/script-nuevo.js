  /* ====== Teléfono, referencia, imágenes y envío al CRM ====== */
  const LEGACY_URL = 'https://script.google.com/macros/s/AKfycbwgY5IfrOoxN2ve7bENBjmvL_BpPyaYOupQiH7VE6aJR8spvum-jIpTJ76xPl717tI7/exec';
  const CRM_URL = '__CRM_URL__';
  const CRM_CLAVE = '__CRM_CLAVE__';
  const MAX_IMAGENES = 8;
  const OUTBOX_KEY = 'texlink_crm_pendiente';
  let imagenesSel = [];

  // Quita espacios, guiones, puntos y paréntesis. +34 y 0034 quedan como 34XXXXXXXXX.
  // Si son 9 dígitos y empiezan por 6, 7 o 9, antepone 34. Otros números conservan su prefijo.
  function normalizarTelefono(bruto) {
    let d = String(bruto == null ? '' : bruto).replace(/\D/g, '');
    if (d.indexOf('0034') === 0) d = d.slice(2);
    else if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.length === 9 && /^[679]/.test(d)) d = '34' + d;
    return d;
  }

  function limpiarErrorTelefono() {
    document.getElementById('telField').classList.remove('invalid');
    document.getElementById('telError').style.display = 'none';
  }

  function validarTelefono() {
    const input = document.getElementById('telefono');
    const norm = normalizarTelefono(input.value);
    const ok = norm.length >= 9 && norm.length <= 15;
    document.getElementById('telField').classList.toggle('invalid', !ok);
    document.getElementById('telError').style.display = ok ? 'none' : 'block';
    if (!ok) {
      document.getElementById('telField').scrollIntoView({ behavior: 'smooth', block: 'center' });
      input.focus({ preventScroll: true });
    }
    return ok;
  }

  // ?ref=TX-XXXX viaja en un campo oculto. Si no viene o no es válido, va vacío.
  (function () {
    const ref = (new URLSearchParams(location.search).get('ref') || '').trim().toUpperCase();
    document.getElementById('referencia').value = /^[A-Z0-9-]{1,20}$/.test(ref) ? ref : '';
  })();

  function getToggleValue(groupId) {
    const active = document.getElementById(groupId).querySelector('.toggle-btn.active');
    return active ? active.textContent.trim() : '—';
  }

  function aviso(texto) {
    const toast = document.getElementById('toast');
    toast.className = 'toast error';
    toast.textContent = texto;
  }

  function previewImages(event) {
    const nuevos = Array.from(event.target.files);
    event.target.value = '';
    const hueco = Math.max(MAX_IMAGENES - imagenesSel.length, 0);
    if (nuevos.length > hueco) aviso('Máximo ' + MAX_IMAGENES + ' imágenes. Se han añadido solo las que caben.');
    imagenesSel = imagenesSel.concat(nuevos.slice(0, hueco));
    dibujarPrevias();
  }

  function dibujarPrevias() {
    const contenedor = document.getElementById('imagePreviews');
    contenedor.innerHTML = '';
    imagenesSel.forEach(function (file, i) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.className = 'upload-preview';
      img.title = 'Haz clic para quitar esta imagen';
      img.onclick = function () { imagenesSel.splice(i, 1); dibujarPrevias(); };
      contenedor.appendChild(img);
    });
  }

  function cargarImagen(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('imagen')); };
      img.src = url;
    });
  }

  async function comprimirImagen(file, lado, calidad) {
    const img = await cargarImagen(file);
    const k = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
    cx.drawImage(img, 0, 0, w, h);
    return cv.toDataURL('image/jpeg', calidad);
  }

  function bytesDeDataUrl(d) { return Math.floor((d.split(',')[1] || '').length * 3 / 4); }

  // Reduce cada imagen a JPEG de hasta 1600 px. Así el envío es ligero aunque la foto sea del móvil.
  async function prepararImagenes() {
    const salida = [], fallos = [];
    const pasos = [[1600, 0.82], [1280, 0.7], [1024, 0.6]];
    for (const file of imagenesSel) {
      let data = null;
      for (const paso of pasos) {
        try { data = await comprimirImagen(file, paso[0], paso[1]); } catch (e) { data = null; break; }
        if (bytesDeDataUrl(data) <= 700 * 1024) break;
      }
      if (!data || bytesDeDataUrl(data) > 1400 * 1024) { fallos.push(file.name); continue; }
      salida.push({ data: data, type: 'image/jpeg', nombre: file.name.replace(/\.[^.]+$/, '') + '.jpg' });
    }
    return { imagenes: salida, fallos: fallos };
  }

  function nuevoId() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'e-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  async function postJSON(url, cuerpo) {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(cuerpo) });
    return res.json();
  }

  // El CRM se reintenta tres veces. Si no responde, la ficha queda guardada en este navegador y se reenvía al volver.
  async function enviarAlCRM(payload) {
    for (let i = 0; i < 3; i++) {
      try {
        const j = await postJSON(CRM_URL, payload);
        if (j && j.ok) return true;
        if (j && (j.error === 'bad_phone' || j.error === 'bad_request' || j.error === 'forbidden' || j.error === 'limit' || j.error === 'too_large')) return false;
      } catch (e) { /* se reintenta */ }
      await new Promise(function (r) { setTimeout(r, 1000 * (i + 1) * (i + 1)); });
    }
    return false;
  }

  function guardarPendiente(payload) {
    try {
      let s = JSON.stringify(payload);
      if (s.length > 3500000) s = JSON.stringify(Object.assign({}, payload, { imagenes: [] }));
      localStorage.setItem(OUTBOX_KEY, s);
    } catch (e) { /* sin espacio: se pierde solo la copia para el CRM */ }
  }

  async function reintentarPendiente() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(OUTBOX_KEY) || 'null'); } catch (e) { p = null; }
    if (!p) return;
    if (await enviarAlCRM(p)) { try { localStorage.removeItem(OUTBOX_KEY); } catch (e) { /* nada */ } }
  }
  reintentarPendiente();

  async function enviarFormulario() {
    if (!validarTelefono()) return;
    if (!validateSizes()) return;

    const btn = document.getElementById('submitBtn');
    const toast = document.getElementById('toast');
    toast.className = 'toast';
    toast.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Preparando…';

    const prep = await prepararImagenes();
    if (prep.fallos.length) {
      aviso('No se pudo procesar: ' + prep.fallos.join(', ') + '. Quítala o prueba con una imagen JPG o PNG.');
      btn.disabled = false;
      btn.textContent = 'Enviar ficha técnica →';
      return;
    }

    const v = function (id) { return document.getElementById(id).value; };
    const telOriginal = v('telefono').trim();
    const tel = normalizarTelefono(telOriginal);
    const ref = v('referencia');
    const tallas = { s: v('sz_s') || 0, m: v('sz_m') || 0, l: v('sz_l') || 0, xl: v('sz_xl') || 0, xxl: v('sz_xxl') || 0 };

    const datos = {
      'Fecha de reunión':      v('fecha') || '—',
      'Cliente / Empresa':     v('cliente') || '—',
      'Teléfono':              tel,
      'Teléfono (original)':   telOriginal,
      'Referencia':            ref || '—',
      'Tipo de prenda':        v('tipo_prenda') || '—',
      'Composición':           v('composicion') || '—',
      'Gramaje (GSM)':         v('gramaje') || '—',
      'Corte / Fit':           v('corte') || '—',
      'Color de tejido':       v('color') || '—',
      'Branding / Diseño':     v('branding_desc') || '—',
      'Etiqueta cuello':       getToggleValue('etiquetaGroup'),
      'Tallas':                'S:' + tallas.s + '  M:' + tallas.m + '  L:' + tallas.l + '  XL:' + tallas.xl + '  XXL:' + tallas.xxl + '  TOTAL:' + v('total_units'),
      'Notas de tallaje':      v('tallas_notas') || '—',
      'Fecha de entrega':      v('fecha_entrega') || '—',
      'Modalidad de envío':    v('incoterm'),
      'Notas adicionales':     v('notas') || '—',
      'imagenes':              prep.imagenes
    };

    const paraCRM = {
      action: 'techpack_submit', clave: CRM_CLAVE, envioId: nuevoId(), web: v('web'),
      cliente: v('cliente'), telefono: tel, telefonoOriginal: telOriginal, referencia: ref,
      fechaReunion: v('fecha'), tipoPrenda: v('tipo_prenda'), composicion: v('composicion'), gramaje: v('gramaje'), corte: v('corte'),
      color: v('color'), branding: v('branding_desc'), etiquetaCuello: getToggleValue('etiquetaGroup'), tallas: tallas,
      totalUnidades: v('total_units'), notasTallaje: v('tallas_notas'), fechaEntrega: v('fecha_entrega'), modalidadEnvio: v('incoterm'),
      notas: v('notas'), imagenes: prep.imagenes
    };

    btn.textContent = 'Enviando…';
    const aGoogle = postJSON(LEGACY_URL, datos).then(function (j) { return !!(j && j.resultado === 'ok'); }).catch(function () { return false; });
    const alCRM = enviarAlCRM(paraCRM);
    const resultado = await Promise.all([aGoogle, alCRM]);
    const okGoogle = resultado[0], okCRM = resultado[1];
    if (!okCRM) guardarPendiente(paraCRM);

    if (okGoogle || okCRM) {
      toast.className = 'toast success';
      toast.textContent = okGoogle ? '✓ Ficha enviada correctamente a texlink.co@gmail.com' : '✓ Ficha recibida correctamente';
      btn.textContent = 'Ficha enviada ✓';
    } else {
      toast.className = 'toast error';
      toast.textContent = 'Error al enviar. Por favor, inténtalo de nuevo.';
      btn.disabled = false;
      btn.textContent = 'Enviar ficha técnica →';
    }
  }
