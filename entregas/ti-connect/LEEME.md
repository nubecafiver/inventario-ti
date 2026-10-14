# TI Connect — entrega de arreglos de seguridad

Qué contiene (todo se copia sobre tu proyecto `TI_Connect_Firebase`, respetando las carpetas):

| Archivo | Qué arregla |
|---|---|
| `web/index.html` | **Hallazgo 1 (XSS).** Escapa título, categoría, solicitante, mensajes, publicaciones, comentarios y avisos antes de pintarlos. Ver `arreglo-xss.diff`. |
| `web/sw.js` | Sube `ti-connect-v5` → `v6` para que los teléfonos bajen la versión nueva. |
| `firestore.rules` | **2** el token de notificaciones ya no puede declarar otro rol; **5** el ticket se valida al crearse y el consultor solo cambia asignación, estado y `rk`; **6** `authorRole` de publicaciones y comentarios debe ser el del token. |
| `storage.rules` | **3** `posts/`: cada quien sube solo a su carpeta, solo imágenes de hasta 10 MB, sin sobrescribir; `tickets/`: solo staff (la app no sube nada ahí hoy). |
| `scripts/import_padron.js` | **4** contraseñas iniciales aleatorias por persona (en `contrasenas-iniciales.csv`) y opción `--reiniciar` para las cuentas que ya existen. |
| `desplegar.bat` / `desplegar.sh` | Despliegan paso a paso, preguntando antes de cada uno y guardando una copia local. |
| `originales/` | Tus reglas y script tal como estaban, para revertir. |

## Lo que debes saber antes (honesto)
- **No pude ejecutar nada contra tu Firebase ni correr las reglas en el emulador** (no hay red aquí). El XSS sí tiene una prueba (`node prueba-xss.mjs`). Las reglas las revisé línea por línea contra los campos que escribe `ti-connect-data.js`, pero **pruébalas en el Simulador de reglas antes de publicarlas**.
- Las reglas asumen que el rol de la app (`me.role`) es el mismo que el del token de sesión. Si no, fallarían publicar en el muro o activar notificaciones: se vería "permiso denegado". Ya está previsto el regreso (abajo).
- **Hallazgo 4 (contraseña `Cafiver2026`):** la app no tiene pantalla para cambiarla, así que **todas las cuentas existentes siguen con esa contraseña**. El script nuevo arregla las cuentas futuras; para las actuales hay que correr `--reiniciar`, y **cada persona dejará de poder entrar hasta recibir la suya**. Hazlo cuando puedas repartirlas. Un cambio obligatorio en el primer ingreso requiere una pantalla nueva: no la hice (sería cambio de la app, con demo antes).
- **Hallazgo 5 (folio):** el folio sigue generándose en la app (`SR-` + 5 dígitos) y puede repetirse. Arreglarlo bien requiere una Function o una transacción; queda pendiente.
- Un mismo teléfono que cambia de usuario sigue pudiendo registrar sus notificaciones (la regla lo permite a propósito).

## Paso a paso
1. Descarga esta carpeta desde GitHub (rama `claude/wonderful-newton-rr6o79`, `entregas/ti-connect`).
2. Copia sobre tu proyecto: `web/index.html`, `web/sw.js`, `firestore.rules`, `storage.rules` y `scripts/import_padron.js`.
3. Abre una terminal **dentro de la carpeta del proyecto** y ejecuta `desplegar.bat` (Windows) o `./desplegar.sh` (Mac/Linux). La primera vez te pedirá `firebase login`.
4. Contesta `s` al paso 1 (sitio). Haz la prueba del XSS (abajo). Después los pasos 2 y 3 (reglas) **solo si ya las probaste en el Simulador**.

## Pruebas después de desplegar
- **XSS:** crea un ticket con el título `<img src=x onerror=alert(1)>`. Debe verse tal cual, sin alerta, en la vista del colaborador y en el panel del staff.
- **Ticket normal:** un colaborador crea un ticket; un consultor lo toma, lo regresa y lo resuelve; el colaborador ve el cambio.
- **Muro:** un colaborador publica un texto y una foto; otro usuario ve y comenta.
- **Notificaciones:** activa las notificaciones en un teléfono; crea un ticket y verifica que llega el aviso al staff.
- Prueba negativa (Simulador): un colaborador intentando crear `fcmTokens` con `role: 'director'` → denegado.

## Si algo falla
- Falla el sitio: copia tus `web/index.html` y `web/sw.js` originales (están en la carpeta `respaldo-antes-del-arreglo-…` que crea el script), cambia el caché a `ti-connect-v7` en `sw.js` y vuelve a desplegar `hosting`.
- Fallan notificaciones, muro o tickets tras publicar reglas: copia de `originales/` el archivo correspondiente y ejecuta `firebase deploy --only firestore:rules` (o `--only storage`).
