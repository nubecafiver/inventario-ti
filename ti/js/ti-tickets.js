/* CAFIVER TI — Módulo "Mesa de ayuda".
   Datos: ti_tickets/{TCK-####} · /comentarios/* · /historial/* · ti_config/tickets (categorías, SLA, horario) · ti_config/contadores.tickets
   El ticket guarda solo el ID del equipo afectado (activoId): los datos del equipo se consultan en el inventario, no se copian.
   Los SLA y el horario los configura el administrador; sin configuración no se calcula ningún plazo. */
(function () {
  'use strict';
  var TI = window.TI, L = TI.L, esc = TI.esc;
  var S = { abiertos: {}, recientes: {}, propios: {}, lista: [], cargado: false, error: '', detalle: null, el: null, filtro: vacio(), config: null };
  var oyentes = [];
  function vacio() { return { q: '', estado: '', prioridad: '', categoria: '', resp: '', kpi: '', mios: false }; }

  TI.registrarVista('ti-tickets', {
    permitido: function (u) { return L.tiene(u, 'tickets.crear') || L.tiene(u, 'tickets.ver_propios') || L.tiene(u, 'tickets.ver_todos'); },
    render: function (el, params) { render(el, params); },
    destruir: function () { S.abiertos = {}; S.recientes = {}; S.propios = {}; S.lista = []; S.cargado = false; S.error = ''; S.el = null; S.detalle = null; S.config = null; S.filtro = vacio(); oyentes = []; TI.configTickets = null; }
  });

  /* ===== Configuración (un solo documento) ===== */
  TI.cargarConfigTickets = function (forzar) {
    if (S.config && !forzar) return Promise.resolve(S.config);
    return db.collection('ti_config').doc('tickets').get().then(function (d) {
      S.config = L.normalizarConfigTickets(d.exists ? d.data() : null); S.configExiste = d.exists; TI.configTickets = S.config; return S.config;
    }).catch(function (e) { console.warn('config tickets:', e.message); S.config = L.normalizarConfigTickets(null); TI.configTickets = S.config; return S.config; });
  };
  function cfg() { return S.config || L.normalizarConfigTickets(null); }

  /* ===== Datos ===== */
  function recomponer() {
    var m = {}; [S.abiertos, S.recientes, S.propios].forEach(function (o) { Object.keys(o).forEach(function (k) { m[k] = o[k]; }); });
    S.lista = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return (b.creadoMs || 0) - (a.creadoMs || 0); });
  }
  function aMapa(snap) { var o = {}; snap.docs.forEach(function (d) { var x = d.data(); x.id = d.id; o[d.id] = x; }); return o; }
  function avisar() { oyentes.forEach(function (f) { try { f(); } catch (e) {} }); }
  function suscribir() {
    if (S.cargado) return; S.cargado = true;
    TI.cargarConfigTickets().then(function () { pintar(); avisar(); });
    function ante(clave) { return function (snap) { S[clave] = aMapa(snap); S.error = ''; recomponer(); pintar(); if (S.detalle && S.detalle.modal && document.body.contains(S.detalle.modal.el)) pintarDetalle(S.detalle); avisar(); }; }
    function falla(err) { S.error = err.code === 'permission-denied' ? 'permiso' : err.message; pintar(); avisar(); }
    var col = db.collection('ti_tickets');
    if (L.esTI(TI.user)) {
      var desde = Date.now() - L.VENTANA_TICKETS_DIAS * 86400000;
      TI.unsubs.push(col.where('estado', 'in', L.TICKET_ABIERTOS).onSnapshot(ante('abiertos'), falla));
      TI.unsubs.push(col.where('resueltoMs', '>', desde).onSnapshot(ante('recientes'), falla));
    } else {
      TI.unsubs.push(col.where('solicitanteEmail', '==', TI.user.email).onSnapshot(ante('propios'), falla));
    }
  }
  TI.datosTickets = { lista: function () { return S.lista; }, config: cfg, asegurar: suscribir, error: function () { return S.error; }, alCambiar: function (f) { if (oyentes.indexOf(f) < 0) oyentes.push(f); } };
  function porId(id) { return S.lista.filter(function (t) { return t.id === id; })[0]; }
  function refT(id) { return db.collection('ti_tickets').doc(id); }

  /* ===== Presentación ===== */
  function pillEstado(e) { return '<span class="pill ti-te ti-te-' + e + '">' + esc(L.TICKET_ESTADO_LABEL[e] || e) + '</span>'; }
  function pillPrio(p) { return '<span class="pill ti-tp ti-tp-' + esc(p) + '">' + esc(L.PRIORIDAD_LABEL[p] || p || '—') + '</span>'; }
  function dur(ms) {
    var m = Math.round(Math.abs(ms) / 60000), h = Math.floor(m / 60), r = m % 60;
    if (h >= 24 && !L.horarioValido(cfg().horario)) return Math.floor(h / 24) + ' d ' + (h % 24) + ' h';
    return h ? h + ' h' + (r ? ' ' + r + ' min' : '') : r + ' min';
  }
  /* Insignia de SLA: siempre con texto e icono, no solo color. */
  function insigniaSLA(t) {
    var s = L.estadoSLA(t, cfg(), Date.now());
    if (!s.configurado) return '<span class="ti-sem n"><i class="ti ti-minus" aria-hidden="true"></i> SLA no configurado</span>';
    var r = s.resolucion, q = s.respuesta, ab = L.TICKET_ABIERTOS.indexOf(t.estado) >= 0, txt = '';
    if (s.pausado) txt = '<span class="ti-sem n"><i class="ti ti-player-pause" aria-hidden="true"></i> En pausa</span> ';
    var peor = (q.estado === 'vencido' || r.estado === 'vencido') ? 'vencido' : (q.estado === 'por_vencer' || r.estado === 'por_vencer') ? 'por_vencer' : null;
    if (ab && peor === 'vencido') return txt + '<span class="ti-sem bad"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Vencido</span>';
    if (ab && peor === 'por_vencer') return txt + '<span class="ti-sem warn"><i class="ti ti-clock-exclamation" aria-hidden="true"></i> Por vencer</span>';
    if (ab && (r.estado === 'en_curso' || q.estado === 'en_curso')) return txt + '<span class="ti-sem ok"><i class="ti ti-check" aria-hidden="true"></i> En tiempo</span>';
    if (r.estado === 'cumplido') return '<span class="ti-sem ok"><i class="ti ti-check" aria-hidden="true"></i> Cumplido</span>';
    if (r.estado === 'incumplido') return '<span class="ti-sem bad"><i class="ti ti-x" aria-hidden="true"></i> Incumplido</span>';
    return '<span class="ti-sem n"><i class="ti ti-minus" aria-hidden="true"></i> Sin plazo</span>';
  }
  function nombreResp(t) { return t.responsable ? esc(TI.nombreDe(t.responsable)) : '<span class="ti-mut">Sin asignar</span>'; }

  /* ===== Lista ===== */
  var KPIS = [['abiertos', 'Abiertos', 'No resueltos ni cerrados.'], ['criticos', 'Críticos abiertos', 'Prioridad crítica sin resolver.'], ['sinAsignar', 'Sin asignar', 'Abiertos sin responsable.'],
    ['vencidos', 'SLA vencido', 'Requiere SLA configurado.'], ['porVencer', 'SLA por vencer', 'Dentro del margen de alerta.']];
  function filtrar() {
    var f = S.filtro, kp = f.kpi ? L.filtroTickets(f.kpi, cfg(), Date.now()) : null, q = f.q.trim().toLowerCase();
    return S.lista.filter(function (t) {
      if (kp && !kp(t)) return false;
      if (f.mios && t.solicitanteEmail !== TI.user.email && t.responsable !== TI.user.email) return false;
      if (f.estado && t.estado !== f.estado) return false;
      if (f.prioridad && t.prioridad !== f.prioridad) return false;
      if (f.categoria && t.categoria !== f.categoria) return false;
      if (f.resp && (f.resp === '__sin' ? !!t.responsable : t.responsable !== f.resp)) return false;
      if (q && (t.codigo + ' ' + t.titulo + ' ' + t.solicitanteEmail + ' ' + (t.sistema || '') + ' ' + (t.activoId || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function render(el, params) {
    S.el = el; suscribir();
    if (params && params.kpi) S.filtro = Object.assign(vacio(), { kpi: params.kpi });
    pintar();
    if (params && params.abrir) abrirDetalle(params.abrir);
  }
  function pintar() {
    var el = S.el; if (!el) return;
    var ti = L.esTI(TI.user), h = '';
    h += '<div class="ti-head"><div><h1 class="ti-h1">Mesa de ayuda</h1><div class="ti-sub">' + (ti ? 'Incidentes y solicitudes de servicio del departamento de TI.' : 'Reporta un problema o pide un servicio y da seguimiento a tus solicitudes.') + '</div></div></div>';
    if (S.error === 'permiso') { el.innerHTML = h + '<div class="ti-note err"><b>Sin acceso a los datos.</b> Tu cuenta no tiene permiso para leer tickets. Si el problema continúa, el administrador debe publicar las reglas de seguridad actualizadas de <code>firestore.rules</code>.</div>'; return; }
    if (S.error) { el.innerHTML = h + '<div class="ti-note err">No se pudo cargar: ' + esc(S.error) + '</div>'; return; }
    if (ti) {
      var ind = L.indicadoresTickets(S.lista, cfg(), Date.now());
      h += '<div class="ti-kpis">' + KPIS.map(function (k) {
        var v = ind[k[0]], sub = k[2];
        if ((k[0] === 'vencidos' || k[0] === 'porVencer') && !ind.slaConfigurado) { v = '—'; sub = 'SLA no configurado'; }
        return '<button class="ti-kpi' + (S.filtro.kpi === k[0] ? ' on' : '') + '" data-kpi="' + k[0] + '" aria-pressed="' + (S.filtro.kpi === k[0]) + '"><div class="ti-kl">' + k[1] + '</div><div class="ti-kv">' + v + '</div><div class="ti-kd">' + esc(sub) + '</div></button>';
      }).join('') + '</div>';
    }
    var resps = {}; S.lista.forEach(function (t) { if (t.responsable) resps[t.responsable] = 1; });
    h += '<div class="ti-tools"><input id="tk-q" class="fi-sm" type="search" placeholder="Buscar por folio, título, solicitante o equipo" aria-label="Buscar ticket" value="' + esc(S.filtro.q) + '" style="min-width:260px">' +
      '<select id="tk-fe" class="fi-sm" aria-label="Filtrar por estado"><option value="">Todos los estados</option>' + L.ESTADOS_TICKET.map(function (e) { return '<option value="' + e + '"' + (S.filtro.estado === e ? ' selected' : '') + '>' + L.TICKET_ESTADO_LABEL[e] + '</option>'; }).join('') + '</select>' +
      '<select id="tk-fp" class="fi-sm" aria-label="Filtrar por prioridad"><option value="">Todas las prioridades</option>' + L.PRIORIDADES.map(function (p) { return '<option value="' + p + '"' + (S.filtro.prioridad === p ? ' selected' : '') + '>' + L.PRIORIDAD_LABEL[p] + '</option>'; }).join('') + '</select>' +
      '<select id="tk-fc" class="fi-sm" aria-label="Filtrar por categoría"><option value="">Todas las categorías</option>' + cfg().categorias.map(function (c) { return '<option value="' + esc(c.id) + '"' + (S.filtro.categoria === c.id ? ' selected' : '') + '>' + esc(c.nombre) + '</option>'; }).join('') + '</select>' +
      (ti ? '<select id="tk-fr" class="fi-sm" aria-label="Filtrar por responsable"><option value="">Todos los responsables</option><option value="__sin"' + (S.filtro.resp === '__sin' ? ' selected' : '') + '>Sin asignar</option>' + Object.keys(resps).sort().map(function (r) { return '<option value="' + esc(r) + '"' + (S.filtro.resp === r ? ' selected' : '') + '>' + esc(TI.nombreDe(r)) + '</option>'; }).join('') + '</select>' +
        '<label class="ti-chk"><input type="checkbox" id="tk-mios"' + (S.filtro.mios ? ' checked' : '') + '> Solo los míos</label>' : '') +
      ((S.filtro.kpi || S.filtro.estado || S.filtro.prioridad || S.filtro.categoria || S.filtro.resp || S.filtro.q || S.filtro.mios) ? '<button class="btn btn-sm" id="tk-lim">Limpiar filtros</button>' : '') +
      '<span style="flex:1"></span>' + (ti ? '<button class="btn btn-sm" id="tk-csv">Exportar CSV</button>' : '') +
      (TI.puede('tickets.crear') ? '<button class="btn btn-blue btn-sm" id="tk-nuevo">+ Nuevo ticket</button>' : '') + '</div>';
    var rows = filtrar();
    h += '<div class="ti-card"><div class="ti-scroll"><table class="ti-table"><caption class="ti-sr">Tickets</caption><thead><tr><th>Folio</th><th>Asunto</th><th>Categoría</th>' + (ti ? '<th>Solicitante</th>' : '') + '<th>Prioridad</th><th>Estado</th>' + (ti ? '<th>Responsable</th>' : '') + '<th>SLA</th><th>Creado</th></tr></thead><tbody>';
    var cols = ti ? 9 : 7;
    if (!S.lista.length) h += '<tr><td colspan="' + cols + '" class="ti-empty">' + (ti ? 'No hay tickets abiertos ni resueltos en los últimos ' + L.VENTANA_TICKETS_DIAS + ' días.' : 'Todavía no has creado solicitudes.') + ' ' + (TI.puede('tickets.crear') ? 'Crea el primero con "Nuevo ticket".' : '') + '</td></tr>';
    else if (!rows.length) h += '<tr><td colspan="' + cols + '" class="ti-empty">Ningún ticket coincide con los filtros.</td></tr>';
    rows.forEach(function (t) {
      h += '<tr class="ti-row" tabindex="0" role="button" data-id="' + esc(t.id) + '"><td class="ti-code">' + esc(t.codigo || t.id) + '</td><td><b>' + esc(t.titulo) + '</b></td><td>' + esc(L.nombreCategoria(cfg(), t.categoria)) + '</td>' + (ti ? '<td>' + esc(TI.nombreDe(t.solicitanteEmail)) + '</td>' : '') +
        '<td>' + pillPrio(t.prioridad) + '</td><td>' + pillEstado(t.estado) + '</td>' + (ti ? '<td>' + nombreResp(t) + '</td>' : '') + '<td>' + insigniaSLA(t) + '</td><td>' + TI.fechaHora(t.creadoMs) + '</td></tr>';
    });
    h += '</tbody></table></div></div>';
    if (ti) {
      var ind2 = L.indicadoresTickets(S.lista, cfg(), Date.now());
      h += '<div class="ti-note">Se muestran los tickets abiertos y los resueltos en los últimos ' + ind2.ventanaDias + ' días. Un ticket se vence solo si su categoría y prioridad tienen un SLA configurado por el administrador; los plazos no vienen predefinidos. Tiempo medio de resolución: ' +
        (ind2.tiempoMedioResolucionHoras === null ? '<b>muestra insuficiente</b> (se requieren ≥' + ind2.muestraMinima + ' tickets resueltos; hay ' + ind2.resueltosEnPeriodo + ')' : '<b>' + ind2.tiempoMedioResolucionHoras + ' h</b> (' + ind2.resueltosEnPeriodo + ' resueltos, sin contar las esperas)') +
        '. Cumplimiento de SLA: ' + (ind2.cumplimientoSLA === null ? '<b>no disponible</b> (' + (ind2.slaConfigurado ? 'se requieren ≥' + ind2.muestraMinima + ' tickets resueltos con SLA; hay ' + ind2.evaluablesSLA : 'SLA no configurado') + ')' : '<b>' + ind2.cumplimientoSLA + '%</b> (' + ind2.cumplidosSLA + ' de ' + ind2.evaluablesSLA + ')') + '.</div>';
    }
    var enfocado = document.activeElement && document.activeElement.id, pos = document.activeElement && document.activeElement.selectionStart;
    el.innerHTML = h; ligar(el);
    if (enfocado === 'tk-q') { var q = el.querySelector('#tk-q'); q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) {} }
  }
  function ligar(el) {
    el.querySelectorAll('[data-kpi]').forEach(function (b) { b.onclick = function () { S.filtro.kpi = S.filtro.kpi === b.dataset.kpi ? '' : b.dataset.kpi; pintar(); }; });
    el.querySelectorAll('.ti-row').forEach(function (r) { r.onclick = function () { abrirDetalle(r.dataset.id); }; r.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirDetalle(r.dataset.id); } }; });
    var q = el.querySelector('#tk-q'); if (q) q.oninput = function () { S.filtro.q = q.value; pintar(); };
    [['tk-fe', 'estado'], ['tk-fp', 'prioridad'], ['tk-fc', 'categoria'], ['tk-fr', 'resp']].forEach(function (x) { var s = el.querySelector('#' + x[0]); if (s) s.onchange = function () { S.filtro[x[1]] = s.value; pintar(); }; });
    var mi = el.querySelector('#tk-mios'); if (mi) mi.onchange = function () { S.filtro.mios = mi.checked; pintar(); };
    var lim = el.querySelector('#tk-lim'); if (lim) lim.onclick = function () { S.filtro = vacio(); pintar(); };
    var nu = el.querySelector('#tk-nuevo'); if (nu) nu.onclick = abrirNuevo;
    var cs = el.querySelector('#tk-csv'); if (cs) cs.onclick = exportarCSV;
  }
  /* CSV de lo que se ve en la tabla. Las celdas que empiezan con = + - @ se neutralizan para que una hoja de cálculo no las ejecute. */
  function celdaCSV(v) { var s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  function exportarCSV() {
    var rows = filtrar(), cab = ['Folio', 'Asunto', 'Tipo', 'Categoría', 'Prioridad', 'Estado', 'Solicitante', 'Responsable', 'Creado', 'Resuelto', 'Equipo (ID)'];
    var out = [cab.map(celdaCSV).join(',')].concat(rows.map(function (t) {
      return [t.codigo, t.titulo, L.TIPOS_TICKET[t.tipo] || t.tipo, L.nombreCategoria(cfg(), t.categoria), L.PRIORIDAD_LABEL[t.prioridad], L.TICKET_ESTADO_LABEL[t.estado], t.solicitanteEmail, t.responsable || '', TI.fechaHora(t.creadoMs), t.resueltoMs ? TI.fechaHora(t.resueltoMs) : '', t.activoId || ''].map(celdaCSV).join(',');
    }));
    var blob = new Blob(['﻿' + out.join('\r\n')], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'tickets-' + L.hoyISO() + '.csv'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); TI.msg('Exportados ' + rows.length + ' tickets');
  }

  /* ===== Nuevo ticket ===== */
  function opcionesDe(obj, sel) { return Object.keys(obj).map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(obj[k]) + '</option>'; }).join(''); }
  function filaEv(d, i) {
    return '<div class="ti-g2 ti-docrow" data-i="' + i + '"><div class="ti-f"><label>Título de la evidencia</label><input class="fi" data-dk="titulo" value="' + esc(d.titulo) + '"><div class="ti-err" data-e="ev' + i + '.titulo"></div></div><div class="ti-f"><label>Enlace (https://…)</label><div style="display:flex;gap:6px"><input class="fi" data-dk="url" value="' + esc(d.url) + '"><button type="button" class="icon-btn" data-rmev aria-label="Quitar evidencia">✕</button></div><div class="ti-err" data-e="ev' + i + '.url"></div></div></div>';
  }
  function abrirNuevo() {
    var C = cfg(), activas = C.categorias.filter(function (c) { return c.activa !== false; }), evs = [];
    var h = '<div class="ti-note">Cuéntanos qué ocurre. Las capturas o archivos se comparten como <b>enlaces</b> (por ejemplo Google Drive); la carga directa requiere Firebase Storage y aún no está habilitada.</div>' +
      '<div class="ti-g2"><div class="ti-f"><label for="n-tipo">Tipo *</label><select id="n-tipo" class="fi">' + opcionesDe(L.TIPOS_TICKET, 'incidente') + '</select><div class="ti-help">Incidente: algo dejó de funcionar. Solicitud: pides un servicio.</div></div>' +
      '<div class="ti-f"><label for="n-cat">Categoría *</label><select id="n-cat" class="fi"><option value="">Elige…</option>' + activas.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.nombre) + '</option>'; }).join('') + '</select><div class="ti-err" data-e="categoria"></div></div></div>' +
      '<div class="ti-f"><label for="n-tit">Título *</label><input id="n-tit" class="fi" maxlength="200"><div class="ti-err" data-e="titulo"></div></div>' +
      '<div class="ti-f"><label for="n-desc">Descripción *</label><textarea id="n-desc" class="fi" rows="4" maxlength="5000"></textarea><div class="ti-err" data-e="descripcion"></div></div>' +
      '<div class="ti-g2"><div class="ti-f"><label for="n-imp">Impacto *</label><select id="n-imp" class="fi"><option value="">Elige…</option><option value="alto">Alto — afecta a muchas personas o detiene una operación</option><option value="medio">Medio — afecta a un área o a varias personas</option><option value="bajo">Bajo — afecta a una persona</option></select><div class="ti-err" data-e="impacto"></div></div>' +
      '<div class="ti-f"><label for="n-urg">Urgencia *</label><select id="n-urg" class="fi"><option value="">Elige…</option><option value="alta">Alta — no puedo trabajar</option><option value="media">Media — puedo trabajar con dificultad</option><option value="baja">Baja — puede esperar</option></select><div class="ti-err" data-e="urgencia"></div></div></div>' +
      '<div class="ti-f"><label>Prioridad resultante</label><div id="n-prio" aria-live="polite"><span class="ti-mut">Se calcula con el impacto y la urgencia.</span></div></div>' +
      '<div class="ti-g2"><div class="ti-f"><label for="n-dep">Departamento o área</label><input id="n-dep" class="fi" maxlength="100"></div><div class="ti-f"><label for="n-sis">Sistema afectado</label><input id="n-sis" class="fi" maxlength="100" placeholder="Ej. SAP, correo, impresora…"></div></div>' +
      '<div class="ti-f"><label for="n-act">Equipo afectado (ID o número de activo fijo)</label><div style="display:flex;gap:6px"><input id="n-act" class="fi" maxlength="40"><button type="button" class="btn btn-sm" id="n-chk">Verificar</button></div><div class="ti-help" id="n-act-i">Opcional. Solo se guarda el ID del equipo; sus datos se consultan en el inventario.</div><div class="ti-err" data-e="activoId"></div></div>' +
      '<div class="ti-sec">Evidencias (enlaces)</div><div id="n-evs"></div><button type="button" class="btn btn-sm" id="n-addev">+ Agregar enlace</button>';
    var m = TI.modal('Nuevo ticket', h, { ancho: true, noCerrarFuera: true, pieHtml: '<button class="btn" id="n-c">Cancelar</button><button class="btn btn-blue" id="n-ok">Crear ticket</button>', enfocar: '#n-tit' });
    var activoResuelto = '';
    function pintarEv() { m.q('#n-evs').innerHTML = evs.map(filaEv).join('') || '<div class="ti-mut">Sin enlaces.</div>'; m.qa('[data-rmev]').forEach(function (b) { b.onclick = function () { leerEv(); evs.splice(+b.closest('.ti-docrow').dataset.i, 1); pintarEv(); }; }); }
    function leerEv() { m.qa('.ti-docrow').forEach(function (r) { var i = +r.dataset.i; r.querySelectorAll('[data-dk]').forEach(function (inp) { evs[i][inp.dataset.dk] = inp.value; }); }); }
    function prio() { var p = L.prioridadDe(m.q('#n-imp').value, m.q('#n-urg').value); m.q('#n-prio').innerHTML = p ? pillPrio(p) : '<span class="ti-mut">Se calcula con el impacto y la urgencia.</span>'; }
    pintarEv(); m.q('#n-imp').onchange = prio; m.q('#n-urg').onchange = prio;
    m.q('#n-addev').onclick = function () { leerEv(); evs.push({ titulo: '', url: '' }); pintarEv(); };
    m.q('#n-c').onclick = m.cerrar;
    m.q('#n-act').oninput = function () { activoResuelto = ''; m.q('#n-act-i').textContent = 'Opcional. Solo se guarda el ID del equipo; sus datos se consultan en el inventario.'; };
    m.q('#n-chk').onclick = function () { verificarActivo(m.q('#n-act').value, m.q('#n-act-i')).then(function (id) { activoResuelto = id || ''; }); };
    m.q('#n-ok').onclick = function () {
      leerEv();
      var d = { titulo: m.q('#n-tit').value, descripcion: m.q('#n-desc').value, tipo: m.q('#n-tipo').value, categoria: m.q('#n-cat').value, impacto: m.q('#n-imp').value, urgencia: m.q('#n-urg').value, evidencias: evs, activoId: m.q('#n-act').value.trim(), departamento: m_(m.q('#n-dep')), sistema: m_(m.q('#n-sis')) };
      var err = L.validarTicketNuevo(d, C);
      m.qa('[data-e]').forEach(function (e) { e.textContent = err[e.dataset.e] || ''; });
      if (Object.keys(err).length) { TI.msg('Hay ' + Object.keys(err).length + ' campo(s) por corregir.'); var p = m.q('.ti-err:not(:empty)'); if (p) { var c = p.parentElement.querySelector('input,textarea,select'); if (c) c.focus(); } return; }
      var btn = m.q('#n-ok'); btn.disabled = true; btn.textContent = 'Creando…';
      var resolver = d.activoId && !activoResuelto ? verificarActivo(d.activoId, m.q('#n-act-i')) : Promise.resolve(activoResuelto);
      resolver.then(function (idAct) {
        if (d.activoId && !idAct) {
          return new Promise(function (ok) { TI.confirmar('Equipo no encontrado', 'No se encontró ese equipo en el inventario. ¿Crear el ticket sin vincular un equipo?', 'Crear sin equipo', function () { ok(''); }); }).then(function (x) { return crear(d, x); });
        }
        return crear(d, idAct);
      }).then(function (id) { if (id) { m.cerrar(); TI.msg('Ticket ' + id + ' creado'); abrirDetalle(id); } else { btn.disabled = false; btn.textContent = 'Crear ticket'; } })
        .catch(function (e) { btn.disabled = false; btn.textContent = 'Crear ticket'; TI.msg('No se pudo crear: ' + e.message); });
    };
  }
  /* Una sola lectura (o dos): por ID del documento y, si no existe, por número de activo fijo. No copia datos del equipo. */
  function verificarActivo(valor, infoEl) {
    valor = String(valor || '').trim(); if (!valor) { infoEl.textContent = 'Opcional. Solo se guarda el ID del equipo; sus datos se consultan en el inventario.'; return Promise.resolve(''); }
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(valor)) { infoEl.textContent = 'El ID solo lleva letras, números y guiones.'; return Promise.resolve(''); }
    infoEl.textContent = 'Buscando…';
    function muestra(d) { var e = d.data(); infoEl.textContent = 'Encontrado: ' + [e.tipo, e.marca, e.modelo].filter(Boolean).join(' ') + (e.responsable ? ' · ' + e.responsable : '') + ' (ID ' + d.id + ')'; return d.id; }
    return db.collection('equipos').doc(valor).get().then(function (d) {
      if (d.exists) return muestra(d);
      return db.collection('equipos').where('af', '==', valor).limit(1).get().then(function (s) { if (!s.empty) return muestra(s.docs[0]); infoEl.textContent = 'No se encontró ese equipo en el inventario.'; return ''; });
    }).catch(function (e) { infoEl.textContent = 'No se pudo consultar el inventario: ' + e.message; return ''; });
  }
  function crear(d, activoId) {
    var cRef = db.collection('ti_config').doc('contadores'), ahora = Date.now();
    return db.runTransaction(function (tx) {
      return tx.get(cRef).then(function (cs) {
        var n = (cs.exists ? (cs.data().tickets || 0) : 0) + 1, id = 'TCK-' + ('0000' + n).slice(-4), ts = TI.serverTs(), tRef = refT(id);
        if (cs.exists) tx.update(cRef, { tickets: n }); else tx.set(cRef, { tickets: n });
        tx.set(tRef, {
          codigo: id, titulo: d.titulo.trim(), descripcion: d.descripcion.trim(), tipo: d.tipo, categoria: d.categoria, impacto: d.impacto, urgencia: d.urgencia, prioridad: L.prioridadDe(d.impacto, d.urgencia),
          estado: 'nuevo', solicitanteEmail: TI.user.email, responsable: null, departamento: d.departamento, sistema: d.sistema, activoId: activoId || '',
          evidencias: d.evidencias.map(function (x) { return { titulo: x.titulo.trim(), url: x.url.trim() }; }), esperas: [], escaladoNivel: 0, reaperturas: 0,
          primeraRespuestaMs: null, resueltoMs: null, cerradoMs: null, creadoMs: ahora, creadoEn: ts, actualizadoEn: ts
        });
        tx.set(tRef.collection('historial').doc(), { fecha: ts, usuario: TI.user.email, accion: 'crear', detalle: 'Ticket creado (' + (L.TIPOS_TICKET[d.tipo]) + ', prioridad ' + L.PRIORIDAD_LABEL[L.prioridadDe(d.impacto, d.urgencia)] + ')', motivo: '' });
        TI.auditar(tx, { accion: 'crear_ticket', tipo: 'ticket', id: id, detalle: id + ': ' + d.titulo.trim().slice(0, 120) });
        return id;
      });
    });
  }
  function m_(el) { return el ? el.value.trim().slice(0, 100) : ''; }

  /* ===== Detalle ===== */
  function abrirDetalle(id) {
    var D = { id: id, tab: 'resumen', comentarios: null, historial: null, modal: null, activoInfo: null };
    S.detalle = D;
    D.modal = TI.modal(id, '<div class="ti-empty">Cargando…</div>', { ancho: true, alCerrar: function () { if (S.detalle === D) S.detalle = null; } });
    refT(id).get().then(function (snap) {
      if (!snap.exists) { D.modal.cerrar(); TI.msg('El ticket no existe o no tienes acceso.'); return; }
      var x = snap.data(); x.id = id; D.ticket = x; if (!porId(id)) { if (L.puedeVerTicket(TI.user, x)) { S.propios[id] = x; recomponer(); } }
      cargarComentarios(D);
    }).catch(function (e) { D.modal.cerrar(); TI.msg('No se pudo abrir el ticket: ' + e.message); });
  }
  function cargarComentarios(D) {
    var base = refT(D.id).collection('comentarios'), q = L.esTI(TI.user) ? base : base.where('interno', '==', false);
    q.get().then(function (s) { D.comentarios = s.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }).sort(function (a, b) { return (a.fechaMs || 0) - (b.fechaMs || 0); }); pintarDetalle(D); })
      .catch(function (e) { D.comentarios = []; TI.msg('No se pudo leer la conversación: ' + e.message); pintarDetalle(D); });
  }
  function cargarHistorial(D) {
    refT(D.id).collection('historial').orderBy('fecha', 'desc').limit(60).get().then(function (s) { D.historial = s.docs.map(function (d) { return d.data(); }); pintarDetalle(D); })
      .catch(function (e) { D.historial = []; TI.msg('No se pudo leer el historial: ' + e.message); pintarDetalle(D); });
  }
  function pintarDetalle(D) {
    var m = D.modal; if (!m || !document.body.contains(m.el)) return;
    var t = porId(D.id) || D.ticket; if (!t) return; D.ticket = t;
    var u = TI.user, ti = L.esTI(u), sla = L.estadoSLA(t, cfg(), Date.now()), h = '';
    h += '<div class="ti-tabs" role="tablist">' + [['resumen', 'Resumen'], ['conv', 'Conversación (' + (D.comentarios ? D.comentarios.length : '…') + ')'], ['historial', 'Historial']].filter(function (x) { return ti || x[0] !== 'historial'; }).map(function (x) { return '<button role="tab" data-t="' + x[0] + '" aria-selected="' + (D.tab === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
    if (D.tab === 'resumen') {
      var tl = function (ms) { return ms ? TI.fechaHora(ms) : '<span class="ti-mut">—</span>'; };
      h += '<dl class="ti-dl"><dt>Tipo</dt><dd>' + esc(L.TIPOS_TICKET[t.tipo] || t.tipo) + '</dd><dt>Categoría</dt><dd>' + esc(L.nombreCategoria(cfg(), t.categoria)) + '</dd>' +
        '<dt>Solicitante</dt><dd>' + esc(TI.nombreDe(t.solicitanteEmail)) + ' <span class="ti-mut">' + esc(t.solicitanteEmail) + '</span></dd><dt>Responsable</dt><dd>' + nombreResp(t) + (t.escaladoNivel ? ' <span class="ti-tag">escalado nivel ' + t.escaladoNivel + '</span>' : '') + '</dd>' +
        '<dt>Impacto / urgencia</dt><dd>' + esc(L.IMPACTOS[t.impacto] || '—') + ' / ' + esc(L.URGENCIAS[t.urgencia] || '—') + ' → ' + pillPrio(t.prioridad) + '</dd>' +
        '<dt>Departamento</dt><dd>' + (t.departamento ? esc(t.departamento) : '<span class="ti-mut">—</span>') + '</dd><dt>Sistema afectado</dt><dd>' + (t.sistema ? esc(t.sistema) : '<span class="ti-mut">—</span>') + '</dd>' +
        '<dt>Equipo (inventario)</dt><dd id="tk-activo">' + (t.activoId ? 'ID <span class="ti-code">' + esc(t.activoId) + '</span> <span class="ti-mut" id="tk-activo-i"></span>' : '<span class="ti-mut">Sin equipo vinculado</span>') + '</dd>' +
        '<dt>Descripción</dt><dd>' + esc(t.descripcion) + '</dd>' +
        '<dt>Evidencias</dt><dd>' + ((t.evidencias || []).length ? '<ul class="ti-ul">' + t.evidencias.map(function (d) { return '<li>' + (L.urlSegura(d.url) ? '<a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">' + esc(d.titulo) + '</a>' : esc(d.titulo)) + '</li>'; }).join('') + '</ul>' : '<span class="ti-mut">Sin enlaces</span>') + '</dd>' +
        '<dt>Creado</dt><dd>' + tl(t.creadoMs) + '</dd><dt>Primera respuesta</dt><dd>' + tl(t.primeraRespuestaMs) + '</dd><dt>Resuelto</dt><dd>' + tl(t.resueltoMs) + '</dd>' +
        (t.diagnostico ? '<dt>Diagnóstico</dt><dd>' + esc(t.diagnostico) + '</dd>' : '') + (t.solucion ? '<dt>Solución</dt><dd>' + esc(t.solucion) + '</dd>' : '') +
        (t.confirmacion ? '<dt>Confirmación</dt><dd>Confirmada por ' + esc(TI.nombreDe(t.confirmacion.por)) + ' el ' + tl(t.confirmacion.fecha) + '</dd>' : '') + (t.reaperturas ? '<dt>Reaperturas</dt><dd>' + t.reaperturas + '</dd>' : '') +
        '<dt>SLA</dt><dd>' + slaDetalle(t, sla) + '</dd></dl>';
    }
    if (D.tab === 'conv') {
      h += D.comentarios === null ? '<div class="ti-empty">Cargando…</div>' : (D.comentarios.length ? '<div class="ti-msgs">' + D.comentarios.map(function (c) {
        return '<div class="ti-msg' + (c.interno ? ' int' : '') + '"><div class="ti-msg-h"><b>' + esc(TI.nombreDe(c.autor)) + '</b> <span class="ti-mut">' + TI.fechaHora(c.fechaMs) + '</span>' + (c.interno ? ' <span class="ti-tag"><i class="ti ti-lock" aria-hidden="true"></i> Nota interna</span>' : '') + '</div><div>' + esc(c.texto) + '</div></div>';
      }).join('') + '</div>' : '<div class="ti-empty">Aún no hay mensajes.</div>');
      var cerrado = L.TICKET_ABIERTOS.indexOf(t.estado) < 0 && t.estado !== 'resuelto';
      if (!cerrado) h += '<div class="ti-f" style="margin-top:12px"><label for="tk-com">Agregar mensaje</label><textarea id="tk-com" class="fi" rows="3" maxlength="2000"></textarea>' + (ti ? '<label class="ti-chk"><input type="checkbox" id="tk-int"> Nota interna (el solicitante no la ve)</label>' : '') + '<div class="ti-err" id="tk-com-e" role="alert"></div><button class="btn btn-blue btn-sm" id="tk-enviar" style="margin-top:6px">Enviar</button></div>';
      else h += '<div class="ti-note">El ticket está ' + esc((L.TICKET_ESTADO_LABEL[t.estado] || '').toLowerCase()) + ': para escribir de nuevo reábrelo o crea un ticket nuevo.</div>';
    }
    if (D.tab === 'historial') {
      if (D.historial === null) { h += '<div class="ti-empty">Cargando historial…</div>'; cargarHistorial(D); }
      else h += D.historial.length ? '<div class="ti-tl">' + D.historial.map(function (x) { return '<div><b>' + esc(x.accion) + '</b> <span class="ti-mut">' + esc(TI.nombreDe(x.usuario)) + ' · ' + TI.fechaHora(x.fecha) + '</span>' + (x.detalle ? '<br><span class="ti-mut">' + esc(x.detalle) + '</span>' : '') + (x.motivo ? '<br><i>Motivo:</i> ' + esc(x.motivo) : '') + '</div>'; }).join('') + '</div>' : '<div class="ti-empty">Sin eventos.</div>';
    }
    h += '<div class="ti-status" id="ti-st" role="status"></div>';
    var acciones = L.accionesTicketDisponibles({ user: u, ticket: t, config: cfg(), ahora: Date.now() }), pie = '';
    acciones.forEach(function (a) { var neg = a.id.indexOf('cancelar') === 0 || a.id === 'cerrar'; pie += '<button class="btn ' + (a.ok ? (neg ? '' : 'btn-blue') : 'ti-off') + '" data-a="' + a.id + '" ' + (a.ok ? '' : 'aria-disabled="true" data-why="' + esc(a.motivo) + '"') + '>' + esc(a.label) + '</button>'; });
    if (!pie) pie = '<span class="ti-mut">Sin acciones disponibles con tu rol en este estado.</span>';
    m.q('.modal-hd > div').innerHTML = '<h3>' + esc(t.codigo || t.id) + ' · ' + esc(t.titulo) + '</h3><div style="margin-top:4px">' + pillEstado(t.estado) + ' ' + pillPrio(t.prioridad) + ' ' + insigniaSLA(t) + '</div>';
    m.q('.modal-body').innerHTML = h;
    var ft = m.q('.modal-footer'); if (!ft) { ft = document.createElement('div'); ft.className = 'modal-footer'; m.q('.modal-card').appendChild(ft); } ft.innerHTML = pie;
    m.qa('[data-t]').forEach(function (b) { b.onclick = function () { D.tab = b.dataset.t; pintarDetalle(D); }; });
    m.qa('[data-a]').forEach(function (b) { b.onclick = function () { if (b.getAttribute('aria-disabled')) { m.q('#ti-st').textContent = b.dataset.why; return; } dialogoAccion(D, t, b.dataset.a); }; });
    var en = m.q('#tk-enviar'); if (en) en.onclick = function () { enviarComentario(D, t); };
    if (D.tab === 'resumen' && t.activoId) mostrarActivo(D, t.activoId);
    D.refrescar = function () { pintarDetalle(D); };
  }
  function slaDetalle(t, s) {
    if (!s.configurado) return '<span class="ti-mut">No hay SLA configurado para esta categoría y prioridad.</span>';
    var f = function (x, nombre) {
      if (x.estado === 'na') return '';
      var txt = x.estado === 'cumplido' ? 'cumplida' : x.estado === 'incumplido' ? 'incumplida' : x.estado === 'vencido' ? 'vencida por ' + dur(x.restanteMs) : x.estado === 'por_vencer' ? 'por vencer (quedan ' + dur(x.restanteMs) + ')' : 'en curso (quedan ' + dur(x.restanteMs) + ')';
      return '<div>' + nombre + ': <b>' + txt + '</b> <span class="ti-mut">· meta ' + dur(x.metaMs) + (x.objetivoMs ? ' · límite ' + TI.fechaHora(x.objetivoMs) : '') + '</span></div>';
    };
    return (s.pausado ? '<div><b>En pausa</b> mientras espera al usuario o a un tercero.</div>' : '') + (f(s.respuesta, 'Respuesta') + f(s.resolucion, 'Resolución') || '<span class="ti-mut">Sin plazo definido.</span>');
  }
  function mostrarActivo(D, id) {
    var i = D.modal.q('#tk-activo-i'); if (!i) return;
    if (D.activoInfo && D.activoInfo.id === id) { i.textContent = D.activoInfo.txt; return; }
    db.collection('equipos').doc(id).get().then(function (d) {
      var txt = d.exists ? '· ' + [d.data().tipo, d.data().marca, d.data().modelo].filter(Boolean).join(' ') : '· (ya no está en el inventario)';
      D.activoInfo = { id: id, txt: txt }; var j = D.modal && D.modal.q && document.body.contains(D.modal.el) ? D.modal.q('#tk-activo-i') : null; if (j) j.textContent = txt;
    }).catch(function () {});
  }

  /* ===== Comentarios ===== */
  function enviarComentario(D, t) {
    var m = D.modal, texto = m.q('#tk-com').value.trim(), interno = !!(m.q('#tk-int') && m.q('#tk-int').checked), e = m.q('#tk-com-e');
    if (!texto) { e.textContent = 'Escribe el mensaje.'; return; }
    e.textContent = '';
    var ti = L.esTI(TI.user), ahora = Date.now(), b = db.batch(), ts = TI.serverTs(), tRef = refT(t.id), cRef = tRef.collection('comentarios').doc();
    b.set(cRef, { texto: texto, autor: TI.user.email, interno: interno, fechaMs: ahora, fecha: ts });
    if (ti && !interno && !t.primeraRespuestaMs) b.update(tRef, { primeraRespuestaMs: ahora, actualizadoEn: ts });
    var btn = m.q('#tk-enviar'); btn.disabled = true;
    b.commit().then(function () { if (ti && !interno && !t.primeraRespuestaMs) t.primeraRespuestaMs = ahora; cargarComentarios(D); })
      .catch(function (x) { btn.disabled = false; TI.msg('No se pudo enviar: ' + x.message); });
  }

  /* ===== Acciones (transacción: ticket + historial + comentario + auditoría) ===== */
  var ETIQ = { motivo: 'Motivo', diagnostico: 'Diagnóstico', solucion: 'Solución aplicada', responsable: 'Responsable' };
  var ETIQ_MOTIVO = { esperar_usuario: 'Qué necesitas del usuario', esperar_tercero: 'Qué esperas del tercero', responder: 'Tu respuesta', reabrir: 'Qué sigue fallando', reabrir_ti: 'Motivo de la reapertura', escalar: 'Motivo del escalamiento', cerrar: 'Motivo del cierre sin confirmación', cambiar_prioridad: 'Motivo del cambio', cancelar: 'Motivo de la cancelación', cancelar_ti: 'Motivo de la cancelación' };
  function asignables() {
    return TI.usuariosActivos().filter(function (x) { return L.tiene({ roles: x.roles }, 'tickets.atender'); });
  }
  function dialogoAccion(D, t, accion) {
    var a = L.ACCIONES_TICKET[accion], req = a.requiere || [], h = '';
    if (!req.length) { ejecutar(D, t.id, accion, {}); return; }
    req.forEach(function (k) {
      if (k === 'responsable') { var as = asignables(); h += '<div class="ti-f"><label for="ac-responsable">Responsable *</label><select id="ac-responsable" class="fi"><option value="">Elige…</option>' + as.map(function (x) { return '<option value="' + esc(x.email) + '"' + (x.email === t.responsable ? ' selected' : '') + '>' + esc(x.nombre) + ' (' + esc(x.email) + ')</option>'; }).join('') + '</select>' + (as.length ? '' : '<div class="ti-help">Nadie tiene aún el rol Técnico o Administrador. Asígnalo en Administración › Usuarios y roles.</div>') + '</div>'; }
      else if (k === 'impacto') h += '<div class="ti-g2"><div class="ti-f"><label for="ac-impacto">Impacto *</label><select id="ac-impacto" class="fi">' + opcionesDe(L.IMPACTOS, t.impacto) + '</select></div><div class="ti-f"><label for="ac-urgencia">Urgencia *</label><select id="ac-urgencia" class="fi">' + opcionesDe(L.URGENCIAS, t.urgencia) + '</select></div></div>';
      else if (k === 'urgencia') return;
      else h += '<div class="ti-f"><label for="ac-' + k + '">' + esc(k === 'motivo' ? (ETIQ_MOTIVO[accion] || 'Motivo') : ETIQ[k]) + ' *</label><textarea id="ac-' + k + '" class="fi" rows="3" maxlength="2000"></textarea></div>';
    });
    h += '<div class="ti-err" id="ac-e" role="alert"></div>';
    var m = TI.modal(a.label, h, { pieHtml: '<button class="btn" id="ac-c">Cancelar</button><button class="btn btn-blue" id="ac-ok">Continuar</button>', enfocar: '#ac-' + (req[0] === 'impacto' ? 'impacto' : req[0]) });
    m.q('#ac-c').onclick = m.cerrar;
    m.q('#ac-ok').onclick = function () {
      var datos = {}; req.forEach(function (k) { var el = m.q('#ac-' + k); if (el) datos[k] = el.value.trim(); });
      if (req.indexOf('impacto') >= 0) datos.urgencia = m.q('#ac-urgencia').value;
      var falta = req.filter(function (k) { return k !== 'urgencia' && !datos[k]; });
      if (falta.length) { m.q('#ac-e').textContent = 'Completa los campos obligatorios.'; return; }
      m.cerrar(); ejecutar(D, t.id, accion, datos);
    };
  }
  function ejecutar(D, id, accion, datos) {
    var tRef = refT(id), ahora = Date.now(), etiqueta = L.ACCIONES_TICKET[accion].label;
    db.runTransaction(function (tx) {
      return tx.get(tRef).then(function (ts0) {
        if (!ts0.exists) throw new Error('El ticket ya no existe.');
        var t = ts0.data(); t.id = id;
        var r = L.aplicarAccionTicket({ user: TI.user, ticket: t, config: cfg(), ahora: ahora }, accion, datos), ts = TI.serverTs();
        tx.update(tRef, Object.assign({}, r.cambios, { actualizadoEn: ts }));
        tx.set(tRef.collection('historial').doc(), { fecha: ts, usuario: TI.user.email, accion: accion, detalle: r.historial.detalle, motivo: r.historial.motivo });
        if (r.comentario) tx.set(tRef.collection('comentarios').doc(), { texto: r.comentario.texto, autor: TI.user.email, interno: !!r.comentario.interno, fechaMs: ahora, fecha: ts });
        TI.auditar(tx, { accion: 'ticket_' + accion, tipo: 'ticket', id: id, detalle: (t.codigo || id) + ': ' + r.historial.detalle, motivo: r.historial.motivo });
      });
    }).then(function () {
      TI.msg('Listo: ' + etiqueta);
      refT(id).get().then(function (s) {
        if (s.exists) { var x = s.data(); x.id = id; [S.abiertos, S.recientes, S.propios].forEach(function (o) { if (o[id]) o[id] = x; }); if (!porId(id)) S.propios[id] = x; recomponer(); }
        D.historial = null; cargarComentarios(D); pintar();
      });
    }).catch(function (e) { TI.msg('No se pudo completar: ' + e.message); });
  }

  /* ===== Configuración (la usa Administración › Mesa de ayuda) ===== */
  var DIAS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mié'], [4, 'Jue'], [5, 'Vie'], [6, 'Sáb'], [0, 'Dom']];
  TI.configTicketsUI = function (el) {
    TI.cargarConfigTickets(true).then(function (C) { pintarConfig(el, JSON.parse(JSON.stringify(C))); });
  };
  function pintarConfig(el, C) {
    var h = '<div class="ti-note">Los plazos (SLA), el horario de servicio y las categorías <b>no vienen predefinidos</b>: los define el administrador. Sin SLA para una categoría y prioridad, el ticket no se marca como vencido. Los datos se guardan en <code>ti_config/tickets</code> y cada cambio queda en la auditoría.</div>';
    h += '<div class="ti-card" style="padding:16px;margin-bottom:14px"><h2 class="ti-h2">Categorías</h2><div class="ti-help">Las categorías no se borran (los tickets las referencian); se desactivan.</div><table class="ti-table"><thead><tr><th>Categoría</th><th>Activa</th></tr></thead><tbody>' +
      C.categorias.map(function (c, i) { return '<tr><td><input class="fi-sm" style="width:100%;max-width:320px" data-cn="' + i + '" value="' + esc(c.nombre) + '" aria-label="Nombre de la categoría ' + (i + 1) + '" maxlength="60"></td><td><label class="ti-chk"><input type="checkbox" data-ca="' + i + '"' + (c.activa !== false ? ' checked' : '') + '> Activa</label></td></tr>'; }).join('') +
      '</tbody></table><div class="ti-tools" style="margin-top:10px"><input id="cf-nueva" class="fi-sm" placeholder="Nueva categoría" aria-label="Nueva categoría" maxlength="60"><button class="btn btn-sm" id="cf-addcat">+ Agregar categoría</button></div><div class="ti-err" id="cf-cat-e" role="alert"></div></div>';
    var hor = C.horario || { dias: [1, 2, 3, 4, 5], inicio: '09:00', fin: '18:00' };
    h += '<div class="ti-card" style="padding:16px;margin-bottom:14px"><h2 class="ti-h2">Horario de servicio</h2><label class="ti-chk"><input type="checkbox" id="cf-hor"' + (C.horario ? ' checked' : '') + '> Los plazos solo corren en horario de servicio</label><div class="ti-help">Si no se marca, los plazos corren las 24 horas, todos los días. Se usa la hora local del navegador.</div>' +
      '<div class="ti-tools" style="margin-top:8px">' + DIAS.map(function (d) { return '<label class="ti-chk"><input type="checkbox" data-dia="' + d[0] + '"' + (hor.dias.indexOf(d[0]) >= 0 ? ' checked' : '') + '> ' + d[1] + '</label>'; }).join('') +
      '<label class="ti-chk">De <input type="time" id="cf-ini" class="fi-sm" value="' + esc(hor.inicio) + '"></label><label class="ti-chk">a <input type="time" id="cf-fin" class="fi-sm" value="' + esc(hor.fin) + '"></label></div><div class="ti-err" id="cf-hor-e" role="alert"></div></div>';
    var activas = C.categorias.filter(function (c) { return c.activa !== false; });
    h += '<div class="ti-card" style="padding:16px;margin-bottom:14px"><h2 class="ti-h2">SLA por categoría y prioridad (horas)</h2><div class="ti-help">Respuesta = hasta la primera atención. Resolución = hasta marcar resuelto, sin contar las esperas del usuario o de terceros. Deja vacío lo que no apliques.</div><div class="ti-scroll"><table class="ti-table"><thead><tr><th>Categoría</th>' + L.PRIORIDADES.map(function (p) { return '<th>' + L.PRIORIDAD_LABEL[p] + '</th>'; }).join('') + '</tr></thead><tbody>' +
      activas.map(function (c) { return '<tr><td><b>' + esc(c.nombre) + '</b></td>' + L.PRIORIDADES.map(function (p) { var s = C.sla[c.id + '|' + p] || {}; return '<td><div class="ti-sla"><label>Resp. <input type="number" min="0" step="0.5" class="fi-sm" data-sla="' + esc(c.id) + '|' + p + '|respuestaH" value="' + (s.respuestaH || '') + '" aria-label="' + esc(c.nombre) + ' ' + L.PRIORIDAD_LABEL[p] + ': horas de respuesta"></label><label>Resol. <input type="number" min="0" step="0.5" class="fi-sm" data-sla="' + esc(c.id) + '|' + p + '|resolucionH" value="' + (s.resolucionH || '') + '" aria-label="' + esc(c.nombre) + ' ' + L.PRIORIDAD_LABEL[p] + ': horas de resolución"></label></div></td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div><div class="ti-err" id="cf-sla-e" role="alert"></div></div>';
    h += '<div class="ti-card" style="padding:16px;margin-bottom:14px"><h2 class="ti-h2">Otros parámetros</h2><div class="ti-g2"><div class="ti-f"><label for="cf-vent">Días para reabrir un ticket resuelto</label><input id="cf-vent" type="number" class="fi" min="0" max="365" value="' + C.ventanaReaperturaDias + '"><div class="ti-help">Parámetro editable; no es una política oficial.</div></div><div class="ti-f"><label for="cf-alerta">Alerta de "por vencer" (% del plazo restante)</label><input id="cf-alerta" type="number" class="fi" min="1" max="90" value="' + C.alertaPct + '"></div></div></div>';
    h += '<div class="ti-tools"><button class="btn btn-blue" id="cf-guardar">Guardar configuración</button></div>';
    el.innerHTML = h;
    el.querySelector('#cf-addcat').onclick = function () {
      var nombre = el.querySelector('#cf-nueva').value.trim(), e = el.querySelector('#cf-cat-e'); leer(el, C);
      var id = L.slugCategoria(nombre);
      if (!id) { e.textContent = 'Escribe el nombre de la categoría.'; return; }
      if (C.categorias.some(function (c) { return c.id === id || c.nombre.toLowerCase() === nombre.toLowerCase(); })) { e.textContent = 'Ya existe una categoría con ese nombre.'; return; }
      C.categorias.push({ id: id, nombre: nombre, activa: true }); pintarConfig(el, C);
    };
    el.querySelector('#cf-guardar').onclick = function () { guardarConfig(el, C); };
  }
  function leer(el, C) {
    el.querySelectorAll('[data-cn]').forEach(function (i) { C.categorias[+i.dataset.cn].nombre = i.value.trim() || C.categorias[+i.dataset.cn].nombre; });
    el.querySelectorAll('[data-ca]').forEach(function (i) { C.categorias[+i.dataset.ca].activa = i.checked; });
    var sla = {};
    el.querySelectorAll('[data-sla]').forEach(function (i) { var p = i.dataset.sla.split('|'), v = parseFloat(i.value); if (v > 0) { var k = p[0] + '|' + p[1]; sla[k] = sla[k] || {}; sla[k][p[2]] = Math.round(v * 100) / 100; } });
    /* Las categorías desactivadas conservan su SLA anterior (no se muestran pero no se pierden). */
    Object.keys(C.sla).forEach(function (k) { var id = k.split('|')[0], c = C.categorias.filter(function (x) { return x.id === id; })[0]; if (c && c.activa === false && !sla[k]) sla[k] = C.sla[k]; });
    C.sla = sla;
    var hor = el.querySelector('#cf-hor');
    C.horario = hor && hor.checked ? { dias: [].slice.call(el.querySelectorAll('[data-dia]')).filter(function (i) { return i.checked; }).map(function (i) { return +i.dataset.dia; }), inicio: el.querySelector('#cf-ini').value, fin: el.querySelector('#cf-fin').value } : null;
    C.ventanaReaperturaDias = Math.max(0, Math.min(365, parseInt(el.querySelector('#cf-vent').value, 10) || 0));
    C.alertaPct = Math.max(1, Math.min(90, parseInt(el.querySelector('#cf-alerta').value, 10) || 25));
  }
  function guardarConfig(el, C) {
    leer(el, C);
    el.querySelectorAll('.ti-err').forEach(function (e) { e.textContent = ''; });
    if (C.horario && !L.horarioValido(C.horario)) { el.querySelector('#cf-hor-e').textContent = 'Elige al menos un día y que la hora final sea posterior a la inicial.'; return; }
    if (C.categorias.some(function (c) { return !c.nombre; })) { el.querySelector('#cf-cat-e').textContent = 'Ninguna categoría puede quedar sin nombre.'; return; }
    for (var k in C.sla) { var s = C.sla[k]; if (s.respuestaH && s.resolucionH && s.respuestaH > s.resolucionH) { el.querySelector('#cf-sla-e').textContent = 'En ' + k.split('|')[0] + ' (' + L.PRIORIDAD_LABEL[k.split('|')[1]] + ') la respuesta no puede tardar más que la resolución.'; return; } }
    var ts = TI.serverTs(), b = db.batch(), ref = db.collection('ti_config').doc('tickets');
    var datos = { categorias: C.categorias, sla: C.sla, horario: C.horario, ventanaReaperturaDias: C.ventanaReaperturaDias, alertaPct: C.alertaPct, actualizadoPor: TI.user.email, actualizadoEn: ts };
    b.set(ref, datos);
    TI.auditar(b, { accion: 'configurar_mesa_ayuda', tipo: 'config', id: 'tickets', detalle: C.categorias.length + ' categorías · ' + Object.keys(C.sla).length + ' SLA · ' + (C.horario ? 'horario ' + C.horario.inicio + '–' + C.horario.fin : 'sin horario (24×7)') });
    b.commit().then(function () { S.config = L.normalizarConfigTickets(datos); TI.configTickets = S.config; TI.msg('Configuración guardada'); pintarConfig(el, JSON.parse(JSON.stringify(S.config))); avisar(); })
      .catch(function (e) { TI.msg('No se pudo guardar: ' + e.message); });
  }
})();
