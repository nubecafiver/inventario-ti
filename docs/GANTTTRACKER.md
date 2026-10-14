# GanttTracker (Proyectos) — revisión y decisión de integración

Repositorio revisado (solo lectura): `nubecafiver/-gantttracker`, publicado en `https://nubecafiver.github.io/-gantttracker/`.

## Qué es
- App de un solo archivo (`index.html`, ~170 KB) con Firebase Auth + Firestore (SDK compat 9.23). Vistas: Gantt, Proyectos, Diario, Historial.
- Colecciones: `projects`, `tasks`, `fases`, `comments`, `dailylogs`, `evidencias`, `history`.
- Tareas con responsable por tipo (U usuario, T TI, P proveedor, S compartido), avance, fechas y asignado.
- Una acción programada de GitHub (`.github/workflows/alertas-tareas.yml`) revisa cada día a las 8:00 (hora de México) las tareas sin actualizar hace 3 o más días y envía correos con EmailJS. Usa *secrets* del repositorio (no están en el código).

## Hallazgos (no se corrigieron: no es nuestro repositorio de trabajo)
- Usa **otro proyecto de Firebase** (`gantttracker-cafiver-15cb3`), con sus propios usuarios en Authentication. Los roles de CAFIVER TI no aplican allí.
- El administrador está fijo en el código (`ADMIN_EMAIL`); no hay roles en Firestore. Se desconocen sus reglas de seguridad (no están en el repo): conviene revisarlas en su consola.
- Hay 4 borrados reales (`tasks`, `evidencias`, `projects`, `dailylogs`) y 24 usos de `innerHTML` sin función de escape (riesgo de XSS).
- La fecha de última actualización se guarda como texto `dd/mm/aa, hh:mm` y el script de alertas la interpreta a mano: es frágil.
- El script de alertas existe duplicado (`revisar-tareas.js` en la raíz y en `.github/scripts/`).
- Su directorio de usuarios nombra a `soportetecnico@` como "Rafael Aguila" y a `soportetec@` como "Daniela Gomez Aleluya".
- Los datos de configuración públicos de Firebase en el HTML son normales; la protección real son las reglas.

## Decisión
Integración mínima: **"Proyectos" en el menú abre GanttTracker en otra pestaña**, igual que el inventario. No se modifica su código ni su Firebase, y la plataforma no lee sus datos. Cuando se decida, se podrían mostrar indicadores de proyectos en Inicio (requiere lectura de solo consulta al otro proyecto de Firebase y revisar sus reglas) o reconstruir proyectos dentro de la plataforma.
