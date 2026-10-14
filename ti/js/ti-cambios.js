/* CAFIVER TI — Módulo "Gestión de cambios".
   Datos: ti_cambios/{CHG-####} · /historial/* · ti_config/contadores.cambios. El cambio guarda solo los IDs de los equipos afectados.
   Reglas de negocio (riesgo, estados, aprobación, conflictos, indicadores) en ti-logic.js. */
(function () {
  'use strict';
  var TI = window.TI, L = TI.L, esc = TI.esc;
  var S = { abiertos: {}, recientes: {}, propios: {}, lista: [], cargado: false, error: '', detalle: null, el: null, filtro: vacio() };
  var oyentes = [];
  function vacio() { return { q: '', estado: '', tipo: '', riesgo: '', kpi: '' }; }

  TI.registrarVista('ti-cambios', {
    permitido: function (u) { return L.tiene(u, 'cambios.crear') || L.tiene(u, 'cambios.ver_propios') || L.tiene(u, 'cambios.ver_todos'); },
    render: function (el, params) { S.el = el; suscribir(); if (params && params.kpi) S.filtro = Object.assign(vacio(), { kpi: params.kpi }); pintar(); if (params && params.abrir) abrirDetalle(params.abrir); },
    destruir: function () { S.abiertos = {}; S.recientes = {}; S.propios = {}; S.lista = []; S.cargado = false; S.error = ''; S.el = null; S.detalle = null; S.filtro = vacio(); oyentes = []; }
  });

  /* ===== Datos ===== */
  function recomponer() {
    var m = {}; [S.abiertos, S.recientes, S.propios].forEach(function (o) { Object.keys(o).forEach(function (k) { m[k] = o[k]; }); });
    S.lista = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return (b.creadoMs || 0) - (a.creadoMs || 0); });
  }
  function aMapa(snap) { var o = {}; snap.docs.forEach(function (d) { var x = d.data(); x.id = d.id; o[d.id] = x; }); return o; }
  function avisar() { oyentes.forEach(function (f) { try { f(); } catch (e) {} }); }
  function suscribir() {
    if (S.cargado) return; S.cargado = true;
    function ante(k) { return function (snap) { S[k] = aMapa(snap); S.error = ''; recomponer(); pintar(); if (S.detalle && S.detalle.modal && document.body.contains(S.detalle.modal.el)) pintarDetalle(S.detalle); avisar(); }; }
    function falla(err) { S.error = err.code === 'permission-denied' ? 'permiso' : TI.errTxt(err); pintar(); avisar(); }
    var col = db.collection('ti_cambios');
    if (TI.puede('cambios.ver_todos')) {
      TI.unsubs.push(col.where('estado', 'in', L.CAMBIO_ABIERTOS).onSnapshot(ante('abiertos'), falla));
      TI.unsubs.push(col.where('finalizadoMs', '>', Date.now() - L.VENTANA_CAMBIOS_DIAS * 86400000).onSnapshot(ante('recientes'), falla));
    } else {
      TI.unsubs.push(col.where('solicitanteEmail', '==', TI.user.email).onSnapshot(ante('propios'), falla));
      TI.unsubs.push(col.where('responsableImpl', '==', TI.user.email).onSnapshot(ante('abiertos'), falla));
    }
  }
  TI.datosCambios = { lista: function () { return S.lista; }, asegurar: suscribir, error: function () { return S.error; }, alCambiar: function (f) { if (oyentes.indexOf(f) < 0) oyentes.push(f); } };
  function porId(id) { return S.lista.filter(function (c) { return c.id === id; })[0]; }
  function refC(id) { return db.collection('ti_cambios').doc(id); }

  /* ===== Presentación ===== */
  function pillE(e) { return '<span class="pill ti-ce ti-ce-' + e + '">' + esc(L.CAMBIO_ESTADO_LABEL[e] || e) + '</span>'; }
  function pillR(r) { return '<span class="pill ti-cr ti-cr-' + esc(r) + '">Riesgo ' + esc((L.RIESGO_LABEL[r] || '—').toLowerCase()) + '</span>'; }
  function fh(ms) { return ms ? TI.fechaHora(ms) : '—'; }
  function aLocal(ms) { if (!ms) return ''; var d = new Date(ms), p = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function deLocal(v) { var t = v ? new Date(v).getTime() : 0; return isNaN(t) ? 0 : t; }
  function nombre(e) { return e ? esc(TI.nombreDe(e)) : '<span class="ti-mut">Sin asignar</span>'; }

  /* ===== Lista ===== */
  var KPIS = [['abiertos', 'Cambios abiertos', 'Borrador, en aprobación, aprobados o en curso.'], ['pendientesAprobacion', 'Pendientes de aprobación', 'Esperan decisión del Gerente.'], ['programados7d', 'Programados en 7 días', 'Aprobados con ventana próxima.'],
    ['vencidos', 'Ventana vencida', 'Aprobados cuya ventana ya pasó sin implementarse.'], ['emergencias', 'Emergencias', 'Cambios de emergencia no cancelados.']];
  function filtrar() {
    var f = S.filtro, kp = f.kpi ? L.filtroCambios(f.kpi, Date.now()) : null, q = f.q.trim().toLowerCase();
    return S.lista.filter(function (c) {
      if (kp && !kp(c)) return false;
      if (f.estado && c.estado !== f.estado) return false; if (f.tipo && c.tipo !== f.tipo) return false; if (f.riesgo && c.riesgo !== f.riesgo) return false;
      if (q && (c.codigo + ' ' + c.titulo + ' ' + (c.sistema || '') + ' ' + (c.activoIds || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function pintar() {
    var el = S.el; if (!el) return;
    var todos = TI.puede('cambios.ver_todos'), h = '<div class="ti-head"><div><h1 class="ti-h1">Gestión de cambios</h1><div class="ti-sub">' + (todos ? 'Solicitudes de cambio con riesgo, plan de reversa, aprobación y ventana de implementación.' : 'Tus solicitudes de cambio y los que tienes asignados para implementar.') + '</div></div></div>';
    if (S.error === 'permiso') { el.innerHTML = h + '<div class="ti-note err"><b>Sin acceso a los datos.</b> Si el problema continúa, el administrador debe publicar las reglas de <code>firestore.rules</code>.</div>'; return; }
    if (S.error) { el.innerHTML = h + '<div class="ti-note err">No se pudo cargar: ' + esc(S.error) + '</div>'; return; }
    var ind = L.indicadoresCambios(S.lista, Date.now());
    if (todos) h += '<div class="ti-kpis">' + KPIS.map(function (k) { return '<button class="ti-kpi' + (S.filtro.kpi === k[0] ? ' on' : '') + '" data-kpi="' + k[0] + '" aria-pressed="' + (S.filtro.kpi === k[0]) + '"><div class="ti-kl">' + k[1] + '</div><div class="ti-kv">' + ind[k[0]] + '</div><div class="ti-kd">' + esc(k[2]) + '</div></button>'; }).join('') + '</div>';
    h += '<div class="ti-tools"><input id="cm-q" class="fi-sm" type="search" placeholder="Buscar por folio, título, sistema o equipo" aria-label="Buscar cambio" value="' + esc(S.filtro.q) + '" style="min-width:250px">' +
      '<select id="cm-fe" class="fi-sm" aria-label="Filtrar por estado"><option value="">Todos los estados</option>' + L.ESTADOS_CAMBIO.map(function (e) { return '<option value="' + e + '"' + (S.filtro.estado === e ? ' selected' : '') + '>' + L.CAMBIO_ESTADO_LABEL[e] + '</option>'; }).join('') + '</select>' +
      '<select id="cm-ft" class="fi-sm" aria-label="Filtrar por tipo"><option value="">Todos los tipos</option>' + Object.keys(L.TIPOS_CAMBIO).map(function (t) { return '<option value="' + t + '"' + (S.filtro.tipo === t ? ' selected' : '') + '>' + L.TIPOS_CAMBIO[t] + '</option>'; }).join('') + '</select>' +
      '<select id="cm-fr" class="fi-sm" aria-label="Filtrar por riesgo"><option value="">Todos los riesgos</option>' + Object.keys(L.RIESGO_LABEL).map(function (r) { return '<option value="' + r + '"' + (S.filtro.riesgo === r ? ' selected' : '') + '>Riesgo ' + L.RIESGO_LABEL[r].toLowerCase() + '</option>'; }).join('') + '</select>' +
      ((S.filtro.kpi || S.filtro.estado || S.filtro.tipo || S.filtro.riesgo || S.filtro.q) ? '<button class="btn btn-sm" id="cm-lim">Limpiar filtros</button>' : '') + '<span style="flex:1"></span>' +
      (TI.puede('cambios.crear') ? '<button class="btn btn-blue btn-sm" id="cm-nuevo">+ Nuevo cambio</button>' : '') + '</div>';
    var rows = filtrar();
    h += '<div class="ti-card"><div class="ti-scroll"><table class="ti-table"><caption class="ti-sr">Cambios</caption><thead><tr><th>Folio</th><th>Cambio</th><th>Tipo</th><th>Riesgo</th><th>Estado</th><th>Ventana planeada</th><th>Implementa</th></tr></thead><tbody>';
    if (!S.lista.length) h += '<tr><td colspan="7" class="ti-empty">Aún no hay cambios. ' + (TI.puede('cambios.crear') ? 'Crea el primero con "Nuevo cambio".' : '') + '</td></tr>';
    else if (!rows.length) h += '<tr><td colspan="7" class="ti-empty">Ningún cambio coincide con los filtros.</td></tr>';
    rows.forEach(function (c) { h += '<tr class="ti-row" tabindex="0" role="button" data-id="' + esc(c.id) + '"><td class="ti-code">' + esc(c.codigo || c.id) + '</td><td><b>' + esc(c.titulo) + '</b><div class="ti-mut" style="font-size:11px">' + esc(c.sistema || '') + '</div></td><td>' + esc(L.TIPOS_CAMBIO[c.tipo] || c.tipo) + (c.tipo === 'emergencia' ? ' <i class="ti ti-bolt" aria-hidden="true"></i>' : '') + '</td><td>' + (c.riesgo ? pillR(c.riesgo) : '<span class="ti-mut">—</span>') + '</td><td>' + pillE(c.estado) + '</td><td>' + (c.inicioMs ? fh(c.inicioMs) + ' – ' + fh(c.finMs) : '<span class="ti-mut">Sin definir</span>') + '</td><td>' + nombre(c.responsableImpl) + '</td></tr>'; });
    h += '</tbody></table></div></div>';
    if (todos) h += '<div class="ti-note">Se muestran los cambios abiertos y los finalizados en los últimos ' + ind.ventanaDias + ' días. Tasa de éxito: ' + (ind.tasaExito === null ? '<b>muestra insuficiente</b> (se requieren ≥' + ind.muestraMinima + ' cambios finalizados; hay ' + ind.finalizados + ')' : '<b>' + ind.tasaExito + '%</b> (' + ind.exitosos + ' de ' + ind.finalizados + ' sin falla)') + '. El riesgo es impacto × probabilidad de falla (≥6 alto, 3–4 medio, ≤2 bajo); es una convención editable en código, no una política oficial.</div>';
    var foco = document.activeElement && document.activeElement.id, pos = document.activeElement && document.activeElement.selectionStart;
    el.innerHTML = h; ligar(el);
    if (foco === 'cm-q') { var q = el.querySelector('#cm-q'); q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) {} }
  }
  function ligar(el) {
    el.querySelectorAll('[data-kpi]').forEach(function (b) { b.onclick = function () { S.filtro.kpi = S.filtro.kpi === b.dataset.kpi ? '' : b.dataset.kpi; pintar(); }; });
    el.querySelectorAll('.ti-row').forEach(function (r) { r.onclick = function () { abrirDetalle(r.dataset.id); }; r.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirDetalle(r.dataset.id); } }; });
    var q = el.querySelector('#cm-q'); if (q) q.oninput = function () { S.filtro.q = q.value; pintar(); };
    [['cm-fe', 'estado'], ['cm-ft', 'tipo'], ['cm-fr', 'riesgo']].forEach(function (x) { var s = el.querySelector('#' + x[0]); if (s) s.onchange = function () { S.filtro[x[1]] = s.value; pintar(); }; });
    var lim = el.querySelector('#cm-lim'); if (lim) lim.onclick = function () { S.filtro = vacio(); pintar(); };
    var nu = el.querySelector('#cm-nuevo'); if (nu) nu.onclick = function () { abrirEditor(null); };
  }

  /* ===== Editor (crear / editar borrador) ===== */
  function opts(obj, sel, vacioTxt) { return (vacioTxt ? '<option value="">' + vacioTxt + '</option>' : '') + Object.keys(obj).map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(obj[k]) + '</option>'; }).join(''); }
  function implementadores() { return TI.usuariosActivos().filter(function (x) { var u = { roles: x.roles }; return L.tiene(u, 'cambios.implementar') || L.tiene(u, 'cambios.implementar_todos'); }); }
  function abrirEditor(c, mostrarErrores) {
    var nuevo = !c, d = c ? JSON.parse(JSON.stringify(c)) : { tipo: 'normal', evidencias: [], responsableImpl: TI.user.email }, evs = d.evidencias || [];
    var imp = implementadores(), ta = function (id, k, lab, filas) { return '<div class="ti-f"><label for="' + id + '">' + lab + '</label><textarea id="' + id + '" class="fi" rows="' + (filas || 3) + '" maxlength="3000">' + esc(d[k]) + '</textarea><div class="ti-err" data-e="' + k + '"></div></div>'; };
    var h = '<div class="ti-note">Un borrador solo exige el título. Para enviarlo a aprobación debe tener descripción, justificación, planes de implementación, pruebas y <b>reversa</b>, riesgo y ventana. Los equipos se guardan por ID; las evidencias son enlaces https.</div>' +
      '<div class="ti-g2"><div class="ti-f"><label for="c-tit">Título *</label><input id="c-tit" class="fi" maxlength="200" value="' + esc(d.titulo) + '"><div class="ti-err" data-e="titulo"></div></div><div class="ti-f"><label for="c-tipo">Tipo *</label><select id="c-tipo" class="fi">' + opts(L.TIPOS_CAMBIO, d.tipo) + '</select><div class="ti-help">Emergencia: atiende una falla en curso; el Gerente la aprueba aunque la haya solicitado, con motivo.</div></div></div>' +
      ta('c-desc', 'descripcion', 'Descripción *') + ta('c-just', 'justificacion', 'Justificación (por qué es necesario) *', 2) +
      '<div class="ti-g2"><div class="ti-f"><label for="c-sis">Sistema o servicio afectado *</label><input id="c-sis" class="fi" maxlength="100" value="' + esc(d.sistema) + '"><div class="ti-err" data-e="sistema"></div></div><div class="ti-f"><label for="c-act">Equipos afectados (IDs separados por coma)</label><input id="c-act" class="fi" maxlength="300" value="' + esc(d.activoIds) + '"><div class="ti-err" data-e="activoIds"></div></div></div>' +
      '<div class="ti-g3"><div class="ti-f"><label for="c-imp">Impacto si algo sale mal *</label><select id="c-imp" class="fi">' + opts(L.IMPACTOS, d.impacto, 'Elige…') + '</select><div class="ti-err" data-e="impacto"></div></div><div class="ti-f"><label for="c-prob">Probabilidad de falla *</label><select id="c-prob" class="fi">' + opts(L.PROBABILIDADES, d.probabilidad, 'Elige…') + '</select><div class="ti-err" data-e="probabilidad"></div></div><div class="ti-f"><label>Riesgo resultante</label><div id="c-ries" aria-live="polite"></div></div></div>' +
      '<div class="ti-g3"><div class="ti-f"><label for="c-ini">Inicio de la ventana *</label><input id="c-ini" type="datetime-local" class="fi" value="' + aLocal(d.inicioMs) + '"><div class="ti-err" data-e="inicioMs"></div></div><div class="ti-f"><label for="c-fin">Fin de la ventana *</label><input id="c-fin" type="datetime-local" class="fi" value="' + aLocal(d.finMs) + '"><div class="ti-err" data-e="finMs"></div></div>' +
      '<div class="ti-f"><label for="c-resp">Quién lo implementa</label><select id="c-resp" class="fi"><option value="">Sin asignar</option>' + imp.map(function (x) { return '<option value="' + esc(x.email) + '"' + (x.email === d.responsableImpl ? ' selected' : '') + '>' + esc(x.nombre) + '</option>'; }).join('') + '</select></div></div>' +
      ta('c-pi', 'planImplementacion', 'Plan de implementación (pasos) *', 4) + ta('c-pp', 'planPruebas', 'Plan de pruebas (cómo se verifica que funcionó) *', 3) + ta('c-pr', 'planReversa', 'Plan de reversa (cómo se deshace si falla) *', 3) +
      '<div class="ti-f"><label for="c-tk">Ticket relacionado (opcional)</label><input id="c-tk" class="fi" maxlength="20" placeholder="TCK-0001" value="' + esc(d.ticketId) + '"></div>' +
      '<div class="ti-sec">Evidencias (enlaces)</div><div id="c-evs"></div><button type="button" class="btn btn-sm" id="c-addev">+ Agregar enlace</button>';
    var m = TI.modal(nuevo ? 'Nuevo cambio' : 'Editar borrador — ' + c.codigo, h, { ancho: true, noCerrarFuera: true, pieHtml: '<button class="btn" id="c-cancel">Cancelar</button><button class="btn btn-blue" id="c-save">Guardar borrador</button>', enfocar: '#c-tit' });
    function filaEv(x, i) { return '<div class="ti-g2 ti-docrow" data-i="' + i + '"><div class="ti-f"><label>Título</label><input class="fi" data-dk="titulo" value="' + esc(x.titulo) + '"><div class="ti-err" data-e="ev' + i + '.titulo"></div></div><div class="ti-f"><label>Enlace (https://…)</label><div style="display:flex;gap:6px"><input class="fi" data-dk="url" value="' + esc(x.url) + '"><button type="button" class="icon-btn" data-rmev aria-label="Quitar evidencia">✕</button></div><div class="ti-err" data-e="ev' + i + '.url"></div></div></div>'; }
    function leerEv() { m.qa('.ti-docrow').forEach(function (r) { var i = +r.dataset.i; r.querySelectorAll('[data-dk]').forEach(function (inp) { evs[i][inp.dataset.dk] = inp.value; }); }); }
    function pintarEv() { m.q('#c-evs').innerHTML = evs.map(filaEv).join('') || '<div class="ti-mut">Sin enlaces.</div>'; m.qa('[data-rmev]').forEach(function (b) { b.onclick = function () { leerEv(); evs.splice(+b.closest('.ti-docrow').dataset.i, 1); pintarEv(); }; }); }
    function riesgo() { var r = L.riesgoDe(m.q('#c-imp').value, m.q('#c-prob').value); m.q('#c-ries').innerHTML = r ? pillR(r) : '<span class="ti-mut">Se calcula con impacto y probabilidad.</span>'; }
    function leer() {
      leerEv(); var x = { titulo: m.q('#c-tit').value, tipo: m.q('#c-tipo').value, descripcion: m.q('#c-desc').value, justificacion: m.q('#c-just').value, sistema: m.q('#c-sis').value, activoIds: m.q('#c-act').value.trim(), impacto: m.q('#c-imp').value, probabilidad: m.q('#c-prob').value,
        inicioMs: deLocal(m.q('#c-ini').value), finMs: deLocal(m.q('#c-fin').value), responsableImpl: m.q('#c-resp').value || null, planImplementacion: m.q('#c-pi').value, planPruebas: m.q('#c-pp').value, planReversa: m.q('#c-pr').value, ticketId: m.q('#c-tk').value.trim(), evidencias: evs.map(function (e) { return { titulo: e.titulo.trim(), url: e.url.trim() }; }) };
      x.riesgo = L.riesgoDe(x.impacto, x.probabilidad); return x;
    }
    function marcar(err) { m.qa('[data-e]').forEach(function (e) { e.textContent = err[e.dataset.e] || ''; }); var p = m.q('.ti-err:not(:empty)'); if (p) { var f = p.parentElement.querySelector('input,textarea,select'); if (f) f.focus(); } }
    pintarEv(); riesgo(); m.q('#c-imp').onchange = riesgo; m.q('#c-prob').onchange = riesgo;
    m.q('#c-addev').onclick = function () { leerEv(); evs.push({ titulo: '', url: '' }); pintarEv(); };
    m.q('#c-cancel').onclick = m.cerrar;
    if (mostrarErrores) marcar(L.validarCambio(leer(), true));
    m.q('#c-save').onclick = function () {
      var x = leer(), err = L.validarCambio(x, false);
      if (x.ticketId && !/^TCK-\d{4,}$/.test(x.ticketId)) err.ticketId = 'Usa un folio como TCK-0001.';
      if (Object.keys(err).length) { marcar(err); TI.msg('Hay ' + Object.keys(err).length + ' campo(s) por corregir.'); return; }
      var btn = m.q('#c-save'); btn.disabled = true; btn.textContent = 'Guardando…';
      (nuevo ? crear(x) : guardar(c, x)).then(function (id) { m.cerrar(); TI.msg('Borrador guardado'); abrirDetalle(id); }).catch(function (e) { btn.disabled = false; btn.textContent = 'Guardar borrador'; TI.msg('No se pudo guardar: ' + TI.errTxt(e)); });
    };
  }
  var CAMPOS = ['titulo', 'tipo', 'descripcion', 'justificacion', 'sistema', 'activoIds', 'impacto', 'probabilidad', 'riesgo', 'inicioMs', 'finMs', 'responsableImpl', 'planImplementacion', 'planPruebas', 'planReversa', 'ticketId', 'evidencias'];
  function soloCampos(x) { var o = {}; CAMPOS.forEach(function (k) { o[k] = x[k] === undefined ? null : x[k]; }); return o; }
  function crear(x) {
    var cRef = db.collection('ti_config').doc('contadores'), ahora = Date.now();
    return db.runTransaction(function (tx) {
      return tx.get(cRef).then(function (cs) {
        var n = (cs.exists ? (cs.data().cambios || 0) : 0) + 1, id = 'CHG-' + ('0000' + n).slice(-4), ts = TI.serverTs(), ref = refC(id);
        if (cs.exists) tx.update(cRef, { cambios: n }); else tx.set(cRef, { cambios: n });
        tx.set(ref, Object.assign(soloCampos(x), { codigo: id, estado: 'borrador', solicitanteEmail: TI.user.email, aprobacion: null, motivoRechazo: '', creadoMs: ahora, creadoEn: ts, actualizadoEn: ts }));
        tx.set(ref.collection('historial').doc(), { fecha: ts, usuario: TI.user.email, accion: 'crear', detalle: 'Cambio creado como borrador (' + (L.TIPOS_CAMBIO[x.tipo]) + ')', motivo: '' });
        TI.auditar(tx, { accion: 'crear_cambio', tipo: 'cambio', id: id, detalle: id + ': ' + x.titulo.trim().slice(0, 120) });
        return id;
      });
    });
  }
  function guardar(c, x) {
    var b = db.batch(), ts = TI.serverTs(), ref = refC(c.id);
    b.update(ref, Object.assign(soloCampos(x), { actualizadoEn: ts }));
    b.set(ref.collection('historial').doc(), { fecha: ts, usuario: TI.user.email, accion: 'editar', detalle: 'Borrador editado', motivo: '' });
    TI.auditar(b, { accion: 'editar_cambio', tipo: 'cambio', id: c.id, detalle: c.id + ' editado' });
    return b.commit().then(function () { return c.id; });
  }

  /* ===== Detalle ===== */
  function abrirDetalle(id) {
    var D = { id: id, tab: 'resumen', historial: null, modal: null };
    S.detalle = D; D.modal = TI.modal(id, '<div class="ti-empty">Cargando…</div>', { ancho: true, alCerrar: function () { if (S.detalle === D) S.detalle = null; } });
    refC(id).get().then(function (s) {
      if (!s.exists) { D.modal.cerrar(); TI.msg('El cambio no existe o no tienes acceso.'); return; }
      var x = s.data(); x.id = id; if (!porId(id) && L.puedeVerCambio(TI.user, x)) { S.propios[id] = x; recomponer(); } pintarDetalle(D);
    }).catch(function (e) { D.modal.cerrar(); TI.msg('No se pudo abrir el cambio: ' + TI.errTxt(e)); });
  }
  function bloque(t) { return t && String(t).trim() ? esc(t) : '<span class="ti-mut">Sin registrar</span>'; }
  function pintarDetalle(D) {
    var m = D.modal; if (!m || !document.body.contains(m.el)) return;
    var c = porId(D.id); if (!c) return; var u = TI.user, h = '';
    h += '<div class="ti-tabs" role="tablist">' + [['resumen', 'Resumen'], ['planes', 'Planes'], ['historial', 'Historial']].filter(function (t) { return TI.puede('cambios.ver_todos') || t[0] !== 'historial'; }).map(function (t) { return '<button role="tab" data-t="' + t[0] + '" aria-selected="' + (D.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>';
    if (D.tab === 'resumen') {
      var conf = c.inicioMs && ['borrador', 'pendiente_aprobacion', 'aprobado', 'en_implementacion'].indexOf(c.estado) >= 0 ? L.conflictosCambio(c, S.lista) : [];
      if (conf.length) h += '<div class="ti-note warn"><b>Posible choque de ventanas.</b> Se traslapa con ' + conf.map(function (o) { return esc(o.codigo || o.id) + ' (' + esc(o.titulo) + ')'; }).join(', ') + ' sobre el mismo sistema o equipo.</div>';
      h += '<dl class="ti-dl"><dt>Tipo</dt><dd>' + esc(L.TIPOS_CAMBIO[c.tipo] || c.tipo) + '</dd><dt>Solicitante</dt><dd>' + nombre(c.solicitanteEmail) + '</dd><dt>Implementa</dt><dd>' + nombre(c.responsableImpl) + '</dd>' +
        '<dt>Sistema</dt><dd>' + bloque(c.sistema) + '</dd><dt>Equipos (ID)</dt><dd>' + bloque(c.activoIds) + '</dd><dt>Ticket relacionado</dt><dd>' + (c.ticketId ? '<span class="ti-code">' + esc(c.ticketId) + '</span>' : '<span class="ti-mut">—</span>') + '</dd>' +
        '<dt>Impacto / probabilidad</dt><dd>' + esc(L.IMPACTOS[c.impacto] || '—') + ' / ' + esc(L.PROBABILIDADES[c.probabilidad] || '—') + ' → ' + (c.riesgo ? pillR(c.riesgo) : '—') + '</dd>' +
        '<dt>Ventana planeada</dt><dd>' + (c.inicioMs ? fh(c.inicioMs) + ' a ' + fh(c.finMs) : '<span class="ti-mut">Sin definir</span>') + '</dd><dt>Descripción</dt><dd>' + bloque(c.descripcion) + '</dd><dt>Justificación</dt><dd>' + bloque(c.justificacion) + '</dd>' +
        '<dt>Evidencias</dt><dd>' + ((c.evidencias || []).length ? '<ul class="ti-ul">' + c.evidencias.map(function (d) { return '<li>' + (L.urlSegura(d.url) ? '<a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">' + esc(d.titulo) + '</a>' : esc(d.titulo)) + '</li>'; }).join('') + '</ul>' : '<span class="ti-mut">Sin enlaces</span>') + '</dd>' +
        '<dt>Aprobación</dt><dd>' + (c.aprobacion ? 'Aprobó <b>' + esc(TI.nombreDe(c.aprobacion.por)) + '</b> el ' + fh(c.aprobacion.fecha) + (c.aprobacion.excepcion ? ' <span class="ti-tag">emergencia: aprobación propia con motivo</span>' : '') : '<span class="ti-mut">Sin aprobación</span>') + '</dd>' +
        (c.motivoRechazo ? '<dt>Último motivo de rechazo o devolución</dt><dd>' + esc(c.motivoRechazo) + '</dd>' : '') +
        (c.inicioRealMs ? '<dt>Implementación real</dt><dd>' + fh(c.inicioRealMs) + ' a ' + fh(c.finRealMs) + '</dd>' : '') + (c.resultado ? '<dt>Resultado</dt><dd>' + esc(c.resultado) + (c.fallo ? ' <span class="ti-tag bad">' + (c.revertido ? 'fallido y revertido' : 'fallido') + '</span>' : '') + '</dd>' : '') + (c.revision ? '<dt>Revisión posterior</dt><dd>' + esc(c.revision) + '</dd>' : '') + '</dl>';
    }
    if (D.tab === 'planes') h += '<dl class="ti-dl"><dt>Plan de implementación</dt><dd>' + bloque(c.planImplementacion) + '</dd><dt>Plan de pruebas</dt><dd>' + bloque(c.planPruebas) + '</dd><dt>Plan de reversa</dt><dd>' + bloque(c.planReversa) + '</dd></dl>';
    if (D.tab === 'historial') {
      if (D.historial === null) { h += '<div class="ti-empty">Cargando historial…</div>'; cargarHistorial(D); }
      else h += D.historial.length ? '<div class="ti-tl">' + D.historial.map(function (x) { return '<div><b>' + esc(x.accion) + '</b> <span class="ti-mut">' + esc(TI.nombreDe(x.usuario)) + ' · ' + TI.fechaHora(x.fecha) + '</span>' + (x.detalle ? '<br><span class="ti-mut">' + esc(x.detalle) + '</span>' : '') + (x.motivo ? '<br><i>Motivo:</i> ' + esc(x.motivo) : '') + '</div>'; }).join('') + '</div>' : '<div class="ti-empty">Sin eventos.</div>';
    }
    h += '<div class="ti-status" id="ti-st" role="status"></div>';
    var pie = '';
    if (c.estado === 'borrador' && (c.solicitanteEmail === u.email || TI.puede('cambios.implementar_todos'))) pie += '<button class="btn" id="cm-edit">Editar borrador</button>';
    L.accionesCambioDisponibles({ user: u, cambio: c }).forEach(function (a) { var neg = ['rechazar', 'cancelar', 'finalizar_fallo', 'devolver'].indexOf(a.id) >= 0; pie += '<button class="btn ' + (a.ok ? (neg ? '' : 'btn-blue') : 'ti-off') + '" data-a="' + a.id + '" ' + (a.ok ? '' : 'aria-disabled="true" data-why="' + esc(a.motivo) + '"') + '>' + esc(a.label) + '</button>'; });
    if (!pie) pie = '<span class="ti-mut">Sin acciones disponibles con tu rol en este estado.</span>';
    m.q('.modal-hd > div').innerHTML = '<h3>' + esc(c.codigo || c.id) + ' · ' + esc(c.titulo) + '</h3><div style="margin-top:4px">' + pillE(c.estado) + ' ' + (c.riesgo ? pillR(c.riesgo) : '') + '</div>';
    m.q('.modal-body').innerHTML = h;
    var ft = m.q('.modal-footer'); if (!ft) { ft = document.createElement('div'); ft.className = 'modal-footer'; m.q('.modal-card').appendChild(ft); } ft.innerHTML = pie;
    m.qa('[data-t]').forEach(function (b) { b.onclick = function () { D.tab = b.dataset.t; pintarDetalle(D); }; });
    m.qa('[data-a]').forEach(function (b) { b.onclick = function () { if (b.getAttribute('aria-disabled')) { m.q('#ti-st').textContent = b.dataset.why; return; } dialogo(D, c, b.dataset.a); }; });
    var ed = m.q('#cm-edit'); if (ed) ed.onclick = function () { m.cerrar(); abrirEditor(c); };
  }
  function cargarHistorial(D) {
    refC(D.id).collection('historial').orderBy('fecha', 'desc').limit(60).get().then(function (s) { D.historial = s.docs.map(function (d) { return d.data(); }); pintarDetalle(D); }).catch(function (e) { D.historial = []; TI.msg('No se pudo leer el historial: ' + TI.errTxt(e)); pintarDetalle(D); });
  }

  /* ===== Acciones (transacción: cambio + historial + auditoría) ===== */
  var ETIQ = { motivo: 'Motivo', resultado: 'Resultado (qué ocurrió)', revision: 'Revisión posterior (qué salió bien o mal y qué se aprende)' };
  function dialogo(D, c, accion) {
    var a = L.ACCIONES_CAMBIO[accion], req = (a.requiere || []).slice();
    if (accion === 'aprobar' && c.solicitanteEmail === TI.user.email) req.push('motivo');
    if (accion === 'aprobar') { var conf = L.conflictosCambio(c, S.lista); if (conf.length) { TI.confirmar('Choque de ventanas', 'Este cambio se traslapa con ' + conf.map(function (o) { return o.codigo || o.id; }).join(', ') + ' sobre el mismo sistema o equipo. ¿Aprobarlo de todos modos?', 'Continuar', function () { dialogoCampos(D, c, accion, req, a); }); return; } }
    dialogoCampos(D, c, accion, req, a);
  }
  function dialogoCampos(D, c, accion, req, a) {
    if (!req.length) { ejecutar(D, c, accion, {}); return; }
    var h = req.map(function (k) { return '<div class="ti-f"><label for="ac-' + k + '">' + esc(accion === 'aprobar' && k === 'motivo' ? 'Motivo de la aprobación propia (emergencia)' : ETIQ[k]) + ' *</label><textarea id="ac-' + k + '" class="fi" rows="3" maxlength="2000"></textarea></div>'; }).join('');
    if (accion === 'finalizar_fallo') h += '<label class="ti-chk"><input type="checkbox" id="ac-rev"> Se revirtió el cambio (plan de reversa aplicado)</label>';
    h += '<div class="ti-err" id="ac-e" role="alert"></div>';
    var m = TI.modal(a.label, h, { pieHtml: '<button class="btn" id="ac-c">Cancelar</button><button class="btn btn-blue" id="ac-ok">Continuar</button>', enfocar: '#ac-' + req[0] });
    m.q('#ac-c').onclick = m.cerrar;
    m.q('#ac-ok').onclick = function () {
      var datos = {}; req.forEach(function (k) { datos[k] = m.q('#ac-' + k).value.trim(); });
      if (req.some(function (k) { return !datos[k]; })) { m.q('#ac-e').textContent = 'Completa los campos obligatorios.'; return; }
      if (m.q('#ac-rev')) datos.revertido = m.q('#ac-rev').checked;
      m.cerrar(); ejecutar(D, c, accion, datos);
    };
  }
  function ejecutar(D, c0, accion, datos) {
    var ref = refC(c0.id), ahora = Date.now(), etiqueta = L.ACCIONES_CAMBIO[accion].label;
    db.runTransaction(function (tx) {
      return tx.get(ref).then(function (s0) {
        if (!s0.exists) throw new Error('El cambio ya no existe.');
        var c = s0.data(); c.id = c0.id;
        var r = L.aplicarAccionCambio({ user: TI.user, cambio: c, ahora: ahora }, accion, datos), ts = TI.serverTs();
        tx.update(ref, Object.assign({}, r.cambios, { actualizadoEn: ts }));
        tx.set(ref.collection('historial').doc(), { fecha: ts, usuario: TI.user.email, accion: accion, detalle: r.historial.detalle, motivo: r.historial.motivo });
        TI.auditar(tx, { accion: 'cambio_' + accion, tipo: 'cambio', id: c0.id, detalle: (c.codigo || c0.id) + ': ' + r.historial.detalle, motivo: r.historial.motivo });
      });
    }).then(function () {
      TI.msg('Listo: ' + etiqueta);
      refC(c0.id).get().then(function (s) { if (s.exists) { var x = s.data(); x.id = c0.id; [S.abiertos, S.recientes, S.propios].forEach(function (o) { if (o[c0.id]) o[c0.id] = x; }); if (!porId(c0.id)) S.propios[c0.id] = x; recomponer(); } D.historial = null; pintarDetalle(D); pintar(); });
    }).catch(function (e) {
      if (e.detalle) { TI.msg('El cambio está incompleto: completa los campos marcados.'); D.modal.cerrar(); abrirEditor(c0, true); return; }
      TI.msg('No se pudo completar: ' + TI.errTxt(e));
    });
  }
})();
