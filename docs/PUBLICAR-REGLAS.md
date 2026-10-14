# Cómo publicar las reglas de Firestore de forma segura

**Quién:** la persona administradora del proyecto de Firebase (`inventariocomputo-eb34c`). Nadie del equipo de desarrollo asistido publicó ni publicará nada sin autorización.

## Situación de partida
- Reglas actuales: cualquier usuario autenticado lee y escribe **todo** (guardadas en `docs/reglas-anteriores.txt`).
- Mientras no publiques `firestore.rules`, los roles de la plataforma solo existen en la pantalla: cualquiera de las 5 cuentas podría escribir `usuarios_ti`, `ti_procesos` o `ti_auditoria` directamente, incluso modificar la auditoría.
- `firestore.rules` deja el inventario **exactamente como hoy** (la última regla copia la actual) y protege solo las colecciones nuevas (`ti_*` y `usuarios_ti`).

## Antes de publicar (en este orden)
1. **Ejecuta las pruebas de reglas** en una máquina con internet y Java 11+:
   `cd tests && npm install && npm run test:reglas`
   Deben pasar todas. Estas pruebas **no se han ejecutado nunca**: si alguna falla, no publiques y avisa (puede haber un error en las reglas).
2. **Simulador de reglas** (consola de Firebase → Firestore Database → Reglas → "Simulador de reglas"). Comprueba, con la ruta y un usuario autenticado de tu proyecto:
   | Operación | Ruta | Resultado esperado |
   |---|---|---|
   | get | `/equipos/EQ1` | Permitido |
   | list | `/equipos` | Permitido |
   | get | `/usuarios_ti/<correo-del-usuario-simulado>` | Permitido (su propio registro) |
   | get | `/ti_procesos/PRO-001` | **Denegado** (sin rol) |
   | create | `/ti_auditoria/x` | **Denegado** (sin rol) |
3. Elige un momento de poco uso. Las reglas pueden tardar hasta un minuto en aplicarse.

## Publicar
Consola de Firebase → Firestore Database → Reglas → pega el contenido de `firestore.rules` → **Publicar**.

## Después de publicar (prueba rápida)
1. Entra a la app de inventario con una cuenta normal y abre Inventario, Reparaciones, Celulares, Licencias, Personal y Etiquetas: deben cargar y guardar como siempre.
2. Entra a la plataforma (`…/inventario-ti/ti/`) con `ramaya@cafiver.com.mx` → "Administración" → "Crear mi registro" (queda como **Gerente de TI**). Después pulsa "Asignar roles iniciales al equipo": `vlopez@`, `aosorio@`, `soportetecnico@` y `dgomez@cafiver.com.mx` quedan como **Consultor de TI**. Cada correo debe existir en Firebase Authentication (Authentication → Usuarios); `dgomez@` es una cuenta nueva que quizá haya que crear. `soportetec@` (Daniela Gomez Aleluya) no recibe rol de plataforma; se le puede asignar uno desde la misma pantalla.
3. Con otra cuenta sin rol, comprueba que los menús nuevos no aparecen.

## Si algo falla: revertir
Pega `docs/reglas-anteriores.txt` en la consola de Firebase y publica. Las colecciones nuevas se conservan (no se borran), solo vuelven a quedar abiertas.

## Orden con respecto al código
El código de la plataforma está en la carpeta `ti/` de la rama `claude/wonderful-newton-rr6o79` y **no está fusionado ni publicado**. La app de inventario (`index.html`) **no se modificó**: fusionar la rama solo agrega la carpeta `ti/` y archivos de documentación y pruebas. Publicar las reglas antes o después de fusionar no rompe el inventario: no usa las colecciones nuevas. Lo seguro es: probar reglas → publicar reglas → fusionar la rama → primer ingreso del administrador en `…/inventario-ti/ti/`.

## Dashboard de Inicio y el inventario
El dashboard **lee** la colección `equipos` solo cuando el Director o el Administrador pulsan "Actualizar desde el inventario" (una lectura por equipo) y guarda el resultado en `ti_resumenes/inventario`. Con la regla actual, cualquier usuario autenticado puede leerla, así que funciona. **Si más adelante se endurecen las reglas del inventario, hay que permitir que el Director y el Administrador lean `equipos`**; de lo contrario el dashboard mostrará "sin permiso" en esa sección (el resto sigue funcionando).

## Límites que debes conocer
- Un Administrador puede asignarse a sí mismo cualquier rol (incluido Director). La separación de funciones impide que apruebe lo que él editó, pero no impide que tenga ambos roles.
- Las reglas no pueden verificar el contenido de campos calculados por la app (por ejemplo `documentado` o `proximaRevision`): un usuario con permiso de edición sobre un proceso podría alterarlos. Quedan registrados en el historial y la auditoría.
- La auditoría la escribe el navegador: un cliente modificado podría omitir un evento. La versión a prueba de omisiones requiere Cloud Functions (plan Blaze, facturable).


## Mesa de ayuda (Fase 5): qué agregan las reglas
`firestore.rules` ahora también protege `ti_tickets` (con `comentarios` e `historial`) y `ti_config/tickets`, y permite que cualquier usuario activo incremente `tickets` en `ti_config/contadores`. Antes de publicar, ejecuta `tests/reglas.test.js` (incluye los casos de tickets) y, en el **Simulador de reglas** de la consola, prueba al menos: un solicitante leyendo un ticket ajeno (denegado), un técnico cancelando un ticket (denegado), un solicitante leyendo un comentario interno (denegado) y el administrador guardando `ti_config/tickets` (permitido). Sin publicar estas reglas la mesa de ayuda fallará con "permiso denegado".

## Gestión de cambios (Fase 6)
Las reglas agregan `ti_cambios` (con `historial`) y el folio `cambios` en `ti_config/contadores`. Prueba en el Simulador: un consultor aprobando su propio cambio (denegado), un consultor leyendo el cambio de otro (denegado), un consultor enviando un borrador sin plan de reversa (denegado) y el Gerente aprobando un cambio ajeno pendiente (permitido).

## Proveedores y contratos (Fase 8)
Las reglas agregan `ti_proveedores`, `ti_contratos` (con `historial`), `ti_config/proveedores` y los folios `proveedores` y `contratos` en `ti_config/contadores` (la regla de folios se reescribió: cada folio sube de uno en uno y no toca los demás). Prueba en el Simulador: un consultor aprobando su propio contrato (denegado), editando el monto de un contrato vigente (denegado), leyendo el contrato de otro consultor (denegado) y el Gerente aprobando un contrato ajeno pendiente (permitido). Vuelve a probar también el catálogo inicial de procesos, porque usa el folio `procesos`.
