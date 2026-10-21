/* CAFIVER TI — Módulo "Respaldos" (solo control).
   Esta plataforma NO hace ni verifica respaldos: registra los que se hacen con otras herramientas. Un trabajo sin ejecuciones
   registradas aparece como "sin registros", nunca como "al día".
   Datos: ti_respaldos/{RSP-###} · /ejecuciones/* · /pruebas/* · /historial/* · ti_config/respaldos · ti_config/contadores.respaldos */
(function () {
  'use strict';
  var TI = window.TI, L = TI.L, esc = TI.esc;
  var S = { a: {}, b: {}, cargado: false, error: '', config: null, el: null, detalle: null, filtro: vacio() };
  var oyentes = [];
  function vacio() { return { q: '', estado: '', categoria: '', kpi: '' }; }

  TI.registrarVista('ti-respaldos', {
    permitido: function (u) { return L.tiene(u, 'respaldos.crear') || L.tiene(u, 'respaldos.ver_propios') || L.tiene(u, 'respaldos.ver_todos'); },
    render: function (el, params) { S.el = el; suscribir(); if (params && params.kpi) S.filtro = Object.assign(vacio(), { kpi: params.kpi }); pintar(); if (params && params.abrir) abrir(params.abrir); },
    destruir: function () { S.a = {}; S.b = {}; S.cargado = false; S.error = ''; S.config = null; S.el = null; S.detalle = null; S.filtro = vacio(); oyentes = []; }
  });

  /* ===== Datos ===== */
  function lista() { var m = {}; [S.a, S.b].forEach(function (o) { Object.keys(o).forEach(function (k) { m[k] = o[k]; }); }); return Object.keys(m).map(function (k) { return m[k]; }).filter(function (t) { return t.estado !== 'retirado' || S.filtro.estado === 'retirado'; }).sort(function (x, y) { return String(x.codigo).localeCompare(String(y.codigo)); }); }
  function cfg() { return L.normalizarConfigRespaldos(S.config); }
  function aMapa(snap) { var o = {}; snap.docs.forEach(function (d) { var x = d.data(); x.id = d.id; o[d.id] = x; }); return o; }
  function avisar() { oyentes.forEach(function (f) { try { f(); } catch (e) {} }); }
  function suscribir() {
    if (S.cargado) return; S.cargado = true;
    db.collection('ti_config').doc('respaldos').get().then(function (d) { S.config = d.exists ? d.data() : null; pintar(); avisar(); }).catch(function () {});
    function ante(k) { return function (snap) { S[k] = aMapa(snap); S.error = ''; pintar(); if (S.detalle && S.detalle.modal && document.body.contains(S.detalle.modal.el)) pintarDetalle(S.detalle); avisar(); }; }
    function falla(err) { S.error = err.code === 'permission-denied' ? 'permiso' : TI.errTxt(err); pintar(); avisar(); }
    var col = db.collection('ti_respaldos');
    if (TI.puede('respaldos.ver_todos')) TI.unsubs.push(col.where('estado', 'in', ['activo', 'pausado']).onSnapshot(ante('a'), falla));
    else { TI.unsubs.push(col.where('creadoPor', '==', TI.user.email).onSnapshot(ante('a'), falla)); TI.unsubs.push(col.where('responsable', '==', TI.user.email).onSnapshot(ante('b'), falla)); }
  }
  TI.datosRespaldos = { lista: lista, config: cfg, asegurar: suscribir, error: function () { return S.error; }, alCambiar: function (f) { if (oyentes.indexOf(f) < 0) oyentes.push(f); } };
  function porId(id) { return lista().filter(function (t) { return t.id === id; })[0] || S.a[id] || S.b[id]; }
  function ref(id) { return db.collection('ti_respaldos').doc(id); }

  /* ===== Presentación ===== */
  var EST = { al_dia: ['ok', 'ti-check', 'Al día'], atrasado: ['warn', 'ti-clock-exclamation', 'Atrasado'], fallido: ['bad', 'ti-alert-triangle', 'Último fallido'], sin_registros: ['bad', 'ti-help-circle', 'Sin registros'], pausado: ['n', 'ti-player-pause', 'Pausado'], retirado: ['n', 'ti-archive', 'Retirado'] };
  function insignia(t) {
    var e = L.estadoRespaldo(t, Date.now()), x = EST[e.estado] || EST.sin_registros;
    return '<span class="ti-sem ' + x[0] + '"><i class="ti ' + x[1] + '" aria-hidden="true"></i> ' + x[2] + (e.estado === 'atrasado' ? ' (' + e.dias + ' d)' : '') + '</span>';
  }
  var EP = { vigente: ['ok', 'ti-check', 'Vigente'], parcial: ['warn', 'ti-alert-circle', 'Parcial'], vencida: ['warn', 'ti-clock-exclamation', 'Vencida'], fallida: ['bad', 'ti-alert-triangle', 'Fallida'], nunca: ['bad', 'ti-help-circle', 'Nunca probada'], na: ['n', 'ti-minus', 'No aplica'] };
  function insigniaPrueba(t) { var e = L.estadoPrueba(t, Date.now(), S.config), x = EP[e.estado]; return '<span class="ti-sem ' + x[0] + '"><i class="ti ' + x[1] + '" aria-hidden="true"></i> ' + x[2] + (e.estado === 'vencida' ? ' (' + e.dias + ' d)' : '') + '</span>'; }
  function nombre(e) { return e ? esc(TI.nombreDe(e)) : '<span class="ti-mut">Sin asignar</span>'; }
  function bloque(t) { return t != null && String(t).trim() ? esc(t) : '<span class="ti-mut">Sin registrar</span>'; }
  function cuando(ms) { return ms ? TI.fechaHora(ms) : '—'; }

  /* ===== Lista ===== */
  var KPIS = [['activos', 'Trabajos activos', 'Respaldos que se vigilan.'], ['atrasados', 'Atrasados', 'Pasó su frecuencia sin ejecución.'], ['fallidos', 'Último fallido', 'La última ejecución falló.'], ['sinRegistros', 'Sin registros', 'Nunca se ha registrado una ejecución.'], ['pruebasVencidas', 'Prueba de restauración pendiente', 'Nunca probada, vencida o fallida.']];
  function filtrar() {
    var f = S.filtro, kp = f.kpi ? L.filtroRespaldos(f.kpi, Date.now(), S.config) : null, q = f.q.trim().toLowerCase();
    return lista().filter(function (t) {
      if (kp && !kp(t)) return false; if (f.estado && t.estado !== f.estado) return false; if (f.categoria && t.categoria !== f.categoria) return false;
      return !q || (t.codigo + ' ' + t.nombre + ' ' + (t.que || '') + ' ' + (t.ubicacion || '')).toLowerCase().indexOf(q) >= 0;
    });
  }
  function pintar() {
    var el = S.el; if (!el) return;
    var todos = TI.puede('respaldos.ver_todos'), h = '<div class="ti-head"><div><h1 class="ti-h1">Respaldos</h1><div class="ti-sub">' + (todos ? 'Control de los trabajos de respaldo, sus ejecuciones y sus pruebas de restauración.' : 'Los trabajos de respaldo que creaste o tienes asignados.') + '</div></div></div>';
    h += '<div class="ti-note warn"><b>Esta plataforma no hace respaldos: registra los que tú haces.</b> Un trabajo sin ejecuciones registradas aparece como "sin registros"; no se considera respaldado.</div>';
    if (S.error === 'permiso') { el.innerHTML = h + '<div class="ti-note err"><b>Sin acceso a los datos.</b> Si el problema continúa, el administrador debe publicar las reglas de <code>firestore.rules</code>.</div>'; return; }
    if (S.error) { el.innerHTML = h + '<div class="ti-note err">No se pudo cargar: ' + esc(S.error) + '</div>'; return; }
    var ind = L.indicadoresRespaldos(lista(), Date.now(), S.config);
    if (todos) {
      h += '<div class="ti-kpis">' + KPIS.map(function (k) { var v = k[0] === 'pruebasVencidas' ? ind.pruebasVencidas + ind.pruebasNunca : ind[k[0]]; return '<button class="ti-kpi' + (S.filtro.kpi === k[0] ? ' on' : '') + '" data-kpi="' + k[0] + '" aria-pressed="' + (S.filtro.kpi === k[0]) + '"><div class="ti-kl">' + k[1] + '</div><div class="ti-kv">' + v + '</div><div class="ti-kd">' + esc(k[2]) + '</div></button>'; }).join('') + '</div>';
      h += '<div class="ti-note">Cobertura de pruebas de restauración (trabajos activos con una prueba exitosa de los últimos ' + cfg().pruebaMaxDias + ' días): ' + (ind.coberturaPruebas === null ? '<b>' + ind.pruebasVigentes + ' de ' + ind.activos + '</b> (el porcentaje se muestra con ≥' + ind.muestraMinima + ' trabajos activos)' : '<b>' + ind.coberturaPruebas + '%</b> (' + ind.pruebasVigentes + ' de ' + ind.activos + ')') + '. Intervalos: diario 1, semanal 7, mensual 31, trimestral 92, anual 366 días.</div>';
    }
    h += '<div class="ti-tools"><input id="rs-q" class="fi-sm" type="search" placeholder="Buscar por folio, nombre o ubicación" aria-label="Buscar respaldo" value="' + esc(S.filtro.q) + '" style="min-width:240px">' +
      '<select id="rs-fe" class="fi-sm" aria-label="Filtrar por estado"><option value="">Activos y pausados</option>' + Object.keys(L.ESTADOS_RESPALDO).map(function (e) { return '<option value="' + e + '"' + (S.filtro.estado === e ? ' selected' : '') + '>' + L.ESTADOS_RESPALDO[e] + '</option>'; }).join('') + '</select>' +
      '<select id="rs-fc" class="fi-sm" aria-label="Filtrar por categoría"><option value="">Todas las categorías</option>' + Object.keys(L.CATEGORIAS_RESPALDO).map(function (c) { return '<option value="' + c + '"' + (S.filtro.categoria === c ? ' selected' : '') + '>' + L.CATEGORIAS_RESPALDO[c] + '</option>'; }).join('') + '</select>' +
      ((S.filtro.kpi || S.filtro.estado || S.filtro.categoria || S.filtro.q) ? '<button class="btn btn-sm" id="rs-lim">Limpiar filtros</button>' : '') + '<span style="flex:1"></span>' + (todos ? '<button class="btn btn-sm" id="rs-csv">Exportar CSV</button>' : '') + (TI.puede('respaldos.crear') ? '<button class="btn btn-blue btn-sm" id="rs-nuevo">+ Nuevo trabajo</button>' : '') + '</div>';
    var rows = filtrar();
    h += '<div class="ti-card"><div class="ti-scroll"><table class="ti-table"><caption class="ti-sr">Trabajos de respaldo</caption><thead><tr><th>Folio</th><th>Trabajo</th><th>Categoría</th><th>Frecuencia</th><th>Última ejecución</th><th>Estado</th><th>Prueba de restauración</th><th>Responsable</th></tr></thead><tbody>';
    if (!lista().length) h += '<tr><td colspan="8" class="ti-empty">Aún no hay trabajos de respaldo registrados. ' + (TI.puede('respaldos.crear') ? 'Crea el primero con "Nuevo trabajo".' : '') + '</td></tr>';
    else if (!rows.length) h += '<tr><td colspan="8" class="ti-empty">Ningún trabajo coincide con los filtros.</td></tr>';
    rows.forEach(function (t) { h += '<tr class="ti-row" tabindex="0" role="button" data-id="' + esc(t.id) + '"><td class="ti-code">' + esc(t.codigo || t.id) + '</td><td><b>' + esc(t.nombre) + '</b><div class="ti-mut" style="font-size:11px">' + esc(t.ubicacion || '') + '</div></td><td>' + esc(L.CATEGORIAS_RESPALDO[t.categoria] || t.categoria) + '</td><td>' + esc(L.FRECUENCIAS_RESPALDO[t.frecuencia] || t.frecuencia) + '</td><td>' + (t.ultimaEjecucionMs ? cuando(t.ultimaEjecucionMs) : '<span class="ti-mut">Nunca registrada</span>') + '</td><td>' + insignia(t) + '</td><td>' + insigniaPrueba(t) + '</td><td>' + nombre(t.responsable) + '</td></tr>'; });
    h += '</tbody></table></div></div>';
    var foco = document.activeElement && document.activeElement.id, pos = document.activeElement && document.activeElement.selectionStart;
    el.innerHTML = h; ligar(el);
    if (foco === 'rs-q') { var q = el.querySelector('#rs-q'); q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) {} }
  }
  function ligar(el) {
    el.querySelectorAll('[data-kpi]').forEach(function (b) { b.onclick = function () { S.filtro.kpi = S.filtro.kpi === b.dataset.kpi ? '' : b.dataset.kpi; pintar(); }; });
    el.querySelectorAll('.ti-row').forEach(function (r) { r.onclick = function () { abrir(r.dataset.id); }; r.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(r.dataset.id); } }; });
    var q = el.querySelector('#rs-q'); if (q) q.oninput = function () { S.filtro.q = q.value; pintar(); };
    [['rs-fe', 'estado'], ['rs-fc', 'categoria']].forEach(function (x) { var s = el.querySelector('#' + x[0]); if (s) s.onchange = function () { S.filtro[x[1]] = s.value; pintar(); }; });
    var lim = el.querySelector('#rs-lim'); if (lim) lim.onclick = function () { S.filtro = vacio(); pintar(); };
    var nu = el.querySelector('#rs-nuevo'); if (nu) nu.onclick = function () { editor(null); };
    var cs = el.querySelector('#rs-csv'); if (cs) cs.onclick = exportarCSV;
  }
  function celdaCSV(v) { var s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  function exportarCSV() {
    var rows = filtrar(), cab = ['Folio', 'Trabajo', 'Categoría', 'Frecuencia', 'Ubicación', 'Última ejecución', 'Resultado', 'Estado', 'Última prueba', 'Prueba', 'Responsable'];
    var out = [cab.map(celdaCSV).join(',')].concat(rows.map(function (t) { return [t.codigo, t.nombre, L.CATEGORIAS_RESPALDO[t.categoria], L.FRECUENCIAS_RESPALDO[t.frecuencia], t.ubicacion, t.ultimaEjecucionMs ? cuando(t.ultimaEjecucionMs) : '', t.ultimaEjecucionResultado, L.estadoRespaldo(t, Date.now()).estado, t.ultimaPruebaMs ? cuando(t.ultimaPruebaMs) : '', L.estadoPrueba(t, Date.now(), S.config).estado, t.responsable].map(celdaCSV).join(','); }));
    var blob = new Blob(['﻿' + out.join('\r\n')], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'respaldos-' + L.hoyISO() + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); TI.msg('Exportados ' + rows.length + ' trabajos');
  }

  /* ===== Editor del trabajo ===== */
  function opts(obj, sel, vac) { return (vac ? '<option value="">' + vac + '</option>' : '') + Object.keys(obj).map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(obj[k]) + '</option>'; }).join(''); }
  function respPosibles() { return TI.usuariosActivos().filter(function (x) { return L.tiene({ roles: x.roles }, 'respaldos.crear'); }); }
  function editor(t, mostrarErrores) {
    var nuevo = !t, d = JSON.parse(JSON.stringify(t || { categoria: 'firestore', frecuencia: 'diario', cifrado: 'no_se', responsable: TI.user.email }));
    var inp = function (id, k, lab, tipo, extra) { return '<div class="ti-f"><label for="' + id + '">' + lab + '</label><input id="' + id + '" class="fi" type="' + (tipo || 'text') + '" ' + (extra || '') + ' value="' + esc(d[k] == null ? '' : d[k]) + '"><div class="ti-err" data-e="' + k + '"></div></div>'; };
    var h = '<div class="ti-note">Registra aquí cómo se hace el respaldo. <b>Los objetivos de recuperación (RPO y RTO) los define la Gerencia</b>: déjalos vacíos si aún no existen; no se inventan.</div>' +
      '<div class="ti-g2">' + inp('r-nom', 'nombre', 'Nombre del trabajo *', 'text', 'maxlength="200"') + '<div class="ti-f"><label for="r-cat">Categoría *</label><select id="r-cat" class="fi">' + opts(L.CATEGORIAS_RESPALDO, d.categoria) + '</select></div></div>' +
      '<div class="ti-f"><label for="r-que">Qué se respalda *</label><textarea id="r-que" class="fi" rows="2" maxlength="2000">' + esc(d.que) + '</textarea><div class="ti-err" data-e="que"></div></div>' +
      '<div class="ti-g2">' + inp('r-ubi', 'ubicacion', 'Dónde se guarda *', 'text', 'maxlength="300"') + inp('r-met', 'metodo', 'Método o herramienta', 'text', 'maxlength="300"') + '</div>' +
      '<div class="ti-g3"><div class="ti-f"><label for="r-fre">Frecuencia *</label><select id="r-fre" class="fi">' + opts(L.FRECUENCIAS_RESPALDO, d.frecuencia) + '</select><div class="ti-help">Se considera atrasado al pasar su intervalo.</div></div>' + inp('r-ret', 'retencionDias', 'Retención (días)', 'number', 'min="1"') + '<div class="ti-f"><label for="r-cif">¿Cifrado?</label><select id="r-cif" class="fi">' + opts({ si: 'Sí', no: 'No', no_se: 'No se sabe' }, d.cifrado) + '</select></div></div>' +
      '<div class="ti-g3">' + inp('r-rpo', 'rpoHoras', 'RPO (horas, opcional)', 'number', 'min="1"') + inp('r-rto', 'rtoHoras', 'RTO (horas, opcional)', 'number', 'min="1"') + '<div class="ti-f"><label for="r-res">Responsable *</label><select id="r-res" class="fi"><option value="">Sin asignar</option>' + respPosibles().map(function (x) { return '<option value="' + esc(x.email) + '"' + (x.email === d.responsable ? ' selected' : '') + '>' + esc(x.nombre) + '</option>'; }).join('') + '</select><div class="ti-err" data-e="responsable"></div></div></div>' +
      inp('r-pro', 'procedimientoId', 'Procedimiento relacionado (folio, opcional)', 'text', 'placeholder="PRO-001" maxlength="20"');
    var m = TI.modal(nuevo ? 'Nuevo trabajo de respaldo' : 'Editar — ' + t.codigo, h, { ancho: true, noCerrarFuera: true, pieHtml: '<button class="btn" id="r-c">Cancelar</button><button class="btn btn-blue" id="r-ok">Guardar</button>', enfocar: '#r-nom' });
    function num(id) { var v = m.q(id).value; return v === '' ? null : parseFloat(v); }
    m.q('#r-c').onclick = m.cerrar;
    m.q('#r-ok').onclick = function () {
      var x = { nombre: m.q('#r-nom').value.trim(), categoria: m.q('#r-cat').value, que: m.q('#r-que').value.trim(), ubicacion: m.q('#r-ubi').value.trim(), metodo: m.q('#r-met').value.trim(), frecuencia: m.q('#r-fre').value, retencionDias: num('#r-ret'), cifrado: m.q('#r-cif').value, rpoHoras: num('#r-rpo'), rtoHoras: num('#r-rto'), responsable: m.q('#r-res').value || null, procedimientoId: m.q('#r-pro').value.trim() };
      var err = L.validarRespaldo(x); m.qa('[data-e]').forEach(function (e) { e.textContent = err[e.dataset.e] || ''; });
      if (Object.keys(err).length) { TI.msg('Hay ' + Object.keys(err).length + ' campo(s) por corregir.'); var p = m.q('.ti-err:not(:empty)'); if (p) { var f = p.parentElement.querySelector('input,textarea,select'); if (f) f.focus(); } return; }
      var btn = m.q('#r-ok'); btn.disabled = true;
      (nuevo ? crear(x) : guardar(t, x)).then(function (id) { m.cerrar(); TI.msg('Trabajo guardado'); abrir(id); }).catch(function (e) { btn.disabled = false; TI.msg('No se pudo guardar: ' + TI.errTxt(e)); });
    };
  }
  function crear(x) {
    var cRef = db.collection('ti_config').doc('contadores');
    return db.runTransaction(function (tx) {
      return tx.get(cRef).then(function (cs) {
        var n = (cs.exists ? (cs.data().respaldos || 0) : 0) + 1, id = 'RSP-' + ('000' + n).slice(-3), ts = TI.serverTs(), r = ref(id);
        if (cs.exists) tx.update(cRef, { respaldos: n }); else tx.set(cRef, { respaldos: n });
        tx.set(r, Object.assign({}, x, { codigo: id, estado: 'activo', creadoPor: TI.user.email, ultimaEjecucionMs: null, ultimaEjecucionResultado: null, ultimaPruebaMs: null, ultimaPruebaResultado: null, creadoMs: Date.now(), creadoEn: ts, actualizadoEn: ts }));
        tx.set(r.collection('historial').doc(), { fecha: ts, usuario: TI.user.email, accion: 'crear', detalle: 'Trabajo de respaldo creado', motivo: '' });
        TI.auditar(tx, { accion: 'crear_respaldo', tipo: 'respaldo', id: id, detalle: id + ': ' + x.nombre.slice(0, 120) }); return id;
      });
    });
  }
  function guardar(t, x) {
    var b = db.batch(), ts = TI.serverTs(), r = ref(t.id);
    b.update(r, Object.assign({}, x, { actualizadoEn: ts }));
    b.set(r.collection('historial').doc(), { fecha: ts, usuario: TI.user.email, accion: 'editar', detalle: 'Trabajo editado', motivo: '' });
    TI.auditar(b, { accion: 'editar_respaldo', tipo: 'respaldo', id: t.id, detalle: t.id + ' editado' });
    return b.commit().then(function () { return t.id; });
  }

  /* ===== Detalle ===== */
  function abrir(id) {
    var D = { id: id, tab: 'resumen', ejecuciones: null, pruebas: null, historial: null, modal: null }; S.detalle = D;
    D.modal = TI.modal(id, '<div class="ti-empty">Cargando…</div>', { ancho: true, alCerrar: function () { if (S.detalle === D) S.detalle = null; } });
    ref(id).get().then(function (s) {
      if (!s.exists) { D.modal.cerrar(); TI.msg('El trabajo no existe o no tienes acceso.'); return; }
      var x = s.data(); x.id = id; if (!porId(id) && L.puedeVerRespaldo(TI.user, x)) S.b[id] = x; pintarDetalle(D);
    }).catch(function (e) { D.modal.cerrar(); TI.msg('No se pudo abrir el trabajo: ' + TI.errTxt(e)); });
  }
  function cargarSub(D, nombreSub, campo) {
    ref(D.id).collection(nombreSub).orderBy('fechaMs', 'desc').limit(60).get().then(function (s) { D[campo] = s.docs.map(function (d) { return d.data(); }); pintarDetalle(D); }).catch(function (e) { D[campo] = []; TI.msg('No se pudo leer: ' + TI.errTxt(e)); pintarDetalle(D); });
  }
  function tablaRegistros(arr, tipo) {
    if (!arr.length) return '<div class="ti-empty">' + (tipo === 'prueba' ? 'Aún no se ha registrado ninguna prueba de restauración.' : 'Aún no se ha registrado ninguna ejecución.') + '</div>';
    return '<div class="ti-scroll"><table class="ti-table"><thead><tr><th>Fecha</th><th>Resultado</th><th>' + (tipo === 'prueba' ? 'Tiempo (min)' : 'Tamaño (GB)') + '</th><th>Observaciones</th><th>Evidencia</th><th>Registró</th></tr></thead><tbody>' + arr.map(function (x) {
      var res = (tipo === 'prueba' ? L.RESULTADOS_PRUEBA : L.RESULTADOS_EJECUCION)[x.resultado] || x.resultado, mal = x.resultado === 'fallido' || x.resultado === 'fallida';
      return '<tr><td>' + cuando(x.fechaMs) + '</td><td><span class="ti-sem ' + (mal ? 'bad' : (x.resultado === 'exitoso' || x.resultado === 'exitosa') ? 'ok' : 'warn') + '">' + esc(res) + '</span></td><td>' + (x.valor != null ? esc(x.valor) : '—') + '</td><td>' + (x.observaciones ? esc(x.observaciones) : '<span class="ti-mut">—</span>') + '</td><td>' + (x.evidencia && L.urlSegura(x.evidencia) ? '<a href="' + esc(x.evidencia) + '" target="_blank" rel="noopener noreferrer">Ver</a>' : '—') + '</td><td>' + esc(TI.nombreDe(x.registradoPor)) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  function pintarDetalle(D) {
    var m = D.modal; if (!m || !document.body.contains(m.el)) return; var t = porId(D.id); if (!t) return; var u = TI.user, h = '';
    h += '<div class="ti-tabs" role="tablist">' + [['resumen', 'Resumen'], ['ejecuciones', 'Ejecuciones'], ['pruebas', 'Pruebas de restauración'], ['historial', 'Historial']].filter(function (x) { return TI.puede('respaldos.ver_todos') || x[0] !== 'historial'; }).map(function (x) { return '<button role="tab" data-t="' + x[0] + '" aria-selected="' + (D.tab === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
    if (D.tab === 'resumen') {
      var ee = L.estadoRespaldo(t, Date.now());
      h += (ee.estado === 'sin_registros' ? '<div class="ti-note err"><b>Sin registros.</b> No hay ninguna ejecución registrada: este trabajo no se considera respaldado.</div>' : '') +
        '<dl class="ti-dl"><dt>Qué se respalda</dt><dd>' + bloque(t.que) + '</dd><dt>Categoría</dt><dd>' + esc(L.CATEGORIAS_RESPALDO[t.categoria] || t.categoria) + '</dd><dt>Frecuencia</dt><dd>' + esc(L.FRECUENCIAS_RESPALDO[t.frecuencia] || t.frecuencia) + ' <span class="ti-mut">(atrasado después de ' + (L.INTERVALO_DIAS[t.frecuencia] || '?') + ' d)</span></dd>' +
        '<dt>Dónde se guarda</dt><dd>' + bloque(t.ubicacion) + '</dd><dt>Método</dt><dd>' + bloque(t.metodo) + '</dd><dt>Retención</dt><dd>' + (t.retencionDias ? t.retencionDias + ' días' : '<span class="ti-mut">Sin registrar</span>') + '</dd><dt>Cifrado</dt><dd>' + esc({ si: 'Sí', no: 'No', no_se: 'No se sabe' }[t.cifrado] || '—') + '</dd>' +
        '<dt>RPO / RTO</dt><dd>' + (t.rpoHoras ? t.rpoHoras + ' h' : '<span class="ti-mut">sin definir</span>') + ' / ' + (t.rtoHoras ? t.rtoHoras + ' h' : '<span class="ti-mut">sin definir</span>') + '</dd><dt>Responsable</dt><dd>' + nombre(t.responsable) + '</dd><dt>Procedimiento</dt><dd>' + (t.procedimientoId ? '<span class="ti-code">' + esc(t.procedimientoId) + '</span>' : '<span class="ti-mut">—</span>') + '</dd>' +
        '<dt>Última ejecución</dt><dd>' + (t.ultimaEjecucionMs ? cuando(t.ultimaEjecucionMs) + ' · ' + esc(L.RESULTADOS_EJECUCION[t.ultimaEjecucionResultado] || '') : '<span class="ti-mut">Nunca registrada</span>') + ' ' + insignia(t) + '</dd>' +
        '<dt>Última prueba de restauración</dt><dd>' + (t.ultimaPruebaMs ? cuando(t.ultimaPruebaMs) + ' · ' + esc(L.RESULTADOS_PRUEBA[t.ultimaPruebaResultado] || '') : '<span class="ti-mut">Nunca probada</span>') + ' ' + insigniaPrueba(t) + '</dd></dl>';
    }
    if (D.tab === 'ejecuciones') { if (D.ejecuciones === null) { h += '<div class="ti-empty">Cargando…</div>'; cargarSub(D, 'ejecuciones', 'ejecuciones'); } else h += tablaRegistros(D.ejecuciones, 'ejecucion'); }
    if (D.tab === 'pruebas') { if (D.pruebas === null) { h += '<div class="ti-empty">Cargando…</div>'; cargarSub(D, 'pruebas', 'pruebas'); } else h += tablaRegistros(D.pruebas, 'prueba'); }
    if (D.tab === 'historial') {
      if (D.historial === null) { h += '<div class="ti-empty">Cargando…</div>'; ref(D.id).collection('historial').orderBy('fecha', 'desc').limit(60).get().then(function (s) { D.historial = s.docs.map(function (x) { return x.data(); }); pintarDetalle(D); }).catch(function () { D.historial = []; pintarDetalle(D); }); }
      else h += D.historial.length ? '<div class="ti-tl">' + D.historial.map(function (x) { return '<div><b>' + esc(x.accion) + '</b> <span class="ti-mut">' + esc(TI.nombreDe(x.usuario)) + ' · ' + TI.fechaHora(x.fecha) + '</span>' + (x.detalle ? '<br><span class="ti-mut">' + esc(x.detalle) + '</span>' : '') + (x.motivo ? '<br><i>Motivo:</i> ' + esc(x.motivo) : '') + '</div>'; }).join('') + '</div>' : '<div class="ti-empty">Sin eventos.</div>';
    }
    h += '<div class="ti-status" id="ti-st" role="status"></div>';
    var pie = '', puedeReg = L.puedeRegistrarRespaldo(u, t) && t.estado === 'activo';
    if (L.puedeRegistrarRespaldo(u, t) && t.estado !== 'retirado') pie += '<button class="btn" id="rs-edit">Editar</button>';
    if (puedeReg) pie += '<button class="btn btn-blue" id="rs-ej">Registrar ejecución</button><button class="btn btn-blue" id="rs-pr">Registrar prueba de restauración</button>';
    L.accionesRespaldoDisponibles({ user: u, respaldo: t }).forEach(function (a) { pie += '<button class="btn ' + (a.ok ? '' : 'ti-off') + '" data-a="' + a.id + '" ' + (a.ok ? '' : 'aria-disabled="true" data-why="' + esc(a.motivo) + '"') + '>' + esc(a.label) + '</button>'; });
    if (!pie) pie = '<span class="ti-mut">Solo lectura con tu rol.</span>';
    m.q('.modal-hd > div').innerHTML = '<h3>' + esc(t.codigo || t.id) + ' · ' + esc(t.nombre) + '</h3><div style="margin-top:4px">' + insignia(t) + ' ' + insigniaPrueba(t) + '</div>';
    m.q('.modal-body').innerHTML = h; var ft = m.q('.modal-footer'); if (!ft) { ft = document.createElement('div'); ft.className = 'modal-footer'; m.q('.modal-card').appendChild(ft); } ft.innerHTML = pie;
    m.qa('[data-t]').forEach(function (b) { b.onclick = function () { D.tab = b.dataset.t; pintarDetalle(D); }; });
    m.qa('[data-a]').forEach(function (b) { b.onclick = function () { if (b.getAttribute('aria-disabled')) { m.q('#ti-st').textContent = b.dataset.why; return; } accion(D, t, b.dataset.a); }; });
    var ed = m.q('#rs-edit'); if (ed) ed.onclick = function () { m.cerrar(); editor(t); };
    var e1 = m.q('#rs-ej'); if (e1) e1.onclick = function () { registrar(D, t, 'ejecucion'); }; var e2 = m.q('#rs-pr'); if (e2) e2.onclick = function () { registrar(D, t, 'prueba'); };
  }

  /* ===== Registrar ejecución o prueba (transacción: registro + resumen del trabajo + auditoría) ===== */
  function aLocal(ms) { var d = new Date(ms), p = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function registrar(D, t, tipo) {
    var esP = tipo === 'prueba', R = esP ? L.RESULTADOS_PRUEBA : L.RESULTADOS_EJECUCION;
    var h = '<div class="ti-g2"><div class="ti-f"><label for="g-fec">Fecha y hora *</label><input id="g-fec" type="datetime-local" class="fi" value="' + aLocal(Date.now()) + '"><div class="ti-err" data-e="fechaMs"></div></div><div class="ti-f"><label for="g-res">Resultado *</label><select id="g-res" class="fi"><option value="">Elige…</option>' + Object.keys(R).map(function (k) { return '<option value="' + k + '">' + R[k] + '</option>'; }).join('') + '</select><div class="ti-err" data-e="resultado"></div></div></div>' +
      '<div class="ti-g2"><div class="ti-f"><label for="g-num">' + (esP ? 'Tiempo de restauración (minutos, opcional)' : 'Tamaño (GB, opcional)') + '</label><input id="g-num" type="number" min="0" step="any" class="fi"><div class="ti-err" data-e="numero"></div></div><div class="ti-f"><label for="g-ev">Evidencia (enlace https, opcional)</label><input id="g-ev" class="fi"><div class="ti-err" data-e="evidencia"></div></div></div>' +
      '<div class="ti-f"><label for="g-obs">Observaciones</label><textarea id="g-obs" class="fi" rows="3" maxlength="2000"></textarea><div class="ti-help">Obligatorias si hubo errores, falla o resultado parcial.</div><div class="ti-err" data-e="observaciones"></div></div>';
    var m = TI.modal(esP ? 'Registrar prueba de restauración' : 'Registrar ejecución', h, { pieHtml: '<button class="btn" id="g-c">Cancelar</button><button class="btn btn-blue" id="g-ok">Registrar</button>', enfocar: '#g-res' });
    m.q('#g-c').onclick = m.cerrar;
    m.q('#g-ok').onclick = function () {
      var num = m.q('#g-num').value, ahora = Date.now();
      var d = { fechaMs: m.q('#g-fec').value ? new Date(m.q('#g-fec').value).getTime() : 0, resultado: m.q('#g-res').value, observaciones: m.q('#g-obs').value.trim(), evidencia: m.q('#g-ev').value.trim() }; d[esP ? 'tiempoMin' : 'tamanoGB'] = num === '' ? null : parseFloat(num);
      var err = L.validarRegistroRespaldo(d, tipo, ahora); m.qa('[data-e]').forEach(function (e) { e.textContent = err[e.dataset.e] || ''; });
      if (Object.keys(err).length) return;
      var btn = m.q('#g-ok'); btn.disabled = true;
      var rt = ref(t.id);
      db.runTransaction(function (tx) {
        return tx.get(rt).then(function (s0) {
          if (!s0.exists) throw new Error('El trabajo ya no existe.'); var cur = s0.data(), ts = TI.serverTs();
          if (cur.estado !== 'activo') throw new Error('Solo se registran ejecuciones y pruebas en trabajos activos.');
          tx.set(rt.collection(esP ? 'pruebas' : 'ejecuciones').doc(), { fechaMs: d.fechaMs, resultado: d.resultado, valor: esP ? d.tiempoMin : d.tamanoGB, observaciones: d.observaciones, evidencia: d.evidencia, registradoPor: TI.user.email, fecha: ts });
          var ch = L.cambiosPorRegistro(cur, tipo, d); tx.update(rt, Object.assign({}, ch, { actualizadoEn: ts }));
          TI.auditar(tx, { accion: esP ? 'registrar_prueba_restauracion' : 'registrar_ejecucion_respaldo', tipo: 'respaldo', id: t.id, detalle: t.id + ': ' + R[d.resultado] + ' · ' + new Date(d.fechaMs).toLocaleString('es-MX') });
        });
      }).then(function () {
        m.cerrar(); TI.msg('Registrado');
        ref(t.id).get().then(function (s) { if (s.exists) { var x = s.data(); x.id = t.id; ['a', 'b'].forEach(function (k) { if (S[k][t.id]) S[k][t.id] = x; }); if (!porId(t.id)) S.b[t.id] = x; } D[esP ? 'pruebas' : 'ejecuciones'] = null; D.tab = esP ? 'pruebas' : 'ejecuciones'; pintarDetalle(D); pintar(); });
      }).catch(function (e) { btn.disabled = false; TI.msg('No se pudo registrar: ' + TI.errTxt(e)); });
    };
  }

  /* ===== Pausar, reactivar, retirar ===== */
  function accion(D, t, id) {
    var a = L.ACCIONES_RESPALDO[id];
    function ir(datos) {
      db.runTransaction(function (tx) {
        var rt = ref(t.id); return tx.get(rt).then(function (s0) {
          if (!s0.exists) throw new Error('El trabajo ya no existe.'); var c = s0.data(), ts = TI.serverTs(); c.id = t.id;
          var r = L.aplicarAccionRespaldo({ user: TI.user, respaldo: c }, id, datos);
          tx.update(rt, Object.assign({}, r.cambios, { actualizadoEn: ts })); tx.set(rt.collection('historial').doc(), { fecha: ts, usuario: TI.user.email, accion: id, detalle: r.historial.detalle, motivo: r.historial.motivo });
          TI.auditar(tx, { accion: 'respaldo_' + id, tipo: 'respaldo', id: t.id, detalle: t.id + ': ' + r.historial.detalle, motivo: r.historial.motivo });
        });
      }).then(function () { TI.msg('Listo: ' + a.label); ref(t.id).get().then(function (s) { if (s.exists) { var x = s.data(); x.id = t.id; ['a', 'b'].forEach(function (k) { if (S[k][t.id]) S[k][t.id] = x; }); } D.historial = null; pintarDetalle(D); pintar(); }); })
        .catch(function (e) { TI.msg('No se pudo completar: ' + TI.errTxt(e)); });
    }
    if (!(a.requiere || []).length) { ir({}); return; }
    var m = TI.modal(a.label, '<div class="ti-f"><label for="ac-motivo">Motivo *</label><textarea id="ac-motivo" class="fi" rows="3" maxlength="2000"></textarea></div><div class="ti-err" id="ac-e" role="alert"></div>', { pieHtml: '<button class="btn" id="ac-c">Cancelar</button><button class="btn btn-blue" id="ac-ok">Continuar</button>', enfocar: '#ac-motivo' });
    m.q('#ac-c').onclick = m.cerrar; m.q('#ac-ok').onclick = function () { var v = m.q('#ac-motivo').value.trim(); if (!v) { m.q('#ac-e').textContent = 'El motivo es obligatorio.'; return; } m.cerrar(); ir({ motivo: v }); };
  }

  /* ===== Configuración (Administración) ===== */
  TI.configRespaldosUI = function (el) {
    db.collection('ti_config').doc('respaldos').get().then(function (d) {
      S.config = d.exists ? d.data() : null; var c = cfg();
      el.innerHTML = '<div class="ti-note">Un trabajo se considera atrasado al pasar el intervalo de su frecuencia (diario 1, semanal 7, mensual 31, trimestral 92, anual 366 días). La antigüedad máxima de una prueba de restauración es un valor editable de arranque, no una política oficial.</div><div class="ti-card" style="padding:16px"><div class="ti-f"><label for="rs-max">Días de vigencia de una prueba de restauración exitosa</label><input id="rs-max" type="number" class="fi" min="1" max="1000" value="' + c.pruebaMaxDias + '" style="max-width:160px"><div class="ti-err" id="rs-max-e" role="alert"></div></div><button class="btn btn-blue" id="rs-guardar">Guardar</button></div>';
      el.querySelector('#rs-guardar').onclick = function () {
        var v = parseInt(el.querySelector('#rs-max').value, 10); if (!(v >= 1 && v <= 1000)) { el.querySelector('#rs-max-e').textContent = 'Escribe un número de días entre 1 y 1000.'; return; }
        var b = db.batch(), ts = TI.serverTs(), datos = { pruebaMaxDias: v, actualizadoPor: TI.user.email, actualizadoEn: ts };
        b.set(db.collection('ti_config').doc('respaldos'), datos); TI.auditar(b, { accion: 'configurar_respaldos', tipo: 'config', id: 'respaldos', detalle: 'Vigencia de pruebas de restauración: ' + v + ' días' });
        b.commit().then(function () { S.config = datos; TI.msg('Configuración guardada'); avisar(); }).catch(function (e) { TI.msg('No se pudo guardar: ' + TI.errTxt(e)); });
      };
    }).catch(function (e) { el.innerHTML = '<div class="ti-note err">No se pudo leer la configuración: ' + esc(TI.errTxt(e)) + '</div>'; });
  };
})();
