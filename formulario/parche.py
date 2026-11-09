#!/usr/bin/env python3
"""Aplica los cambios del formulario de tech packs sobre el HTML original de texlinkform.netlify.app.

Uso:
  python3 formulario/parche.py ORIGINAL.html SALIDA.html --crm-url URL_DEL_APPS_SCRIPT_DEL_CRM --clave CLAVE_DEL_FORMULARIO

Hace estas cosas y nada más:
  1. Añade el campo TELÉFONO (obligatorio) debajo de «Cliente / Empresa», un campo oculto «referencia»
     y un campo trampa contra robots.
  2. Añade sus estilos (campo en rojo, aviso y ajuste en móvil).
  3. Sustituye el script desde «previewImages» hasta el final por script-nuevo.js
     (teléfono, ?ref=, compresión de imágenes y envío a Google y al CRM).
  4. Cambia el texto de límite de imágenes, que ya no aplica porque se reducen solas.
Se detiene si el HTML no es el esperado.
"""
import argparse
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))

CAMPO_TELEFONO = '''      <input type="text" id="cliente" placeholder="Nombre del cliente" />
    </div>
    <div class="meta-field tel" id="telField">
      <label for="telefono">Tel&eacute;fono *</label>
      <input type="tel" id="telefono" inputmode="tel" autocomplete="tel" placeholder="Ej: 612 34 56 78 o +34 612 34 56 78" required oninput="limpiarErrorTelefono()" />
      <div class="error-msg" id="telError">&#9888; Indica un tel&eacute;fono v&aacute;lido (m&iacute;nimo 9 d&iacute;gitos).</div>
      <div class="hint">Solo lo usaremos para contactarte sobre esta ficha.</div>
    </div>
    <input type="hidden" id="referencia" value="" />
    <div class="hp" aria-hidden="true"><label for="web">No rellenar</label><input type="text" id="web" tabindex="-1" autocomplete="off" /></div>
  </div>'''

ORIGINAL_CLIENTE = '''      <input type="text" id="cliente" placeholder="Nombre del cliente" />
    </div>
  </div>'''

ESTILOS = '''  .meta-field.tel { grid-column: 2; }
  .meta-field.invalid input { border-bottom-color: #c62828; background: #fdecea; }
  .meta-field.invalid label { color: #c62828; }
  .meta-field .error-msg { margin-top: 6px; }
  .meta-field .hint { font-size: 11px; color: #999; margin-top: 6px; }
  .hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
  .upload-preview { cursor: pointer; }
  @media (max-width: 600px) { .meta-field.tel { grid-column: 1; } }
</style>'''


def una_vez(texto, buscado, nuevo, nombre):
    n = texto.count(buscado)
    if n != 1:
        sys.exit('No encuentro exactamente una vez «%s» (aparece %d veces). El HTML no es el esperado.' % (nombre, n))
    return texto.replace(buscado, nuevo)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('entrada')
    ap.add_argument('salida')
    ap.add_argument('--crm-url', required=True)
    ap.add_argument('--clave', required=True)
    a = ap.parse_args()

    html = open(a.entrada, encoding='utf-8').read()
    if 'id="telefono"' in html:
        sys.exit('Este HTML ya tiene el campo de teléfono: parte del original.')

    html = una_vez(html, ORIGINAL_CLIENTE, CAMPO_TELEFONO, 'campo cliente')
    html = una_vez(html, '</style>', ESTILOS, 'cierre de estilos')
    html = una_vez(html, 'PNG, JPG, GIF &mdash; hasta 10 MB por archivo', 'PNG, JPG, GIF &mdash; m&aacute;ximo 8, se reducen solas', 'texto de límite de imágenes')

    m = re.search(r'<script>(.*?)</script>', html, re.S)
    if not m:
        sys.exit('No encuentro el script del formulario.')
    js = m.group(1)
    corte = js.find('  function previewImages(event) {')
    if corte < 0:
        sys.exit('No encuentro previewImages en el script.')
    nuevo = open(os.path.join(AQUI, 'script-nuevo.js'), encoding='utf-8').read()
    nuevo = nuevo.replace('__CRM_URL__', a.crm_url).replace('__CRM_CLAVE__', a.clave)
    html = html[:m.start(1)] + js[:corte] + nuevo + html[m.end(1):]

    open(a.salida, 'w', encoding='utf-8').write(html)
    print('Formulario generado:', a.salida, '(%d caracteres)' % len(html))


if __name__ == '__main__':
    main()
