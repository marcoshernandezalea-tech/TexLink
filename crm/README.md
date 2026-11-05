# CRM de TexLink

Página publicada como Artifact de claude.ai: <https://claude.ai/artifact/BdvKHica4KDoW47fxnUuQD> (privada).

| Ruta | Qué es |
|---|---|
| `src/index.template.html` | Plantilla: cabecera, HTML y marcadores donde entran el CSS y el JS. |
| `src/styles.css`, `src/styles-techpack.css` | Estilos (tema oscuro tipo panel de control, tubos de neón y tech packs). |
| `src/js/*.js` | La aplicación, en cinco trozos que se unen por orden alfabético dentro de una sola función. `03b-techpack.js` añade la pestaña y la caja de tech packs sobre el resto. |
| `build.mjs` | Une `src/` y genera `crm/index.html`, que es lo que se publica. |
| `seed-clasificacion.json` | Clasificación inicial de los 128 leads de las dos campañas. |

## Construir y publicar

```bash
node crm/build.mjs        # genera crm/index.html (no se guarda en git)
```

Después se publica `crm/index.html` como Artifact con estas capacidades: `db`, `sample`, `downloads`, `assets` y `mcp` (servidor «Google Sheets», herramienta `get_values`).

## Cómo funciona

- La base de datos del Artifact guarda un documento por cliente en `leads/<id>` y el logo en `config/brand`.
- **Importar → Subir leads de Meta** lee el CSV de Meta (también el UTF-16 con tabuladores), mapea unidades, presupuesto, tech pack y anuncio, y salta los clientes que ya existen por correo o teléfono.
- **Importar → Leer mis hojas** trae contacto, anuncio y notas de las dos hojas de Google.
- Clasificar, pegar texto y redactar mensajes usan Claude desde la página, con permiso del usuario.
- Los ids de lead son `c1-r<fila>` y `c2-r<fila>` (campaña y fila de la hoja). **No reordenes filas de las hojas.**
- **Tech packs:** cada ficha tiene una caja para subir archivos (PDF, imágenes, CSV o texto, hasta 20 MB) y para guardar enlaces de Drive o WeTransfer. Los archivos viven en el almacenamiento del Artifact (`assets`); en el cliente solo se guarda su id (`tp`) y los enlaces (`tpLinks`). Solo quien puede editar el Artifact sube archivos. La pestaña «Tech packs» lista quién dice tenerlo y aún falta guardar.
- «Cierre» muestra la cercanía al cierre según la fase: nuevo 10 %, en contacto 35 %, reunión 60 %, presupuesto 82 %, ganado 100 %.
