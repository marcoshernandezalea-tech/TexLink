# CRM de TexLink en tu web (gratis)

El CRM como una carpeta de tu web, por ejemplo `https://www.texlink.es/crm/`, con usuario y contraseña. No usa claude.ai ni cuesta nada.

Funciona con tres piezas gratuitas de Google, todas en tu cuenta:
- **Un pequeño servidor** (Google Apps Script) que comprueba usuario y contraseña.
- **Una hoja de Google** («CRM TexLink (datos)») donde se guardan los clientes.
- **Una carpeta de Drive** («CRM TexLink - Tech packs») donde se guardan los archivos, de cualquier tipo.

## Qué cambia respecto a la versión de claude.ai

| | claude.ai | Web (esta guía) |
|---|---|---|
| Acceso | Cuenta de Claude | Usuario y contraseña |
| Puntuación de clientes nuevos | Claude lee las notas | Reglas con tu hoja «Criterios» |
| Mensajes para el cliente | Los escribe Claude | Plantillas según la fase |
| Tech packs | PDF, imágenes, CSV (20 MB) | Cualquier tipo (15 MB), en tu Drive |
| Leer tus hojas de Google | Sí | Sí |
| Importar CSV de Meta | Sí | Sí |
| Coste | 0 | 0 |

La clasificación que ya está hecha (fases, etiquetas, motivos) se conserva al pasar los datos.

## Parte 1. Crear el servidor (10 minutos)

1. Entra con la cuenta de Google de TexLink en <https://script.google.com> y pulsa **Nuevo proyecto**.
2. Borra el código de ejemplo y pega todo el contenido de `crm-web/apps-script/Code.gs`.
3. Arriba del código, dentro de `USUARIOS`, quita las `//` y escribe una línea por persona con su clave (mínimo 8 caracteres) y su rol: `editor` cambia datos y sube archivos, `lector` solo mira.
4. En `HOJAS_ORIGEN` pega el ID de cada hoja de Google (lo que va entre `/d/` y `/edit` en su dirección).
5. Guarda (Ctrl+S). Arriba elige la función **instalar** y pulsa **Ejecutar**. Google pedirá permisos: *Revisar permisos* → tu cuenta → *Configuración avanzada* → *Ir a proyecto (no seguro)* → *Permitir*. Es normal: es tu propio script.
6. Cuando termine, **borra las claves del código** (deja `USUARIOS = {}`) y guarda.
7. Pulsa **Implementar → Nueva implementación**. Tipo **Aplicación web**. *Ejecutar como*: **Yo**. *Quién tiene acceso*: **Cualquier usuario**. Pulsa Implementar y copia la dirección que termina en `/exec`.

«Cualquier usuario» solo significa que la dirección responde. Sin usuario y contraseña válidos no devuelve ningún dato.

Si más adelante cambias el código: **Implementar → Gestionar implementaciones →** lápiz **→ Nueva versión**.

## Parte 2. Poner el CRM en tu web

1. En el proyecto, ejecuta `node crm-web/build.mjs`. Crea la carpeta `crm-web/dist/crm/` con `index.html` y `config.js`.
2. Abre `config.js` y pega la dirección del servidor en `api`. Opcional: la ruta del logo de tu web en `logo`.
3. Copia la carpeta `crm` dentro de la carpeta pública de tu web (la que se publica tal cual: `public/` en Vite, Next o Astro, o la raíz en una web estática) y publica la web como siempre.
4. Queda en `https://www.texlink.es/crm/`. Si te da un error 404, prueba `/crm/index.html`.
5. Añade un enlace discreto en el menú o el pie de página. La página lleva `noindex`, así que Google no la lista.

Si tu web la mantiene Claude Code, pídele esto: «Copia la carpeta `crm-web/dist/crm` a la carpeta pública de la web como `crm` y añade en el pie de página un enlace «Acceso equipo» a `/crm/`. No toques nada más».

## Parte 3. Pasar los datos que ya tienes

1. En el CRM de claude.ai: **Importar → 5. Copia de seguridad → Descargar copia**.
2. En el CRM de la web: **Importar → 5. Copia de seguridad → Restaurar copia** y elige ese archivo. Tarda uno o dos minutos.
3. No subas ese archivo a un repositorio público: lleva correos y teléfonos de tus clientes.

Los tech packs que hubieras guardado en claude.ai no viajan en la copia: súbelos de nuevo.

## Seguridad

- Las contraseñas se guardan cifradas con sal. Tras 5 intentos fallidos, ese usuario queda bloqueado 15 minutos.
- La sesión dura 12 horas. Para cerrar la sesión de todo el mundo (un portátil perdido), ejecuta `cerrarSesiones` en el editor.
- Para cambiar o añadir claves: vuelve a escribirlas en `USUARIOS`, ejecuta `instalar`, y borra las claves otra vez.
- Los identificadores de tus hojas de Google solo están dentro del script, no en la web.
- La hoja «CRM TexLink (datos)» es solo para consultar: los cambios hechos a mano no llegan al CRM.
- Si tu repositorio es público, no guardes en él `config.js` con datos reales ni copias de seguridad.

## Límites

- Cada acción tarda alrededor de un segundo. Los cambios de otras personas aparecen en menos de 45 segundos.
- Los archivos pesan como máximo 15 MB.
- El servicio gratuito de Google tiene cuotas diarias. Para un equipo pequeño sobra.
- La puntuación por reglas es la de tu hoja «Criterios». No interpreta las notas en texto libre.
