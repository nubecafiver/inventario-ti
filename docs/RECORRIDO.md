# Cómo recorrer CAFIVER TI

## Opción 1 — Recorrido con capturas (sin tocar nada real)
Abre `demo/recorrido/index.html` en el navegador (doble clic). Muestra 18 capturas de cada módulo, como las vería el **Gerente de TI** (ve todo) y un **Consultor de TI** (ve lo suyo), con una frase de qué hace cada pantalla y cómo llegar.
Todo es **DATOS DE EJEMPLO** (marcados DEMO) de un Firebase simulado en memoria; no se tocó el Firebase real. Para regenerarlo: `node tests/recorrido.js` (requiere Playwright).

## Opción 2 — La app con tus datos reales (requiere decisiones tuyas)
1. Fusionar la rama `claude/wonderful-newton-rr6o79` a `main` (lo decides tú). La plataforma queda en `https://nubecafiver.github.io/inventario-ti/ti/`; el inventario sigue en `…/inventario-ti/` sin cambios.
2. **Antes de usarla**, probar y publicar `firestore.rules` con `docs/PUBLICAR-REGLAS.md`. Sin las reglas, los roles solo ocultan botones; no protegen los datos. Las reglas no se han ejecutado en el emulador.
3. Crear en Firebase Authentication las cuentas que falten (probablemente `dgomez@cafiver.com.mx`).
4. Entrar con `ramaya@cafiver.com.mx` › Administración › "Crear mi registro" (queda como Gerente de TI) › "Asignar roles iniciales al equipo".

## Mapa del menú
| Opción | Qué es | Quién la ve |
|---|---|---|
| Inicio | Resumen con indicadores de todos los módulos | Todos (cada rol ve lo suyo) |
| Procesos y procedimientos | Documentos con versiones y aprobación | Gerente, Consultor, Director, Administrador, Técnico (solo publicados) |
| Mesa de ayuda | Tickets, prioridad y SLA | Todos (el Consultor, solo lo suyo) |
| Gestión de cambios | Riesgo, reversa, aprobación y ventana | Gerente, Consultor, Administrador, Director |
| Proveedores y contratos | Vigencias y montos | Gerente, Consultor, Administrador, Director |
| Respaldos | Control de respaldos y pruebas de restauración | Gerente, Consultor, Administrador, Director |
| Proyectos | Enlace a GanttTracker (otra pestaña) | Todos |
| Inventario de equipos | Enlace a la app de inventario (otra pestaña) | Todos |
| Administración | Usuarios, roles, auditoría y configuración | Gerente, Administrador |

Cada tarjeta de Inicio abre el módulo ya filtrado. Detalle de cada módulo y sus fórmulas: `docs/PLATAFORMA.md`.
