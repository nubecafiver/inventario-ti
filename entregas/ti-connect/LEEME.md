# TI Connect — arreglo 1: XSS almacenado (solo cambios de seguridad)

**Qué corrige:** el título del ticket, la categoría, el solicitante, los mensajes, las publicaciones y los comentarios se pintaban con `innerHTML` sin escapar. Un colaborador podía meter código en un título y ejecutarlo en la sesión de un consultor o del gerente.

**Cómo:** se escapa en el punto donde los datos de Firestore entran a la app (`mapTicket`, `mapMsg`, `mapPost`) y en los comentarios y avisos. Los dos lugares que usan `textContent` recuperan el texto original con `unH`. No cambia lógica, diseño ni reglas.

**Archivos** (copiar sobre tu proyecto `TI_Connect_Firebase`):
- `web/index.html` — cambios en 20 líneas (ver `arreglo-xss.diff`).
- `web/sw.js` — `ti-connect-v5` → `ti-connect-v6` (obliga a los teléfonos a bajar la versión nueva).

**Probado:** `node prueba-xss.mjs` (títulos con `<img onerror>`, comillas y `&` quedan inertes y el texto normal se ve igual). **No probado:** en un navegador con tu Firebase real ni instalado como PWA; hazlo después de desplegar con un ticket de prueba titulado `<img src=x onerror=alert(1)>`: debe verse tal cual, sin alerta.

**Desplegar (tú, desde tu computadora):**
```
firebase use ti-connect-3d3a7
firebase deploy --only hosting
```
**Revertir:** vuelve a copiar tu `web/index.html` y `web/sw.js` originales (con `ti-connect-v7` en sw.js si ya desplegaste v6, para que el caché se renueve) y despliega de nuevo.
