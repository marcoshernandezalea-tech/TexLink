# Formulario de tech packs (texlinkform.netlify.app)

El formulario original es un único HTML en Netlify. Esta carpeta no lo guarda entero: contiene el cambio, que se aplica sobre el original.

- `script-nuevo.js`: teléfono obligatorio y normalizado, referencia `?ref=TX-XXXX`, compresión de imágenes, envío al Google de siempre y al CRM (con reintentos y cola local).
- `parche.py`: aplica ese cambio al HTML original y pone la dirección y la clave del CRM.

```bash
python3 formulario/parche.py ORIGINAL.html index.html --crm-url https://script.google.com/macros/s/XXXX/exec --clave LA_CLAVE
```

La clave es `CLAVE_FORMULARIO` de `crm-web/apps-script/Code.gs`. No se guarda aquí: genera el HTML con ella y no lo subas a un repositorio público.
