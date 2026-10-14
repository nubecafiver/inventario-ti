/* CAFIVER TI — Inicio: dashboard con datos reales.
   Procesos: de la misma suscripción que el módulo de Procesos (no duplica lecturas).
   Inventario: SOLO LECTURA de `equipos`, y solo cuando alguien pulsa "Actualizar desde el inventario": el resultado se guarda
   como un resumen (ti_resumenes/inventario) que el resto de las visitas lee con UNA sola lectura. No modifica el inventario. */
(function () {
  'use strict';
  var TI = window.TI, L = TI.L, esc = TI.esc;
  var DIAS_DESACTUALIZADO = 30;
  var INV = { resumen: null, leido: false, cargando: false, actualizando: false, error: '' };
  var el = null;

  TI.registrarVista('ti-inicio', {
    permitido: function () { return true; },
    render: function (contenedor) {
      el = contenedor;
      if (TI.user && L.tiene(TI.user, 'procesos.ver_publicados') || TI.user && L.tiene(TI.user, 'procesos.ver')) {
        if (TI.datosProcesos) { TI.datosProcesos.asegurar(); TI.datosProcesos.alCambiar(repintarSiVisible); }
      }
      if (TI.user && L.tiene(TI.user, 'inventario.resumen')) leerResumen();
      if (TI.user && TI.datosTickets && (L.tiene(TI.user, 'tickets.ver_propios') || L.tiene(TI.user, 'tickets.ver_todos'))) { TI.datosTickets.asegurar(); TI.datosTickets.alCambiar(repintarSiVisible); }
      if (TI.user && TI.datosCambios && (L.tiene(TI.user, 'cambios.ver_todos'))) { TI.datosCambios.asegurar(); TI.datosCambios.alCambiar(repintarSiVisible); }
      if (TI.user && TI.datosContratos && L.tiene(TI.user, 'contratos.ver_todos')) { TI.datosContratos.asegurar(); TI.datosContratos.alCambiar(repintarSiVisible); }
      if (TI.user && TI.datosRespaldos && L.tiene(TI.user, 'respaldos.ver_todos')) { TI.datosRespaldos.asegurar(); TI.datosRespaldos.alCambiar(repintarSiVisible); }
      pintar();
    },
    destruir: function () { INV = { resumen: null, leido: false, cargando: false, actualizando: false, error: '' }; el = null; }
  });
  function repintarSiVisible() { if (el && !el.classList.contains('hidden')) pintar(); }

  /* ===== Inventario: resumen guardado (1 lectura por sesión) y actualización manual ===== */
  function leerResumen() {
    if (INV.leido || INV.cargando) return;
    INV.cargando = true; INV.error = '';
    db.collection('ti_resumenes').doc('inventario').get().then(function (d) { INV.resumen = d.exists ? d.data() : null; INV.leido = true; })
      .catch(function (e) { INV.error = e.code === 'permission-denied' ? 'permiso' : (TI.errTxt(e) || 'error'); })
      .then(function () { INV.cargando = false; repintarSiVisible(); });
  }
  /* Lee TODOS los equipos (una lectura por equipo) y guarda el resumen. Solo se hace cuando una persona lo pide. */
  function actualizarDesdeInventario() {
    if (INV.actualizando) return;
    TI.confirmar('Actualizar el resumen del inventario', 'Se leerán todos los equipos del inventario una sola vez (una lectura por equipo) y se guardará un resumen. Hazlo cuando haya cambios importantes (altas, bajas, asignaciones); no hace falta a diario.', 'Actualizar ahora', function () {
      INV.actualizando = true; INV.error = ''; repintarSiVisible();
      db.collection('equipos').get().then(function (snap) {
        var lista = snap.docs.map(function (d) { return d.data(); }), datos = L.indicadoresInventario(lista, L.hoyISO());
        var batch = db.batch(), ref = db.collection('ti_resumenes').doc('inventario');
        var doc = { calculadoEn: TI.serverTs(), calculadoMs: Date.now(), calculadoPor: TI.user.email, equiposLeidos: lista.length, datos: datos };
        batch.set(ref, doc);
        TI.auditar(batch, { accion: 'actualizar_resumen_inventario', tipo: 'resumen', id: 'inventario', detalle: lista.length + ' equipos leídos' });
        return batch.commit().then(function () { INV.resumen = doc; INV.leido = true; TI.msg('Resumen actualizado (' + lista.length + ' equipos leídos)'); });
      }).catch(function (e) { INV.error = e.code === 'permission-denied' ? 'permiso' : (TI.errTxt(e) || 'error'); })
        .then(function () { INV.actualizando = false; repintarSiVisible(); });
    });
  }

  /* ===== Piezas ===== */
  function sem(clase, icono, texto) { return '<span class="ti-sem ' + clase + '"><i class="ti ' + icono + '" aria-hidden="true"></i>' + esc(texto) + '</span>'; }
  function tarjeta(o) {
    var cuerpo = '<div class="ti-kl">' + esc(o.titulo) + '</div><div class="ti-kv">' + o.valor + '</div>' + (o.sub ? '<div class="ti-kd">' + esc(o.sub) + '</div>' : '') + (o.sem ? '<div class="ti-sembox">' + o.sem + '</div>' : '');
    if (o.nav) return '<button class="ti-kpi" data-nav="' + esc(o.nav) + '">' + cuerpo + '</button>';
    if (o.rnav) return '<button class="ti-kpi" data-rnav="' + esc(o.rnav) + '">' + cuerpo + '</button>';
    if (o.pnav) return '<button class="ti-kpi" data-pnav="' + esc(o.pnav) + '">' + cuerpo + '</button>';
    if (o.cnav) return '<button class="ti-kpi" data-cnav="' + esc(o.cnav) + '">' + cuerpo + '</button>';
    if (o.tnav) return '<button class="ti-kpi" data-tnav="' + esc(o.tnav) + '">' + cuerpo + '</button>';
    return '<div class="ti-kpi ti-kpi-fija' + (o.nd ? ' ti-nd' : '') + '"' + (o.nd ? ' role="group" aria-label="' + esc(o.titulo) + ': no disponible"' : '') + '>' + cuerpo + '</div>';
  }
  function pct(n, total, minimo) { return total >= minimo ? Math.round(n / total * 100) + '%' : n + ' de ' + total; }

  /* ===== Requiere atención (según rol) ===== */
  function atencion(lista) {
    var u = TI.user, hoy = L.hoyISO(), items = [], vistos = {};
    function add(p, motivo, clase, icono) { if (vistos[p.id]) return; vistos[p.id] = 1; items.push({ p: p, motivo: motivo, clase: clase, icono: icono }); }
    var venc = function (p) { return L.vigente(p.estado) && p.proximaRevision && p.proximaRevision < hoy; };
    if (L.tiene(u, 'procesos.aprobar')) lista.filter(function (p) { return p.estado === 'pendiente_aprobacion'; }).forEach(function (p) { add(p, 'Espera tu decisión', 'warn', 'ti-hourglass'); });
    if (L.tiene(u, 'procesos.aprobar') || L.tiene(u, 'procesos.editar_todos') || L.tiene(u, 'procesos.editar_propios')) {
      /* El Director supervisa todas las revisiones vencidas; quien edita, las de sus procesos. */
      lista.filter(function (p) { return venc(p) && (L.tiene(u, 'procesos.aprobar') || L.esEditor(u, p)); }).forEach(function (p) { add(p, 'Revisión vencida desde ' + TI.fecha(p.proximaRevision), 'bad', 'ti-clock-exclamation'); });
    }
    if (L.tiene(u, 'procesos.editar_propios') && !L.tiene(u, 'procesos.editar_todos')) {
      lista.filter(function (p) { return L.esPropietario(u, p) && p.estado === 'borrador'; }).forEach(function (p) { add(p, 'Borrador por completar', 'n', 'ti-edit'); });
      lista.filter(function (p) { return L.esPropietario(u, p) && p.estado === 'en_revision'; }).forEach(function (p) { add(p, 'En revisión: falta solicitar aprobación', 'n', 'ti-eye-check'); });
    }
    return items;
  }

  /* ===== Pintado ===== */
  function pintar() {
    if (!el) return;
    var u = TI.user, h = '', verProcesos = !!(u && L.tiene(u, 'procesos.ver')), verPublicados = !!(u && L.tiene(u, 'procesos.ver_publicados'));
    var nombre = (window.curUser && curUser.name) || '';
    h += '<div class="ti-home"><div class="ti-head"><div><h1 class="ti-h1">Hola, ' + esc(nombre) + '</h1><div class="ti-sub">Resumen de la operación de TI · ' + esc(new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })) + '</div></div></div>';
    if (TI.estado === 'error') h += '<div class="ti-note err"><b>No se pudo leer tu rol.</b> Si las reglas de seguridad aún no se publicaron o tu sesión expiró, vuelve a iniciar sesión. Mientras tanto puedes usar el Inventario de equipos.</div>';
    else if (TI.estado === 'sin-registro' && !TI.pendienteBootstrap) h += '<div class="ti-note warn"><b>Tu cuenta aún no tiene un rol en esta plataforma.</b> Pide a la persona administradora que te lo asigne. Mientras tanto puedes usar el Inventario de equipos.</div>';
    else if (TI.estado === 'inactivo') h += '<div class="ti-note warn"><b>Tu usuario está desactivado en la plataforma.</b> Contacta a la persona administradora.</div>';
    else if (TI.pendienteBootstrap) h += '<div class="ti-note warn"><b>Configuración inicial pendiente.</b> Abre Administración y crea tu registro de administrador.</div>';

    if (verProcesos) h += seccionProcesos();
    if (u && L.tiene(u, 'tickets.ver_todos')) h += seccionTickets();
    else if (u && L.tiene(u, 'tickets.ver_propios')) h += seccionMisTickets();
    if (u && L.tiene(u, 'cambios.ver_todos')) h += seccionCambios();
    if (u && L.tiene(u, 'contratos.ver_todos')) h += seccionContratos();
    if (u && L.tiene(u, 'respaldos.ver_todos')) h += seccionRespaldos();
    if (u && L.tiene(u, 'inventario.resumen')) h += seccionInventario();
    h += seccionAccesos(u, verProcesos || verPublicados);
    h += '<div class="ti-note">IA, SAP y otros módulos aparecerán aquí cuando se construyan. Todavía no hay metas ni tendencias: no existe un histórico guardado de los indicadores.</div></div>';
    var foco = document.activeElement && document.activeElement.dataset && (document.activeElement.dataset.nav || document.activeElement.dataset.tnav || document.activeElement.dataset.cnav || document.activeElement.dataset.pnav || document.activeElement.dataset.rnav || document.activeElement.id);
    el.innerHTML = h; ligar();
    if (foco) { var x = el.querySelector('[data-nav="' + foco + '"]') || el.querySelector('[data-tnav="' + foco + '"]') || el.querySelector('[data-cnav="' + foco + '"]') || el.querySelector('[data-pnav="' + foco + '"]') || el.querySelector('[data-rnav="' + foco + '"]') || (foco.charAt && el.querySelector('#' + foco)); if (x) x.focus(); }
  }

  function seccionProcesos() {
    var lista = TI.datosProcesos ? TI.datosProcesos.lista() : [], err = TI.datosProcesos && TI.datosProcesos.error();
    var h = '<section class="ti-seccion" aria-labelledby="s-proc"><h2 class="ti-h2" id="s-proc">Requiere tu atención</h2>';
    if (err === 'permiso') return h + '<div class="ti-note err">Sin acceso a los procesos: es posible que las reglas de seguridad aún no estén publicadas.</div></section>';
    if (err) return h + '<div class="ti-note err">No se pudieron leer los procesos: ' + esc(err) + '</div></section>';
    var items = atencion(lista);
    if (!items.length) h += '<div class="ti-card"><div class="ti-empty">Nada pendiente por ahora.</div></div>';
    else h += '<div class="ti-card"><ul class="ti-atn">' + items.slice(0, 8).map(function (i) { return '<li><button class="ti-atn-b" data-abrir="' + esc(i.p.id) + '"><span><b>' + esc(i.p.nombre) + '</b><small>' + esc(i.p.codigo || i.p.id) + '</small></span>' + sem(i.clase, i.icono, i.motivo) + '</button></li>'; }).join('') + '</ul>' + (items.length > 8 ? '<div class="ti-kd" style="padding:8px 12px">Y ' + (items.length - 8) + ' más en Procesos y procedimientos.</div>' : '') + '</div>';
    h += '</section>';
    var ind = L.indicadores(lista), vacio = !lista.length;
    h += '<section class="ti-seccion" aria-labelledby="s-ind"><h2 class="ti-h2" id="s-ind">Procesos y procedimientos</h2>';
    if (vacio) return h + '<div class="ti-card"><div class="ti-empty">Aún no hay procesos registrados. Crea el primero o carga el catálogo inicial en Procesos y procedimientos.</div></div></section>';
    var doc = ind.porcentajeDocumentados === null ? ind.documentados + ' de ' + ind.registrados : ind.porcentajeDocumentados + '%';
    h += '<div class="ti-kpis">' +
      tarjeta({ nav: 'registrados', titulo: 'Procesos registrados', valor: ind.registrados, sub: 'No obsoletos' }) +
      tarjeta({ nav: 'documentados', titulo: 'Documentados', valor: doc, sub: ind.porcentajeDocumentados === null ? 'Muestra insuficiente (se requieren ≥' + L.MIN_MUESTRA + ' procesos)' : ind.documentados + ' de ' + ind.registrados + ' procesos' }) +
      tarjeta({ nav: 'pendientesAprobacion', titulo: 'Pendientes de aprobación', valor: ind.pendientesAprobacion, sem: ind.pendientesAprobacion ? sem('warn', 'ti-hourglass', 'Requiere decisión') : sem('ok', 'ti-circle-check', 'Al día') }) +
      tarjeta({ nav: 'revisionVencida', titulo: 'Revisión vencida', valor: ind.revisionVencida, sem: ind.revisionVencida ? sem('bad', 'ti-alert-octagon', 'Atención') : sem('ok', 'ti-circle-check', 'Al día') }) +
      tarjeta({ nav: 'proximosRevision', titulo: 'Revisión en ' + L.VENTANA_DIAS + ' días', valor: ind.proximosRevision, sub: 'Vigentes próximos a revisar' }) +
      tarjeta({ nav: 'publicados', titulo: 'Publicados vigentes', valor: ind.publicados }) +
      tarjeta({ nav: 'enRevision', titulo: 'En revisión', valor: ind.enRevision }) +
      tarjeta({ nav: 'sinRespaldo', titulo: 'Dependen de una persona', valor: ind.sinRespaldo, sem: ind.sinRespaldo ? sem('warn', 'ti-user-exclamation', 'Riesgo') : sem('ok', 'ti-circle-check', 'Cubierto') }) + '</div>';
    return h + '</section>';
  }

  /* ===== Mesa de ayuda ===== */
  function seccionTickets() {
    var D = TI.datosTickets, err = D && D.error(), h = '<section class="ti-seccion" aria-labelledby="s-tk"><div class="ti-seccion-h"><h2 class="ti-h2" id="s-tk">Mesa de ayuda</h2><button class="btn btn-sm" data-ir="ti-tickets">Abrir mesa de ayuda</button></div>';
    if (err === 'permiso') return h + '<div class="ti-note err">Sin acceso a los tickets: es posible que las reglas de seguridad aún no estén publicadas.</div></section>';
    if (err) return h + '<div class="ti-note err">No se pudieron leer los tickets: ' + esc(err) + '</div></section>';
    var lista = D.lista(), cfg = D.config(), i = L.indicadoresTickets(lista, cfg, Date.now());
    if (!lista.length) return h + '<div class="ti-card"><div class="ti-empty">Aún no hay tickets. Aparecerán aquí cuando se creen.</div></div></section>';
    var sla = i.slaConfigurado, nc = '<span class="ti-ndv">No disponible</span>';
    h += '<div class="ti-kpis">' +
      tarjeta({ tnav: 'abiertos', titulo: 'Tickets abiertos', valor: i.abiertos, sub: i.sinAsignar + ' sin asignar' }) +
      tarjeta({ tnav: 'criticos', titulo: 'Críticos abiertos', valor: i.criticos, sem: i.criticos ? sem('bad', 'ti-alert-octagon', 'Atención') : sem('ok', 'ti-circle-check', 'Sin críticos') }) +
      tarjeta({ tnav: 'sinAsignar', titulo: 'Sin asignar', valor: i.sinAsignar, sem: i.sinAsignar ? sem('warn', 'ti-user-exclamation', 'Requiere asignación') : sem('ok', 'ti-circle-check', 'Todos asignados') }) +
      (sla ? tarjeta({ tnav: 'vencidos', titulo: 'SLA vencido', valor: i.vencidos, sem: i.vencidos ? sem('bad', 'ti-alert-triangle', 'Fuera de plazo') : sem('ok', 'ti-circle-check', 'En plazo') }) +
        tarjeta({ tnav: 'porVencer', titulo: 'SLA por vencer', valor: i.porVencer, sem: i.porVencer ? sem('warn', 'ti-clock-exclamation', 'Por vencer') : '' })
        : tarjeta({ nd: true, titulo: 'SLA vencido / por vencer', valor: nc, sub: 'SLA no configurado: el administrador define los plazos en Administración › Mesa de ayuda.' })) +
      tarjeta({ nd: i.tiempoMedioResolucionHoras === null, titulo: 'Tiempo medio de resolución', valor: i.tiempoMedioResolucionHoras === null ? nc : i.tiempoMedioResolucionHoras + ' h', sub: i.tiempoMedioResolucionHoras === null ? 'Muestra insuficiente (' + i.resueltosEnPeriodo + ' resueltos en ' + i.ventanaDias + ' días; se requieren ≥' + i.muestraMinima + ')' : i.resueltosEnPeriodo + ' resueltos en ' + i.ventanaDias + ' días, sin contar esperas' }) +
      tarjeta({ nd: i.cumplimientoSLA === null, titulo: 'Cumplimiento de SLA', valor: i.cumplimientoSLA === null ? nc : i.cumplimientoSLA + '%', sub: i.cumplimientoSLA === null ? (sla ? 'Muestra insuficiente (' + i.evaluablesSLA + ' evaluables; se requieren ≥' + i.muestraMinima + ')' : 'SLA no configurado') : i.cumplidosSLA + ' de ' + i.evaluablesSLA + ' resueltos con SLA' }) + '</div>';
    var rs = Object.keys(i.porResponsable).sort();
    if (rs.length) h += '<div class="ti-card" style="margin-top:12px;padding:12px 14px"><div class="ti-kl" style="margin-bottom:6px">Abiertos por responsable</div><div class="ti-resp">' + rs.map(function (r) { return '<span class="ti-sem n">' + esc(r === '(sin asignar)' ? 'Sin asignar' : TI.nombreDe(r)) + ': <b>' + i.porResponsable[r] + '</b></span>'; }).join(' ') + '</div></div>';
    return h + '</section>';
  }
  function seccionMisTickets() {
    var D = TI.datosTickets, lista = D ? D.lista() : [], ab = lista.filter(function (t) { return L.TICKET_ABIERTOS.indexOf(t.estado) >= 0; }).length, res = lista.filter(function (t) { return t.estado === 'resuelto'; }).length;
    return '<section class="ti-seccion" aria-labelledby="s-tk"><div class="ti-seccion-h"><h2 class="ti-h2" id="s-tk">Mis solicitudes</h2><button class="btn btn-sm" data-ir="ti-tickets">Abrir mesa de ayuda</button></div><div class="ti-kpis">' +
      tarjeta({ tnav: 'abiertos', titulo: 'Abiertas', valor: ab }) + tarjeta({ titulo: 'Esperan tu confirmación', valor: res, sem: res ? sem('warn', 'ti-hourglass', 'Confirma si quedó resuelto') : '' }) + '</div></section>';
  }

  function seccionCambios() {
    var D = TI.datosCambios, err = D && D.error(), h = '<section class="ti-seccion" aria-labelledby="s-cm"><div class="ti-seccion-h"><h2 class="ti-h2" id="s-cm">Gestión de cambios</h2><button class="btn btn-sm" data-ir="ti-cambios">Abrir gestión de cambios</button></div>';
    if (err === 'permiso') return h + '<div class="ti-note err">Sin acceso a los cambios: es posible que las reglas de seguridad aún no estén publicadas.</div></section>';
    if (err) return h + '<div class="ti-note err">No se pudieron leer los cambios: ' + esc(err) + '</div></section>';
    var lista = D.lista(), i = L.indicadoresCambios(lista, Date.now());
    if (!lista.length) return h + '<div class="ti-card"><div class="ti-empty">Aún no hay cambios registrados.</div></div></section>';
    h += '<div class="ti-kpis">' +
      tarjeta({ cnav: 'abiertos', titulo: 'Cambios abiertos', valor: i.abiertos }) +
      tarjeta({ cnav: 'pendientesAprobacion', titulo: 'Pendientes de aprobación', valor: i.pendientesAprobacion, sem: i.pendientesAprobacion ? sem('warn', 'ti-hourglass', 'Requiere decisión') : sem('ok', 'ti-circle-check', 'Al día') }) +
      tarjeta({ cnav: 'programados7d', titulo: 'Programados en 7 días', valor: i.programados7d }) +
      tarjeta({ cnav: 'vencidos', titulo: 'Ventana vencida', valor: i.vencidos, sem: i.vencidos ? sem('bad', 'ti-alert-triangle', 'Sin implementar') : sem('ok', 'ti-circle-check', 'Sin vencidos') }) +
      tarjeta({ cnav: 'emergencias', titulo: 'Emergencias', valor: i.emergencias, sub: 'No canceladas' }) +
      tarjeta({ nd: i.tasaExito === null, titulo: 'Tasa de éxito', valor: i.tasaExito === null ? '<span class="ti-ndv">No disponible</span>' : i.tasaExito + '%', sub: i.tasaExito === null ? 'Muestra insuficiente (' + i.finalizados + ' finalizados en ' + i.ventanaDias + ' días; se requieren ≥' + i.muestraMinima + ')' : i.exitosos + ' de ' + i.finalizados + ' sin falla' }) + '</div>';
    return h + '</section>';
  }

  function seccionContratos() {
    var D = TI.datosContratos, err = D && D.error(), h = '<section class="ti-seccion" aria-labelledby="s-ct"><div class="ti-seccion-h"><h2 class="ti-h2" id="s-ct">Proveedores y contratos</h2><button class="btn btn-sm" data-ir="ti-proveedores">Abrir proveedores y contratos</button></div>';
    if (err === 'permiso') return h + '<div class="ti-note err">Sin acceso a los contratos: es posible que las reglas de seguridad aún no estén publicadas.</div></section>';
    if (err) return h + '<div class="ti-note err">No se pudieron leer los contratos: ' + esc(err) + '</div></section>';
    var lista = D.lista(), i = L.indicadoresContratos(lista, L.hoyISO(), D.config());
    if (!lista.length) return h + '<div class="ti-card"><div class="ti-empty">Aún no hay contratos registrados.</div></div></section>';
    var mon = Object.keys(i.montoAnual);
    h += '<div class="ti-kpis">' +
      tarjeta({ pnav: 'vigentes', titulo: 'Contratos vigentes', valor: i.vigentes }) +
      tarjeta({ pnav: 'porVencer', titulo: 'Por vencer (' + D.config().avisoVencimientoDias + ' días)', valor: i.porVencer, sem: i.porVencer ? sem('warn', 'ti-clock-exclamation', 'Renovar o terminar') : sem('ok', 'ti-circle-check', 'Sin pendientes') }) +
      tarjeta({ pnav: 'vencidos', titulo: 'Vencidos', valor: i.vencidos, sem: i.vencidos ? sem('bad', 'ti-alert-triangle', 'Atención') : sem('ok', 'ti-circle-check', 'Sin vencidos') }) +
      tarjeta({ pnav: 'sinDocumento', titulo: 'Sin documento', valor: i.sinDocumento, sem: i.sinDocumento ? sem('warn', 'ti-file-alert', 'Falta el enlace') : '' }) +
      tarjeta({ pnav: 'pendientesAprobacion', titulo: 'Pendientes de aprobación', valor: i.pendientesAprobacion }) +
      tarjeta({ nd: !mon.length, titulo: 'Monto anual vigente', valor: mon.length ? mon.map(function (m) { return esc(new Intl.NumberFormat('es-MX', { style: 'currency', currency: m }).format(i.montoAnual[m])); }).join('<br>') : '<span class="ti-ndv">No disponible</span>', sub: mon.length ? 'Por moneda, sin conversión; mensual ×12 + anual' : 'No hay contratos vigentes con monto recurrente' }) + '</div>';
    return h + '</section>';
  }

  function seccionRespaldos() {
    var D = TI.datosRespaldos, err = D && D.error(), h = '<section class="ti-seccion" aria-labelledby="s-rs"><div class="ti-seccion-h"><h2 class="ti-h2" id="s-rs">Respaldos</h2><button class="btn btn-sm" data-ir="ti-respaldos">Abrir respaldos</button></div>';
    if (err === 'permiso') return h + '<div class="ti-note err">Sin acceso a los respaldos: es posible que las reglas de seguridad aún no estén publicadas.</div></section>';
    if (err) return h + '<div class="ti-note err">No se pudieron leer los respaldos: ' + esc(err) + '</div></section>';
    var lista = D.lista(), i = L.indicadoresRespaldos(lista, Date.now(), D.config());
    if (!lista.length) return h + '<div class="ti-card"><div class="ti-empty">No hay trabajos de respaldo registrados: <b>no se está vigilando ningún respaldo</b>. Esta plataforma solo registra los que se hacen con otras herramientas.</div></div></section>';
    h += '<div class="ti-kpis">' +
      tarjeta({ rnav: 'activos', titulo: 'Trabajos activos', valor: i.activos, sub: i.alDia + ' al día' }) +
      tarjeta({ rnav: 'atrasados', titulo: 'Atrasados', valor: i.atrasados, sem: i.atrasados ? sem('warn', 'ti-clock-exclamation', 'Falta ejecución') : sem('ok', 'ti-circle-check', 'Sin atrasos') }) +
      tarjeta({ rnav: 'fallidos', titulo: 'Último fallido', valor: i.fallidos, sem: i.fallidos ? sem('bad', 'ti-alert-triangle', 'Atención') : sem('ok', 'ti-circle-check', 'Sin fallas') }) +
      tarjeta({ rnav: 'sinRegistros', titulo: 'Sin registros', valor: i.sinRegistros, sem: i.sinRegistros ? sem('bad', 'ti-help-circle', 'No hay evidencia') : sem('ok', 'ti-circle-check', 'Todos con registros') }) +
      tarjeta({ rnav: 'pruebasVencidas', titulo: 'Prueba de restauración pendiente', valor: i.pruebasVencidas + i.pruebasNunca, sub: 'Nunca probada, vencida o fallida' }) +
      tarjeta({ nd: i.coberturaPruebas === null, titulo: 'Cobertura de pruebas', valor: i.coberturaPruebas === null ? '<span class="ti-ndv">No disponible</span>' : i.coberturaPruebas + '%', sub: i.coberturaPruebas === null ? 'Muestra insuficiente (' + i.activos + ' activos; se requieren ≥' + i.muestraMinima + '): ' + i.pruebasVigentes + ' de ' + i.activos + ' con prueba vigente' : i.pruebasVigentes + ' de ' + i.activos + ' con prueba exitosa vigente' }) + '</div>';
    return h + '</section>';
  }

  function edadResumen() {
    var r = INV.resumen; if (!r || !r.calculadoMs) return '';
    var min = Math.max(0, Math.round((Date.now() - r.calculadoMs) / 60000)), dias = Math.floor(min / 1440);
    var cuando = min < 1 ? 'hace menos de 1 minuto' : min < 60 ? 'hace ' + min + ' min' : min < 1440 ? 'hace ' + Math.floor(min / 60) + ' h' : 'hace ' + dias + (dias === 1 ? ' día' : ' días');
    return 'Resumen calculado ' + cuando + ' (' + new Date(r.calculadoMs).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) + ') por ' + TI.nombreDe(r.calculadoPor) + ' · ' + r.equiposLeidos + ' equipos leídos';
  }
  function seccionInventario() {
    var h = '<section class="ti-seccion" aria-labelledby="s-inv"><div class="ti-seccion-h"><h2 class="ti-h2" id="s-inv">Inventario de equipos</h2>' +
      '<button class="btn btn-sm" id="inv-act"' + (INV.actualizando ? ' disabled' : '') + ' title="Lee todos los equipos una vez y guarda el resumen">' + (INV.actualizando ? 'Actualizando…' : 'Actualizar desde el inventario') + '</button>' +
      '<a class="btn btn-sm" href="../index.html" target="_blank" rel="noopener">Abrir inventario <i class="ti ti-external-link" aria-hidden="true"></i></a></div>';
    if (INV.error === 'permiso') return h + '<div class="ti-note err">No se pudo leer o guardar el resumen del inventario: sin permiso. Los indicadores de procesos no se ven afectados.</div></section>';
    if (INV.error) return h + '<div class="ti-note err">No se pudo completar la operación con el inventario: ' + esc(INV.error) + '. Los indicadores de procesos no se ven afectados.</div></section>';
    if (!INV.leido) return h + '<div class="ti-card"><div class="ti-empty" role="status">Cargando el resumen…</div></div></section>';
    if (!INV.resumen) return h + '<div class="ti-card"><div class="ti-empty">Todavía no se ha calculado el resumen del inventario. Pulsa "Actualizar desde el inventario": leerá todos los equipos una vez y guardará el resumen.</div></div></section>';
    var d = INV.resumen.datos, dias = (Date.now() - INV.resumen.calculadoMs) / 86400000;
    h += '<div class="ti-kd" id="inv-edad" style="margin:-4px 0 10px">' + esc(edadResumen()) + (dias > DIAS_DESACTUALIZADO ? ' · <b>Puede estar desactualizado</b>' : '') + '</div>';
    if (!d.total) return h + '<div class="ti-card"><div class="ti-empty">El inventario no tenía equipos registrados cuando se calculó el resumen.</div></div></section>';
    var min = d.muestraMinima, sinMuestra = d.activos < min;
    h += '<div class="ti-kpis">' +
      tarjeta({ titulo: 'Equipos registrados', valor: d.total, sub: d.dadosDeBaja + ' dados de baja' }) +
      tarjeta({ titulo: 'Equipos activos', valor: d.activos, sub: 'Estado distinto de Baja' }) +
      tarjeta({ titulo: 'Con responsable', valor: pct(d.conResponsable, d.activos, min), sub: d.sinResponsable + ' sin responsable registrado', sem: d.sinResponsable ? sem('warn', 'ti-user-exclamation', 'Requiere asignación') : sem('ok', 'ti-circle-check', 'Todos asignados') }) +
      tarjeta({ titulo: 'En buen estado', valor: pct(d.bueno, d.activos, min), sub: 'Regular ' + d.regular + ' · Malo ' + d.malo + (d.sinEstado ? ' · Sin estado ' + d.sinEstado : ''), sem: d.malo ? sem('bad', 'ti-alert-triangle', d.malo + ' en mal estado') : '' }) +
      tarjeta({ titulo: 'Vida útil vencida (≥ ' + d.vidaUtilAnios + ' años)', valor: d.vidaVencida, sub: 'Candidatos a reemplazo', sem: d.vidaVencida ? sem('bad', 'ti-alert-octagon', 'Atención') : sem('ok', 'ti-circle-check', 'Sin vencidos') }) +
      tarjeta({ titulo: 'Vida útil próxima (' + (d.vidaUtilAnios - 1) + '–' + d.vidaUtilAnios + ' años)', valor: d.vidaProxima, sub: 'Planificar reemplazo', sem: d.vidaProxima ? sem('warn', 'ti-clock', 'Próximos') : '' }) +
      tarjeta({ titulo: 'Sin fecha de compra', valor: d.sinFecha, sub: 'No entran en el cálculo de vida útil', sem: d.sinFecha ? sem('n', 'ti-info-circle', 'Datos incompletos') : '' }) +
      tarjeta({ nd: true, titulo: 'Garantías próximas a vencer', valor: '<span class="ti-ndv">No disponible</span>', sub: 'El inventario guarda la garantía como texto libre (por ejemplo "1 año"); no se puede calcular el vencimiento con certeza.' }) +
      tarjeta({ nd: true, titulo: 'Equipos en reparación', valor: '<span class="ti-ndv">No disponible</span>', sub: 'El inventario registra reparaciones terminadas, no un estado "en reparación" vigente.' }) + '</div>';
    if (sinMuestra) h += '<div class="ti-kd" style="margin-top:8px">Los porcentajes se muestran cuando hay al menos ' + min + ' equipos activos.</div>';
    return h + '</section>';
  }

  function seccionAccesos(u, verProc) {
    var h = '<section class="ti-seccion" aria-labelledby="s-acc"><h2 class="ti-h2" id="s-acc">Accesos</h2><div class="ti-cards">';
    if (verProc) h += '<div class="ti-mod"><h2><i class="ti ti-sitemap" aria-hidden="true"></i>Procesos y procedimientos</h2><p>' + (L.tiene(u, 'procesos.ver') ? 'Documenta, revisa, aprueba y publica los procedimientos del departamento de TI.' : 'Consulta los procedimientos publicados vigentes.') + '</p><button class="btn btn-blue btn-sm" data-ir="ti-procesos">Abrir</button></div>';
    if (u && (L.tiene(u, 'tickets.crear') || L.tiene(u, 'tickets.ver_todos'))) h += '<div class="ti-mod"><h2><i class="ti ti-headset" aria-hidden="true"></i>Mesa de ayuda</h2><p>' + (L.tiene(u, 'tickets.ver_todos') ? 'Atiende incidentes y solicitudes, con prioridad y SLA.' : 'Reporta un problema o pide un servicio y consulta su avance.') + '</p><button class="btn btn-blue btn-sm" data-ir="ti-tickets">Abrir</button></div>';
    if (u && (L.tiene(u, 'cambios.crear') || L.tiene(u, 'cambios.ver_todos'))) h += '<div class="ti-mod"><h2><i class="ti ti-git-pull-request" aria-hidden="true"></i>Gestión de cambios</h2><p>' + (L.tiene(u, 'cambios.ver_todos') ? 'Revisa, aprueba y da seguimiento a los cambios, con riesgo, reversa y ventana.' : 'Solicita cambios y da seguimiento a los que implementas.') + '</p><button class="btn btn-blue btn-sm" data-ir="ti-cambios">Abrir</button></div>';
    if (u && (L.tiene(u, 'contratos.crear') || L.tiene(u, 'contratos.ver_todos'))) h += '<div class="ti-mod"><h2><i class="ti ti-building-store" aria-hidden="true"></i>Proveedores y contratos</h2><p>' + (L.tiene(u, 'contratos.ver_todos') ? 'Proveedores, contratos, vigencias y montos, con aviso de vencimiento.' : 'Tus proveedores y contratos.') + '</p><button class="btn btn-blue btn-sm" data-ir="ti-proveedores">Abrir</button></div>';
    if (u && (L.tiene(u, 'respaldos.crear') || L.tiene(u, 'respaldos.ver_todos'))) h += '<div class="ti-mod"><h2><i class="ti ti-database-export" aria-hidden="true"></i>Respaldos</h2><p>' + (L.tiene(u, 'respaldos.ver_todos') ? 'Control de respaldos, ejecuciones y pruebas de restauración.' : 'Tus trabajos de respaldo.') + '</p><button class="btn btn-blue btn-sm" data-ir="ti-respaldos">Abrir</button></div>';
    h += '<div class="ti-mod"><h2><i class="ti ti-timeline" aria-hidden="true"></i>Proyectos</h2><p>Gantt, tareas, bitácora y evidencias de los proyectos de TI. Es GanttTracker, la app que ya usas, sin cambios.</p><a class="btn btn-sm" href="https://nubecafiver.github.io/-gantttracker/" target="_blank" rel="noopener">Abrir en otra pestaña <i class="ti ti-external-link" aria-hidden="true"></i></a></div>';
    h += '<div class="ti-mod"><h2><i class="ti ti-devices-pc" aria-hidden="true"></i>Inventario de equipos</h2><p>Equipos, QR, reparaciones, celulares, licencias, personal y etiquetas. Es la app de inventario que ya usas, sin cambios.</p><a class="btn btn-sm" href="../index.html" target="_blank" rel="noopener">Abrir en otra pestaña <i class="ti ti-external-link" aria-hidden="true"></i></a></div>';
    if (u && (L.tiene(u, 'usuarios.admin') || L.tiene(u, 'auditoria.ver') || TI.pendienteBootstrap)) h += '<div class="ti-mod"><h2><i class="ti ti-shield-lock" aria-hidden="true"></i>Administración</h2><p>' + (TI.pendienteBootstrap ? 'Configuración inicial pendiente: crea tu registro de administrador.' : 'Usuarios, roles y bitácora de auditoría.') + '</p><button class="btn btn-blue btn-sm" data-ir="ti-admin">Abrir</button></div>';
    return h + '</div></section>';
  }

  function ligar() {
    el.querySelectorAll('[data-nav]').forEach(function (b) { b.onclick = function () { TI.ir('ti-procesos', { kpi: b.dataset.nav }); }; });
    el.querySelectorAll('[data-tnav]').forEach(function (b) { b.onclick = function () { TI.ir('ti-tickets', { kpi: b.dataset.tnav }); }; });
    el.querySelectorAll('[data-cnav]').forEach(function (b) { b.onclick = function () { TI.ir('ti-cambios', { kpi: b.dataset.cnav }); }; });
    el.querySelectorAll('[data-pnav]').forEach(function (b) { b.onclick = function () { TI.ir('ti-proveedores', { kpi: b.dataset.pnav }); }; });
    el.querySelectorAll('[data-rnav]').forEach(function (b) { b.onclick = function () { TI.ir('ti-respaldos', { kpi: b.dataset.rnav }); }; });
    el.querySelectorAll('[data-abrir]').forEach(function (b) { b.onclick = function () { TI.ir('ti-procesos', { abrir: b.dataset.abrir }); }; });
    el.querySelectorAll('[data-ir]').forEach(function (b) { b.onclick = function () { TI.ir(b.dataset.ir); }; });
    var act = el.querySelector('#inv-act'); if (act) act.onclick = actualizarDesdeInventario;
  }
})();
