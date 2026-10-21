/* CAFIVER TI — Módulo "Procesos y procedimientos".
   Datos: ti_procesos/{PRO-###} (cabecera) · /versiones/{n} (contenido por versión) · /historial/* · ti_auditoria (global).
   Toda transición de estado se hace en una transacción: versión + cabecera + historial + auditoría. */
(function () {
  'use strict';
  var TI = window.TI, L = TI.L, esc = TI.esc;
  var S = { lista: [], detalle: null, cargado: false, error: '', filtro: { q: '', estado: '', categoria: '', resp: '', kpi: '' }, el: null };

  TI.registrarVista('ti-procesos', {
    permitido: function (u) { return L.tiene(u, 'procesos.ver') || L.tiene(u, 'procesos.ver_publicados'); },
    render: function (el, params) { render(el, params); },
    destruir: function () { S.lista = []; S.cargado = false; oyentes = []; S.error = ''; S.el = null; S.filtro = { q: '', estado: '', categoria: '', resp: '', kpi: '' }; }
  });

  /* ===== Datos ===== */
  function suscribir() {
    if (S.cargado) return; S.cargado = true;
    var q = db.collection('ti_procesos');
    if (!TI.puede('procesos.ver')) q = q.where('versionPublicada', '>', 0);
    var unsub = q.onSnapshot(function (snap) {
      S.lista = snap.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; });
      S.lista.sort(function (a, b) { return String(a.codigo || a.id).localeCompare(String(b.codigo || b.id)); });
      S.error = ''; pintar();
      if (S.detalle && S.detalle.modal && document.body.contains(S.detalle.modal.el)) pintarDetalle(S.detalle);
      oyentes.forEach(function (f) { try { f(); } catch (e) {} });
    }, function (err) { S.error = err.code === 'permission-denied' ? 'permiso' : TI.errTxt(err); pintar(); oyentes.forEach(function (f) { try { f(); } catch (e) {} }); });
    TI.unsubs.push(unsub);
  }
  function porId(id) { return S.lista.filter(function (p) { return p.id === id; })[0]; }
  function refP(id) { return db.collection('ti_procesos').doc(id); }
  function pill(estado) { return '<span class="pill ti-e ti-e-' + estado + '">' + esc(L.ESTADO_LABEL[estado] || estado) + '</span>'; }
  function nombreResp(p) { return p.responsable ? TI.nombreDe(p.responsable) : '<span class="ti-mut">Sin asignar</span>'; }

  /* ===== Lista + indicadores ===== */
  function render(el, params) {
    S.el = el; suscribir();
    /* Parámetros desde el Inicio: abrir filtrado por una tarjeta o abrir un proceso concreto. */
    if (params && params.kpi) S.filtro = { q: '', estado: '', categoria: '', resp: '', kpi: params.kpi };
    pintar();
    if (params && params.abrir) abrirDetalle(params.abrir);
  }
  /* Datos compartidos con el Inicio (la suscripción es una sola; no se duplican lecturas). */
  var oyentes = [];
  TI.datosProcesos = { lista: function () { return S.lista; }, asegurar: suscribir, error: function () { return S.error; }, alCambiar: function (f) { if (oyentes.indexOf(f) < 0) oyentes.push(f); } };
  var KPIS = [
    ['registrados', 'Procesos registrados', 'Todos los no obsoletos.'],
    ['documentados', 'Procesos documentados', 'Versión vigente con objetivo, alcance, responsable y ≥1 actividad.'],
    ['enRevision', 'En revisión', 'Versión de trabajo en revisión.'],
    ['pendientesAprobacion', 'Pendientes de aprobación', 'Esperan decisión del Gerente o el Director de TI.'],
    ['publicados', 'Publicados vigentes', 'Con una versión publicada en uso.'],
    ['proximosRevision', 'Revisión en ' + L.VENTANA_DIAS + ' días', 'Vigentes cuya próxima revisión cae en la ventana.'],
    ['revisionVencida', 'Revisión vencida', 'Vigentes con fecha de revisión anterior a hoy.'],
    ['sinRespaldo', 'Dependen de una persona', 'Sin participantes registrados.']
  ];
  function filtrar() {
    var f = S.filtro, kp = f.kpi ? L.filtroIndicador(f.kpi) : null, q = f.q.trim().toLowerCase();
    return S.lista.filter(function (p) {
      if (kp && !kp(p)) return false;
      if (f.estado && p.estado !== f.estado) return false;
      if (f.categoria && p.categoria !== f.categoria) return false;
      if (f.resp && p.responsable !== f.resp) return false;
      if (q && (String(p.nombre) + ' ' + String(p.codigo) + ' ' + String(p.categoria)).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function pintar() {
    var el = S.el; if (!el) return;
    var verTodo = TI.puede('procesos.ver'), ind = L.indicadores(S.lista), h = '';
    h += '<div class="ti-head"><div><h1 class="ti-h1">Procesos y procedimientos</h1><div class="ti-sub">' +
      (verTodo ? 'Documenta, aprueba, publica y revisa los procesos del departamento de TI.' : 'Consulta de procedimientos publicados vigentes.') + '</div></div></div>';
    if (S.error === 'permiso') {
      el.innerHTML = h + '<div class="ti-note err"><b>Sin acceso a los datos.</b> Tu cuenta no tiene permiso para leer procesos. Si acabas de recibir un rol, vuelve a iniciar sesión. Si el problema continúa, el administrador debe publicar las reglas de seguridad de <code>firestore.rules</code>.</div>'; return;
    }
    if (S.error) { el.innerHTML = h + '<div class="ti-note err">No se pudo cargar: ' + esc(S.error) + '</div>'; return; }
    if (verTodo) {
      h += '<div class="ti-kpis">' + KPIS.map(function (k) {
        var v = ind[k[0]], txt = v;
        if (k[0] === 'documentados') txt = ind.porcentajeDocumentados === null ? v + ' de ' + ind.registrados : ind.porcentajeDocumentados + '%';
        var sub = k[0] === 'documentados' && ind.porcentajeDocumentados === null ? 'Muestra insuficiente (se requieren ≥' + L.MIN_MUESTRA + ' procesos)' : k[0] === 'documentados' ? v + ' de ' + ind.registrados + ' procesos' : k[2];
        return '<button class="ti-kpi' + (S.filtro.kpi === k[0] ? ' on' : '') + '" data-kpi="' + k[0] + '" aria-pressed="' + (S.filtro.kpi === k[0]) + '"><div class="ti-kl">' + k[1] + '</div><div class="ti-kv">' + txt + '</div><div class="ti-kd">' + esc(sub) + '</div></button>';
      }).join('') + '</div>';
    }
    var resps = {}; S.lista.forEach(function (p) { if (p.responsable) resps[p.responsable] = 1; });
    h += '<div class="ti-tools"><input id="ti-q" class="fi-sm" type="search" placeholder="Buscar por nombre, código o categoría" aria-label="Buscar proceso" value="' + esc(S.filtro.q) + '" style="min-width:250px">' +
      '<select id="ti-fe" class="fi-sm" aria-label="Filtrar por estado"><option value="">Todos los estados</option>' + L.ESTADOS.map(function (e) { return '<option value="' + e + '"' + (S.filtro.estado === e ? ' selected' : '') + '>' + L.ESTADO_LABEL[e] + '</option>'; }).join('') + '</select>' +
      '<select id="ti-fc" class="fi-sm" aria-label="Filtrar por categoría"><option value="">Todas las categorías</option>' + L.CATEGORIAS.map(function (c) { return '<option' + (S.filtro.categoria === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select>' +
      (verTodo ? '<select id="ti-fr" class="fi-sm" aria-label="Filtrar por responsable"><option value="">Todos los responsables</option>' + Object.keys(resps).sort().map(function (r) { return '<option value="' + esc(r) + '"' + (S.filtro.resp === r ? ' selected' : '') + '>' + esc(TI.nombreDe(r)) + '</option>'; }).join('') + '</select>' : '') +
      ((S.filtro.kpi || S.filtro.estado || S.filtro.categoria || S.filtro.resp || S.filtro.q) ? '<button class="btn btn-sm" id="ti-lim">Limpiar filtros</button>' : '') +
      '<span style="flex:1"></span>' +
      (TI.puede('procesos.catalogo') ? '<button class="btn btn-sm" id="ti-cat" title="Crea los nombres del catálogo como borradores vacíos">Cargar catálogo inicial</button>' : '') +
      (TI.puede('procesos.crear') ? '<button class="btn btn-blue btn-sm" id="ti-nuevo">+ Nuevo proceso</button>' : '') + '</div>';
    var rows = filtrar();
    h += '<div class="ti-card"><div class="ti-scroll"><table class="ti-table"><caption class="ti-sr">Procesos y procedimientos</caption><thead><tr><th>Código</th><th>Proceso</th><th>Categoría</th><th>Responsable</th><th>Estado</th><th>Versión</th><th>Próx. revisión</th></tr></thead><tbody>';
    if (!S.lista.length) h += '<tr><td colspan="7" class="ti-empty">' + (verTodo ? 'Aún no hay procesos registrados. ' + (TI.puede('procesos.crear') ? 'Crea el primero con "Nuevo proceso"' + (TI.puede('procesos.catalogo') ? ' o carga el catálogo inicial.' : '.') : '') : 'Todavía no hay procedimientos publicados.') + '</td></tr>';
    else if (!rows.length) h += '<tr><td colspan="7" class="ti-empty">Ningún proceso coincide con los filtros.</td></tr>';
    var hoy = L.hoyISO();
    rows.forEach(function (p) {
      var rev = p.proximaRevision ? (p.proximaRevision < hoy && L.vigente(p.estado) ? '<span class="ti-vencida">' + TI.fecha(p.proximaRevision) + ' · vencida</span>' : TI.fecha(p.proximaRevision)) : '—';
      var ver = 'v' + (p.versionTrabajo || 1) + (p.versionPublicada && p.versionPublicada !== p.versionTrabajo ? ' <span class="ti-mut">(vigente v' + p.versionPublicada + ')</span>' : '');
      h += '<tr class="ti-row" tabindex="0" role="button" data-id="' + esc(p.id) + '"><td class="ti-code">' + esc(p.codigo || p.id) + '</td><td><b>' + esc(p.nombre) + '</b>' + (p.esPlantilla ? ' <span class="ti-tag">plantilla</span>' : '') + '</td><td>' + esc(p.categoria || '—') + '</td><td>' + nombreResp(p) + '</td><td>' + pill(p.estado) + '</td><td>' + ver + '</td><td>' + rev + '</td></tr>';
    });
    h += '</tbody></table></div></div>';
    h += '<div class="ti-note">Los indicadores se calculan con los procesos registrados. "Documentado" = versión vigente con objetivo, alcance, responsable y al menos una actividad. El porcentaje solo se muestra con ≥' + L.MIN_MUESTRA + ' procesos.</div>';
    var enfocado = document.activeElement && document.activeElement.id, pos = document.activeElement && document.activeElement.selectionStart;
    el.innerHTML = h; ligar(el);
    if (enfocado === 'ti-q') { var q = el.querySelector('#ti-q'); q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) {} }
  }
  function ligar(el) {
    el.querySelectorAll('[data-kpi]').forEach(function (b) { b.onclick = function () { S.filtro.kpi = S.filtro.kpi === b.dataset.kpi ? '' : b.dataset.kpi; pintar(); }; });
    el.querySelectorAll('.ti-row').forEach(function (r) { r.onclick = function () { abrirDetalle(r.dataset.id); }; r.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirDetalle(r.dataset.id); } }; });
    var q = el.querySelector('#ti-q'); if (q) q.oninput = function () { S.filtro.q = q.value; pintar(); };
    [['ti-fe', 'estado'], ['ti-fc', 'categoria'], ['ti-fr', 'resp']].forEach(function (x) { var s = el.querySelector('#' + x[0]); if (s) s.onchange = function () { S.filtro[x[1]] = s.value; pintar(); }; });
    var lim = el.querySelector('#ti-lim'); if (lim) lim.onclick = function () { S.filtro = { q: '', estado: '', categoria: '', resp: '', kpi: '' }; pintar(); };
    var nu = el.querySelector('#ti-nuevo'); if (nu) nu.onclick = function () { abrirEditor(null); };
    var ct = el.querySelector('#ti-cat'); if (ct) ct.onclick = cargarCatalogo;
  }

  /* ===== Detalle ===== */
  function abrirDetalle(id) {
    var D = { id: id, versiones: null, historial: null, tab: 'ficha', ver: null, modal: null };
    S.detalle = D;
    var base = refP(id).collection('versiones');
    var q = TI.puede('procesos.ver') ? base.orderBy('numero') : base.where('estado', 'in', ['publicado', 'en_revision_periodica']);
    q.get().then(function (s) {
      D.versiones = s.docs.map(function (d) { return d.data(); }).sort(function (a, b) { return a.numero - b.numero; });
      pintarDetalle(D);
    }).catch(function (e) { TI.msg('No se pudo abrir el proceso: ' + TI.errTxt(e)); });
    var p = porId(id);
    D.modal = TI.modal(p ? p.nombre : id, '<div class="ti-empty">Cargando…</div>', { ancho: true });
  }
  function versionMostrada(D, p) {
    var n = D.ver != null ? D.ver : (TI.puede('procesos.ver') ? p.versionTrabajo : p.versionPublicada);
    return (D.versiones || []).filter(function (v) { return v.numero === n; })[0] || (D.versiones || [])[D.versiones.length - 1];
  }
  function lista(arr) { return arr && arr.length ? '<ul class="ti-ul">' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<span class="ti-mut">Sin registrar</span>'; }
  function txt(x) { return x && String(x).trim() ? esc(x) : '<span class="ti-mut">Sin registrar</span>'; }
  function pintarDetalle(D) {
    var p = porId(D.id), m = D.modal; if (!m || !document.body.contains(m.el)) return;
    if (!p) {
      /* El documento recién creado puede no haber llegado aún a la lista en tiempo real: se lee directamente. */
      if (D.intentos) { m.cerrar(); return; }
      D.intentos = 1;
      refP(D.id).get().then(function (snap) {
        if (!snap.exists) { m.cerrar(); return; }
        var x = snap.data(); x.id = snap.id; if (!porId(x.id)) S.lista.push(x);
        pintarDetalle(D);
      }).catch(function () { m.cerrar(); });
      return;
    }
    var v = versionMostrada(D, p); if (!v) { m.q('.modal-body').innerHTML = '<div class="ti-empty">Sin versiones disponibles.</div>'; return; }
    var c = v.contenido || L.contenidoVacio(), esTrabajo = v.numero === p.versionTrabajo, u = TI.user;
    var idx = L.ESTADOS.indexOf(v.estado), h = '';
    h += '<div class="ti-flow" aria-label="Flujo de estados">' + L.ESTADOS.map(function (e, i) { return '<span class="' + (e === v.estado ? 'cur' : (i < idx ? 'done' : '')) + '">' + L.ESTADO_LABEL[e] + '</span>'; }).join('') + '</div>';
    if (v.estado === 'reemplazada') h += '<div class="ti-note">Esta versión fue reemplazada por una más reciente. Se conserva solo para consulta.</div>';
    h += '<div class="ti-tabs" role="tablist">' + [['ficha', 'Ficha'], ['pasos', 'Actividades (' + (c.pasos || []).length + ')'], ['versiones', 'Versiones (' + D.versiones.length + ')'], ['historial', 'Historial']].filter(function (t) { return TI.puede('procesos.ver') || t[0] !== 'historial'; }).map(function (t) { return '<button role="tab" data-t="' + t[0] + '" aria-selected="' + (D.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>';
    if (D.tab === 'ficha') {
      h += '<dl class="ti-dl"><dt>Categoría</dt><dd>' + esc(p.categoria || '—') + '</dd><dt>Responsable</dt><dd>' + nombreResp(p) + '</dd><dt>Participantes</dt><dd>' + ((p.participantes || []).length ? p.participantes.map(function (e) { return esc(TI.nombreDe(e)); }).join(', ') : '<span class="ti-warn">Ninguno: el proceso depende de una sola persona</span>') + '</dd>' +
        '<dt>Próxima revisión</dt><dd>' + TI.fecha(p.proximaRevision) + ' <span class="ti-mut">(cada ' + (p.periodoRevisionMeses || 12) + ' meses)</span></dd>' +
        '<dt>Objetivo</dt><dd>' + txt(c.objetivo) + '</dd><dt>Alcance</dt><dd>' + txt(c.alcance) + '</dd><dt>Descripción</dt><dd>' + txt(c.descripcion) + '</dd>' +
        '<dt>Entradas</dt><dd>' + lista(c.entradas) + '</dd><dt>Resultados esperados</dt><dd>' + lista(c.resultadosEsperados) + '</dd><dt>Sistemas</dt><dd>' + lista(c.sistemas) + '</dd>' +
        '<dt>Riesgos</dt><dd>' + lista(c.riesgos) + '</dd><dt>Controles</dt><dd>' + lista(c.controles) + '</dd><dt>Evidencias requeridas</dt><dd>' + lista(c.evidencias) + '</dd><dt>Indicadores</dt><dd>' + lista(c.indicadores) + '</dd>' +
        '<dt>Tiempo objetivo</dt><dd>' + txt(c.tiempoObjetivo) + '</dd><dt>Documentos</dt><dd>' + ((c.documentosRelacionados || []).length ? '<ul class="ti-ul">' + c.documentosRelacionados.map(function (d) { return '<li>' + (L.urlSegura(d.url) ? '<a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">' + esc(d.titulo) + '</a>' : esc(d.titulo)) + '</li>'; }).join('') + '</ul>' : '<span class="ti-mut">Sin registrar</span>') + '</dd>' +
        '<dt>Aprobación</dt><dd>' + (v.aprobacion ? 'Aprobó <b>' + esc(TI.nombreDe(v.aprobacion.por)) + '</b> el ' + TI.fecha(v.aprobacion.fecha) : '<span class="ti-mut">Sin aprobación registrada</span>') + '</dd>' +
        (v.motivoRechazo ? '<dt>Último rechazo</dt><dd>' + esc(v.motivoRechazo) + '</dd>' : '') + '</dl>';
    }
    if (D.tab === 'pasos') {
      h += (c.pasos || []).length ? '<ol class="ti-steps">' + c.pasos.map(function (s) {
        return '<li><div><b>' + esc(s.descripcion) + '</b><div class="ti-sv"><span>Responsable: <b>' + esc(s.responsable) + '</b></span><span>Sistema: <b>' + esc(s.sistema || '—') + '</b></span><span>Tiempo objetivo: <b>' + esc(s.tiempo || '—') + '</b></span></div>' +
          '<div class="ti-sv"><span>Entrada: <b>' + esc(s.entrada || '—') + '</b></span><span>Resultado: <b>' + esc(s.resultado || '—') + '</b></span></div><div class="ti-sv"><span>Evidencia: <b>' + esc(s.evidencia || '—') + '</b></span><span>Excepciones: <b>' + esc(s.excepciones || '—') + '</b></span></div></div></li>';
      }).join('') + '</ol>' : '<div class="ti-empty">Esta versión aún no tiene actividades registradas.</div>';
    }
    if (D.tab === 'versiones') {
      h += '<div class="ti-scroll"><table class="ti-table"><thead><tr><th>Versión</th><th>Estado</th><th>Creada por</th><th>Aprobada por</th><th>Publicada</th><th></th></tr></thead><tbody>' + D.versiones.slice().reverse().map(function (x) {
        return '<tr><td>v' + x.numero + (x.numero === p.versionPublicada ? ' <span class="ti-tag ok">vigente</span>' : '') + '</td><td>' + pill(x.estado) + '</td><td>' + esc(TI.nombreDe(x.creadoPor)) + '</td><td>' + (x.aprobacion ? esc(TI.nombreDe(x.aprobacion.por)) : '—') + '</td><td>' + (x.publicadoEn ? TI.fecha(x.publicadoEn) : '—') + '</td><td><button class="btn btn-sm" data-ver="' + x.numero + '"' + (x.numero === v.numero ? ' disabled' : '') + '>' + (x.numero === v.numero ? 'Mostrando' : 'Ver') + '</button></td></tr>';
      }).join('') + '</tbody></table></div><div class="ti-note">Una versión aprobada o publicada no se modifica: cualquier cambio crea una versión nueva y la anterior se conserva.</div>';
    }
    if (D.tab === 'historial') {
      if (D.historial === null) { h += '<div class="ti-empty">Cargando historial…</div>'; cargarHistorial(D); }
      else h += D.historial.length ? '<div class="ti-tl">' + D.historial.map(function (x) { return '<div><b>' + esc(x.accion) + '</b> <span class="ti-mut">v' + esc(x.version || '') + ' · ' + esc(TI.nombreDe(x.usuario)) + ' · ' + TI.fechaHora(x.fecha) + '</span>' + (x.detalle ? '<br><span class="ti-mut">' + esc(x.detalle) + '</span>' : '') + (x.motivo ? '<br><i>Motivo:</i> ' + esc(x.motivo) : '') + '</div>'; }).join('') + '</div>' : '<div class="ti-empty">Sin eventos registrados.</div>';
    }
    /* acciones */
    var pie = '', acciones = esTrabajo ? L.accionesDisponibles({ user: u, proceso: p, version: v }) : [];
    h += '<div class="ti-status" id="ti-st" role="status"></div>';
    acciones.forEach(function (a) { pie += '<button class="btn ' + (a.ok ? (a.id === 'rechazar' || a.id === 'marcar_obsoleto' ? '' : 'btn-blue') : 'ti-off') + '" data-a="' + a.id + '" ' + (a.ok ? '' : 'aria-disabled="true" data-why="' + esc(a.motivo) + '"') + '>' + esc(a.label) + '</button>'; });
    if (esTrabajo && v.estado === 'borrador' && L.esEditor(u, p)) pie = '<button class="btn" id="ti-edit">Editar borrador</button>' + pie;
    if (L.esEditor(u, p) && p.estado !== 'obsoleto') pie = '<button class="btn" id="ti-resp">Responsables y revisión</button>' + pie;
    if (!pie) pie = '<span class="ti-mut">Sin acciones disponibles con tu rol en este estado.</span>';
    var enc = '<h3>' + esc(p.codigo || p.id) + ' · ' + esc(p.nombre) + '</h3><div style="margin-top:4px">' + pill(v.estado) + ' <span class="ti-mut">versión mostrada v' + v.numero + (p.versionPublicada ? ' · vigente v' + p.versionPublicada : ' · sin versión vigente') + '</span></div>';
    m.q('.modal-hd > div').innerHTML = enc;
    m.q('.modal-body').innerHTML = h;
    var ft = m.q('.modal-footer'); if (!ft) { ft = document.createElement('div'); ft.className = 'modal-footer'; m.q('.modal-card').appendChild(ft); } ft.innerHTML = pie;
    m.qa('[data-t]').forEach(function (b) { b.onclick = function () { D.tab = b.dataset.t; pintarDetalle(D); }; });
    m.qa('[data-ver]').forEach(function (b) { b.onclick = function () { D.ver = +b.dataset.ver; D.tab = 'ficha'; pintarDetalle(D); }; });
    m.qa('[data-a]').forEach(function (b) { b.onclick = function () {
      if (b.getAttribute('aria-disabled')) { var st = m.q('#ti-st'); st.textContent = b.dataset.why; return; }
      var a = L.ACCIONES[b.dataset.a];
      if (a.motivo) TI.pedirMotivo(a.label.replace(' (con motivo)', ''), 'Motivo', function (mot) { ejecutar(D, p.id, b.dataset.a, mot); });
      else ejecutar(D, p.id, b.dataset.a, '');
    }; });
    var e1 = m.q('#ti-edit'); if (e1) e1.onclick = function () { m.cerrar(); abrirEditor(p, v); };
    var e2 = m.q('#ti-resp'); if (e2) e2.onclick = function () { abrirResponsables(p, D); };
    D.refrescar = function () { pintarDetalle(D); };
  }
  function cargarHistorial(D) {
    refP(D.id).collection('historial').orderBy('fecha', 'desc').limit(50).get().then(function (s) { D.historial = s.docs.map(function (d) { return d.data(); }); pintarDetalle(D); })
      .catch(function (e) { D.historial = []; TI.msg('No se pudo leer el historial: ' + TI.errTxt(e)); pintarDetalle(D); });
  }

  /* ===== Acciones de estado (transacción) ===== */
  function ejecutar(D, id, accion, motivo) {
    var pRef = refP(id), a = L.ACCIONES[accion], detalle = a.label;
    db.runTransaction(function (tx) {
      return tx.get(pRef).then(function (ps) {
        if (!ps.exists) throw new Error('El proceso ya no existe.');
        var p = ps.data(); p.id = id;
        return tx.get(pRef.collection('versiones').doc(String(p.versionTrabajo))).then(function (vs) {
          if (!vs.exists) throw new Error('No se encontró la versión de trabajo.');
          var v = vs.data(), cambios = L.aplicarAccion({ user: TI.user, proceso: p, version: v }, accion, { motivo: motivo }), ts = TI.serverTs();
          if (Object.keys(cambios.version).length) tx.update(vs.ref, Object.assign({}, cambios.version, { actualizadoEn: ts }));
          tx.update(pRef, Object.assign({}, cambios.proceso, { actualizadoEn: ts }));
          if (cambios.versionAnterior) tx.update(pRef.collection('versiones').doc(String(cambios.versionAnterior.numero)), { estado: cambios.versionAnterior.estado, actualizadoEn: ts });
          if (cambios.nuevaVersion) tx.set(pRef.collection('versiones').doc(String(cambios.nuevaVersion.numero)), Object.assign({}, cambios.nuevaVersion, { aprobacion: null, creadoEn: ts, actualizadoEn: ts }));
          tx.set(pRef.collection('historial').doc(), { fecha: ts, usuario: TI.user.email, accion: accion, version: v.numero, detalle: detalle + ' → ' + L.ESTADO_LABEL[cambios.proceso.estado || v.estado], motivo: motivo || '' });
          TI.auditar(tx, { accion: accion, tipo: 'proceso', id: id, detalle: (p.codigo || id) + ' v' + v.numero + ': ' + detalle, motivo: motivo });
          return cambios;
        });
      });
    }).then(function () {
      TI.msg('Listo: ' + detalle);
      /* Se lee el proceso y sus versiones frescos: la lista en tiempo real puede tardar un instante en reflejar el cambio. */
      Promise.all([refP(id).get(), refP(id).collection('versiones').orderBy('numero').get()]).then(function (r) {
        if (r[0].exists) { var x = r[0].data(); x.id = id; var i = S.lista.findIndex(function (q) { return q.id === id; }); if (i >= 0) S.lista[i] = x; else S.lista.push(x); }
        D.versiones = r[1].docs.map(function (d) { return d.data(); }); D.ver = null; D.historial = null; pintarDetalle(D); pintar();
      });
    }).catch(function (e) {
      if (e.detalle) { TI.msg('El borrador está incompleto: completa objetivo, alcance y al menos una actividad.'); var p = porId(id), v = (D.versiones || []).filter(function (x) { return x.numero === p.versionTrabajo; })[0]; D.modal.cerrar(); abrirEditor(p, v, true); return; }
      TI.msg('No se pudo completar: ' + TI.errTxt(e));
    });
  }

  /* ===== Editor (crear / editar borrador) ===== */
  var LISTAS = [['entradas', 'Entradas'], ['resultadosEsperados', 'Resultados esperados'], ['sistemas', 'Sistemas involucrados'], ['riesgos', 'Riesgos'], ['controles', 'Controles'], ['evidencias', 'Evidencias requeridas'], ['indicadores', 'Indicadores']];
  var CAMPOS = [['descripcion', 'Descripción *'], ['responsable', 'Responsable *'], ['sistema', 'Sistema involucrado'], ['entrada', 'Entrada necesaria'], ['resultado', 'Resultado esperado'], ['evidencia', 'Evidencia requerida'], ['tiempo', 'Tiempo objetivo'], ['excepciones', 'Excepciones']];
  function opcionesUsuarios(sel) {
    var us = TI.usuariosActivos(); if (!us.length && window.USER_DIR) us = Object.keys(USER_DIR).map(function (e) { return { email: e, nombre: USER_DIR[e].name }; });
    return us.map(function (u) { return '<option value="' + esc(u.email) + '"' + (u.email === sel ? ' selected' : '') + '>' + esc(u.nombre) + ' (' + esc(u.email) + ')</option>'; }).join('');
  }
  function checksParticipantes(sel) {
    var us = TI.usuariosActivos(); if (!us.length && window.USER_DIR) us = Object.keys(USER_DIR).map(function (e) { return { email: e, nombre: USER_DIR[e].name }; });
    return '<div class="ti-checks">' + us.map(function (u) { return '<label><input type="checkbox" class="ti-part" value="' + esc(u.email) + '"' + ((sel || []).indexOf(u.email) >= 0 ? ' checked' : '') + '> ' + esc(u.nombre) + '</label>'; }).join('') + '</div>';
  }
  function filaPaso(s, i) {
    return '<div class="ti-paso" data-i="' + i + '"><div class="ti-paso-h"><b>Paso ' + (i + 1) + '</b><span style="flex:1"></span><button type="button" class="icon-btn" data-mv="-1" aria-label="Subir paso ' + (i + 1) + '">↑</button><button type="button" class="icon-btn" data-mv="1" aria-label="Bajar paso ' + (i + 1) + '">↓</button><button type="button" class="icon-btn" data-rm aria-label="Quitar paso ' + (i + 1) + '">✕</button></div><div class="ti-g3">' +
      CAMPOS.map(function (f) { return '<div class="ti-f"><label for="ps' + i + f[0] + '">' + f[1] + '</label><input id="ps' + i + f[0] + '" class="fi" data-k="' + f[0] + '" value="' + esc(s[f[0] === 'responsable' ? 'responsable' : f[0]]) + '"><div class="ti-err" data-e="paso' + i + '.' + f[0] + '"></div></div>'; }).join('') + '</div></div>';
  }
  function filaDoc(d, i) {
    return '<div class="ti-g2 ti-docrow" data-i="' + i + '"><div class="ti-f"><label>Título</label><input class="fi" data-dk="titulo" value="' + esc(d.titulo) + '"><div class="ti-err" data-e="doc' + i + '.titulo"></div></div><div class="ti-f"><label>Enlace (https://…)</label><div style="display:flex;gap:6px"><input class="fi" data-dk="url" value="' + esc(d.url) + '"><button type="button" class="icon-btn" data-rmdoc aria-label="Quitar documento">✕</button></div><div class="ti-err" data-e="doc' + i + '.url"></div></div></div>';
  }
  function abrirEditor(p, v, mostrarErrores) {
    var nuevo = !p, c = nuevo ? L.contenidoVacio() : JSON.parse(JSON.stringify(v.contenido || L.contenidoVacio()));
    var cab = nuevo ? { nombre: '', categoria: L.CATEGORIAS[0], responsable: TI.user.email, participantes: [], periodoRevisionMeses: 12 } : p;
    var h = '<div class="ti-note">Los documentos se guardan como <b>enlaces</b> (por ejemplo Google Drive). La carga directa de archivos requiere habilitar Firebase Storage y aún no está autorizada.</div>' +
      '<div class="ti-sec">Identificación</div><div class="ti-g2"><div class="ti-f"><label for="e-nombre">Nombre del proceso *</label><input id="e-nombre" class="fi" maxlength="200" value="' + esc(cab.nombre) + '"><div class="ti-err" data-e="nombre"></div></div>' +
      '<div class="ti-f"><label for="e-cat">Categoría</label><select id="e-cat" class="fi">' + L.CATEGORIAS.map(function (x) { return '<option' + (cab.categoria === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="ti-g2"><div class="ti-f"><label for="e-resp">Responsable *</label><select id="e-resp" class="fi">' + opcionesUsuarios(cab.responsable) + '</select></div>' +
      '<div class="ti-f"><label for="e-per">Revisión periódica (meses)</label><input id="e-per" class="fi" type="number" min="1" max="36" value="' + (cab.periodoRevisionMeses || 12) + '"><div class="ti-help">Parámetro editable; no es un plazo oficial de CAFIVER.</div></div></div>' +
      '<div class="ti-f"><label>Participantes <span class="ti-mut">(sin participantes, el proceso se marca como dependiente de una persona)</span></label>' + checksParticipantes(cab.participantes) + '</div>' +
      '<div class="ti-sec">Contenido de la versión</div>' +
      '<div class="ti-f"><label for="e-obj">Objetivo *</label><textarea id="e-obj" class="fi" rows="2">' + esc(c.objetivo) + '</textarea><div class="ti-err" data-e="objetivo"></div></div>' +
      '<div class="ti-f"><label for="e-alc">Alcance *</label><textarea id="e-alc" class="fi" rows="2">' + esc(c.alcance) + '</textarea><div class="ti-err" data-e="alcance"></div></div>' +
      '<div class="ti-f"><label for="e-desc">Descripción</label><textarea id="e-desc" class="fi" rows="2">' + esc(c.descripcion) + '</textarea></div>' +
      '<div class="ti-f"><label for="e-tobj">Tiempo objetivo</label><input id="e-tobj" class="fi" value="' + esc(c.tiempoObjetivo) + '"></div>' +
      '<div class="ti-g2">' + LISTAS.map(function (l) { return '<div class="ti-f"><label for="e-' + l[0] + '">' + l[1] + ' <span class="ti-mut">(uno por línea)</span></label><textarea id="e-' + l[0] + '" class="fi" rows="3">' + esc((c[l[0]] || []).join('\n')) + '</textarea></div>'; }).join('') + '</div>' +
      '<div class="ti-sec">Documentos relacionados (enlaces)</div><div id="e-docs"></div><button type="button" class="btn btn-sm" id="e-adddoc">+ Agregar documento</button>' +
      '<div class="ti-sec">Actividades paso a paso</div><div class="ti-help" style="margin-bottom:8px">Registra solo lo que realmente se hace. No se inventan pasos técnicos.</div><div class="ti-err" data-e="pasos"></div><div id="e-pasos"></div><button type="button" class="btn btn-sm" id="e-addpaso">+ Agregar actividad</button>';
    var m = TI.modal(nuevo ? 'Nuevo proceso' : 'Editar borrador — ' + p.nombre, h, { ancho: true, noCerrarFuera: true, pieHtml: '<button class="btn" id="e-cancel">Cancelar</button><button class="btn btn-blue" id="e-save">Guardar borrador</button>', enfocar: '#e-nombre' });
    function pintarFilas() {
      m.q('#e-pasos').innerHTML = c.pasos.map(filaPaso).join('') || '<div class="ti-mut">Sin actividades todavía.</div>';
      m.q('#e-docs').innerHTML = c.documentosRelacionados.map(filaDoc).join('') || '<div class="ti-mut">Sin documentos.</div>';
      m.qa('.ti-paso').forEach(function (r) {
        var i = +r.dataset.i;
        r.querySelector('[data-rm]').onclick = function () { leer(); c.pasos.splice(i, 1); pintarFilas(); };
        r.querySelectorAll('[data-mv]').forEach(function (b) { b.onclick = function () { leer(); var j = i + +b.dataset.mv; if (j < 0 || j >= c.pasos.length) return; var t = c.pasos[i]; c.pasos[i] = c.pasos[j]; c.pasos[j] = t; pintarFilas(); }; });
      });
      m.qa('[data-rmdoc]').forEach(function (b) { b.onclick = function () { leer(); c.documentosRelacionados.splice(+b.closest('.ti-docrow').dataset.i, 1); pintarFilas(); }; });
    }
    function leer() {
      c.objetivo = m.q('#e-obj').value; c.alcance = m.q('#e-alc').value; c.descripcion = m.q('#e-desc').value; c.tiempoObjetivo = m.q('#e-tobj').value.trim();
      LISTAS.forEach(function (l) { c[l[0]] = L.lineas(m.q('#e-' + l[0]).value); });
      m.qa('.ti-paso').forEach(function (r) { var i = +r.dataset.i; r.querySelectorAll('[data-k]').forEach(function (inp) { c.pasos[i][inp.dataset.k] = inp.value; }); });
      m.qa('.ti-docrow').forEach(function (r) { var i = +r.dataset.i; r.querySelectorAll('[data-dk]').forEach(function (inp) { c.documentosRelacionados[i][inp.dataset.dk] = inp.value; }); });
    }
    function marcar(err) { m.qa('[data-e]').forEach(function (e) { e.textContent = err[e.dataset.e] || ''; }); var primero = m.q('.ti-err:not(:empty)'); if (primero) { var campo = primero.parentElement.querySelector('input,textarea'); if (campo) campo.focus(); } }
    pintarFilas();
    m.q('#e-addpaso').onclick = function () { leer(); c.pasos.push(L.pasoVacio()); pintarFilas(); var l = m.qa('.ti-paso'); l[l.length - 1].querySelector('input').focus(); };
    m.q('#e-adddoc').onclick = function () { leer(); c.documentosRelacionados.push({ titulo: '', url: '' }); pintarFilas(); };
    m.q('#e-cancel').onclick = m.cerrar;
    if (mostrarErrores) marcar(L.validarContenido(c, true));
    m.q('#e-save').onclick = function () {
      leer();
      var err = L.validarContenido(c, false), nombre = m.q('#e-nombre').value.trim();
      if (!nombre) err.nombre = 'El nombre es obligatorio.';
      if (Object.keys(err).length) { marcar(err); TI.msg('Hay ' + Object.keys(err).length + ' campo(s) por corregir.'); return; }
      var per = Math.min(36, Math.max(1, parseInt(m.q('#e-per').value, 10) || 12));
      var cabecera = { nombre: nombre, categoria: m.q('#e-cat').value, responsable: m.q('#e-resp').value, participantes: [].slice.call(m.qa('.ti-part')).filter(function (x) { return x.checked; }).map(function (x) { return x.value; }), periodoRevisionMeses: per };
      var btn = m.q('#e-save'); btn.disabled = true; btn.textContent = 'Guardando…';
      var op = nuevo ? crearProceso(cabecera, c) : guardarBorrador(p, v, cabecera, c);
      op.then(function (id) { m.cerrar(); TI.msg('Borrador guardado'); if (nuevo && id) abrirDetalle(id); })
        .catch(function (e) { btn.disabled = false; btn.textContent = 'Guardar borrador'; TI.msg('No se pudo guardar: ' + TI.errTxt(e)); });
    };
  }
  function datosCabecera(cab) { return { nombre: cab.nombre, categoria: cab.categoria, responsable: cab.responsable, participantes: cab.participantes, periodoRevisionMeses: cab.periodoRevisionMeses }; }
  function crearProceso(cab, contenido) {
    var cRef = db.collection('ti_config').doc('contadores');
    return db.runTransaction(function (tx) {
      return tx.get(cRef).then(function (cs) {
        var n = (cs.exists ? cs.data().procesos || 0 : 0) + 1, id = 'PRO-' + ('000' + n).slice(-3), ts = TI.serverTs(), pRef = refP(id);
        if (cs.exists) tx.update(cRef, { procesos: n }); else tx.set(cRef, { procesos: n });
        tx.set(pRef, Object.assign(datosCabecera(cab), { codigo: id, estado: 'borrador', versionTrabajo: 1, versionPublicada: null, proximaRevision: null, documentado: false, esPlantilla: false, creadoPor: TI.user.email, creadoEn: ts, actualizadoEn: ts }));
        tx.set(pRef.collection('versiones').doc('1'), { numero: 1, estado: 'borrador', contenido: contenido, editores: [TI.user.email], creadoPor: TI.user.email, aprobacion: null, creadoEn: ts, actualizadoEn: ts });
        tx.set(pRef.collection('historial').doc(), { fecha: ts, usuario: TI.user.email, accion: 'crear', version: 1, detalle: 'Proceso creado como borrador', motivo: '' });
        TI.auditar(tx, { accion: 'crear_proceso', tipo: 'proceso', id: id, detalle: id + ': ' + cab.nombre });
        return id;
      });
    });
  }
  function guardarBorrador(p, v, cab, contenido) {
    var batch = db.batch(), ts = TI.serverTs(), pRef = refP(p.id);
    batch.update(pRef.collection('versiones').doc(String(v.numero)), { contenido: contenido, editores: firebase.firestore.FieldValue.arrayUnion(TI.user.email), actualizadoEn: ts });
    batch.update(pRef, Object.assign(datosCabecera(cab), { actualizadoEn: ts }));
    batch.set(pRef.collection('historial').doc(), { fecha: ts, usuario: TI.user.email, accion: 'editar', version: v.numero, detalle: 'Borrador editado', motivo: '' });
    TI.auditar(batch, { accion: 'editar_procedimiento', tipo: 'proceso', id: p.id, detalle: (p.codigo || p.id) + ' v' + v.numero + ' editado' });
    return batch.commit().then(function () { return p.id; });
  }

  /* Responsables, participantes y periodo de revisión (no cambia el contenido ni el estado). */
  function abrirResponsables(p, D) {
    var m = TI.modal('Responsables y revisión', '<div class="ti-f"><label for="r-resp">Responsable *</label><select id="r-resp" class="fi">' + opcionesUsuarios(p.responsable) + '</select></div><div class="ti-f"><label>Participantes</label>' + checksParticipantes(p.participantes) + '</div><div class="ti-f"><label for="r-per">Revisión periódica (meses)</label><input id="r-per" class="fi" type="number" min="1" max="36" value="' + (p.periodoRevisionMeses || 12) + '"></div><div class="ti-help">Este cambio queda en el historial y en la auditoría. No modifica el contenido ni el estado de la versión.</div>',
      { pieHtml: '<button class="btn" id="r-c">Cancelar</button><button class="btn btn-blue" id="r-ok">Guardar</button>', enfocar: '#r-resp' });
    m.q('#r-c').onclick = m.cerrar;
    m.q('#r-ok').onclick = function () {
      var cambios = { responsable: m.q('#r-resp').value, participantes: [].slice.call(m.qa('.ti-part')).filter(function (x) { return x.checked; }).map(function (x) { return x.value; }), periodoRevisionMeses: Math.min(36, Math.max(1, parseInt(m.q('#r-per').value, 10) || 12)) };
      var batch = db.batch(), ts = TI.serverTs(), pRef = refP(p.id);
      batch.update(pRef, Object.assign({}, cambios, { actualizadoEn: ts }));
      batch.set(pRef.collection('historial').doc(), { fecha: ts, usuario: TI.user.email, accion: 'responsables', version: p.versionTrabajo, detalle: 'Responsable: ' + cambios.responsable + '; participantes: ' + (cambios.participantes.join(', ') || 'ninguno'), motivo: '' });
      TI.auditar(batch, { accion: 'cambio_responsables', tipo: 'proceso', id: p.id, detalle: (p.codigo || p.id) + ' responsable ' + cambios.responsable });
      batch.commit().then(function () { m.cerrar(); TI.msg('Responsables actualizados'); if (D) { D.historial = null; } }).catch(function (e) { TI.msg('No se pudo guardar: ' + TI.errTxt(e)); });
    };
  }

  /* ===== Catálogo inicial: solo nombre y categoría, como borradores vacíos y sin responsable asignado ===== */
  function cargarCatalogo() {
    var existentes = {}; S.lista.forEach(function (p) { existentes[String(p.nombre).trim().toLowerCase()] = 1; });
    var faltan = L.CATALOGO_INICIAL.filter(function (x) { return !existentes[x[0].toLowerCase()]; });
    if (!faltan.length) { TI.msg('El catálogo inicial ya está cargado.'); return; }
    if (faltan.length > 100) return;
    TI.confirmar('¿Cargar catálogo inicial?', 'Se crearán ' + faltan.length + ' procesos como BORRADORES vacíos (solo nombre y categoría), sin responsable ni pasos. No se inventa ningún procedimiento.', 'Cargar catálogo', function () {
      /* Tandas de 8: las reglas de Firestore permiten 20 consultas de documentos por lote y cada proceso usa 2. */
      var tandas = []; for (var i = 0; i < faltan.length; i += 8) tandas.push(faltan.slice(i, i + 8));
      var hechos = 0;
      tandas.reduce(function (prev, tanda) { return prev.then(function () { return cargarTanda(tanda).then(function () { hechos += tanda.length; }); }); }, Promise.resolve())
        .then(function () { TI.msg('Catálogo cargado: ' + hechos + ' borradores'); })
        .catch(function (e) { TI.msg('Se cargaron ' + hechos + ' de ' + faltan.length + '. Error: ' + TI.errTxt(e) + '. Puedes repetir la carga: no se duplican los ya creados.'); });
    });
  }
  function cargarTanda(tanda) {
    var cRef = db.collection('ti_config').doc('contadores');
    return db.runTransaction(function (tx) {
      return tx.get(cRef).then(function (cs) {
        var n = cs.exists ? cs.data().procesos || 0 : 0, ts = TI.serverTs(), ini = n;
        tanda.forEach(function (x) {
          n++; var id = 'PRO-' + ('000' + n).slice(-3), pRef = refP(id), c = L.contenidoVacio();
          tx.set(pRef, { codigo: id, nombre: x[0], categoria: x[1], responsable: '', participantes: [], periodoRevisionMeses: 12, estado: 'borrador', versionTrabajo: 1, versionPublicada: null, proximaRevision: null, documentado: false, esPlantilla: true, creadoPor: TI.user.email, creadoEn: ts, actualizadoEn: ts });
          tx.set(pRef.collection('versiones').doc('1'), { numero: 1, estado: 'borrador', contenido: c, editores: [TI.user.email], creadoPor: TI.user.email, aprobacion: null, creadoEn: ts, actualizadoEn: ts });
        });
        if (cs.exists) tx.update(cRef, { procesos: n }); else tx.set(cRef, { procesos: n });
        TI.auditar(tx, { accion: 'cargar_catalogo', tipo: 'proceso', id: 'PRO-' + ('000' + (ini + 1)).slice(-3) + '…PRO-' + ('000' + n).slice(-3), detalle: 'Catálogo inicial: ' + tanda.length + ' plantillas en borrador' });
      });
    });
  }
})();
