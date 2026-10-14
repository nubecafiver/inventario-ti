/* CAFIVER TI — Módulo "Proveedores y contratos".
   Datos: ti_proveedores/{PRV-###} · ti_contratos/{CTR-###} (+ /historial/*) · ti_config/proveedores · ti_config/contadores.
   Reglas de negocio (vigencia, aprobación, indicadores) en ti-logic.js. "Por vencer" y "vencido" se calculan; no se guardan.
   Los montos se muestran por moneda, sin conversiones. Los documentos son enlaces https. */
(function () {
  'use strict';
  var TI = window.TI, L = TI.L, esc = TI.esc;
  var S = { contratos: {}, contratos2: {}, provs: {}, provs2: {}, cargado: false, error: '', config: null, tab: 'contratos', el: null, detalle: null, filtro: vacio() };
  var oyentes = [];
  function vacio() { return { q: '', estado: '', tipo: '', prov: '', kpi: '' }; }

  TI.registrarVista('ti-proveedores', {
    permitido: function (u) { return L.tiene(u, 'contratos.crear') || L.tiene(u, 'contratos.ver_propios') || L.tiene(u, 'contratos.ver_todos') || L.tiene(u, 'proveedores.crear') || L.tiene(u, 'proveedores.ver_todos'); },
    render: function (el, params) { S.el = el; suscribir(); if (params && params.kpi) { S.tab = 'contratos'; S.filtro = Object.assign(vacio(), { kpi: params.kpi }); } if (params && params.abrir) abrirContrato(params.abrir); pintar(); },
    destruir: function () { S.contratos = {}; S.contratos2 = {}; S.provs = {}; S.provs2 = {}; S.cargado = false; S.error = ''; S.config = null; S.el = null; S.detalle = null; S.tab = 'contratos'; S.filtro = vacio(); oyentes = []; }
  });

  /* ===== Datos ===== */
  function lista(a, b) { var m = {}; [a, b].forEach(function (o) { Object.keys(o).forEach(function (k) { m[k] = o[k]; }); }); return Object.keys(m).map(function (k) { return m[k]; }).sort(function (x, y) { return String(x.codigo).localeCompare(String(y.codigo)); }); }
  function contratos() { return lista(S.contratos, S.contratos2); }
  function provs() { return lista(S.provs, S.provs2); }
  function cfg() { return L.normalizarConfigProveedores(S.config); }
  function aMapa(snap) { var o = {}; snap.docs.forEach(function (d) { var x = d.data(); x.id = d.id; o[d.id] = x; }); return o; }
  function avisar() { oyentes.forEach(function (f) { try { f(); } catch (e) {} }); }
  function suscribir() {
    if (S.cargado) return; S.cargado = true;
    db.collection('ti_config').doc('proveedores').get().then(function (d) { S.config = d.exists ? d.data() : null; pintar(); avisar(); }).catch(function () {});
    function ante(k) { return function (snap) { S[k] = aMapa(snap); S.error = ''; pintar(); if (S.detalle && S.detalle.modal && document.body.contains(S.detalle.modal.el)) pintarContrato(S.detalle); avisar(); }; }
    function falla(err) { S.error = err.code === 'permission-denied' ? 'permiso' : TI.errTxt(err); pintar(); avisar(); }
    var cc = db.collection('ti_contratos'), pp = db.collection('ti_proveedores');
    if (TI.puede('contratos.ver_todos')) TI.unsubs.push(cc.where('estado', 'in', L.CONTRATO_ACTIVOS).onSnapshot(ante('contratos'), falla));
    else { TI.unsubs.push(cc.where('creadoPor', '==', TI.user.email).onSnapshot(ante('contratos'), falla)); TI.unsubs.push(cc.where('responsable', '==', TI.user.email).onSnapshot(ante('contratos2'), falla)); }
    if (TI.puede('proveedores.ver_todos')) TI.unsubs.push(pp.onSnapshot(ante('provs'), falla));
    else { TI.unsubs.push(pp.where('creadoPor', '==', TI.user.email).onSnapshot(ante('provs'), falla)); TI.unsubs.push(pp.where('responsable', '==', TI.user.email).onSnapshot(ante('provs2'), falla)); }
  }
  TI.datosContratos = { lista: contratos, config: cfg, asegurar: suscribir, error: function () { return S.error; }, alCambiar: function (f) { if (oyentes.indexOf(f) < 0) oyentes.push(f); } };
  function contratoPorId(id) { return contratos().filter(function (c) { return c.id === id; })[0]; }
  function provPorId(id) { return provs().filter(function (p) { return p.id === id; })[0]; }
  function nomProv(id) { var p = provPorId(id); return p ? p.nombre : id || '—'; }
  function refC(id) { return db.collection('ti_contratos').doc(id); }
  function refP(id) { return db.collection('ti_proveedores').doc(id); }

  /* ===== Presentación ===== */
  function pillE(e) { return '<span class="pill ti-ct ti-ct-' + e + '">' + esc(L.CONTRATO_ESTADO_LABEL[e] || e) + '</span>'; }
  function money(n, mon) { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: mon || 'MXN' }).format(n || 0); }
  function vigBadge(c) {
    var v = L.estadoVigencia(c, L.hoyISO(), cfg()); if (!v) return '';
    if (v.estado === 'vencido') return '<span class="ti-sem bad"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Vencido hace ' + Math.abs(v.dias) + ' d</span>';
    if (v.estado === 'por_vencer') return '<span class="ti-sem warn"><i class="ti ti-clock-exclamation" aria-hidden="true"></i> Vence en ' + v.dias + ' d</span>';
    if (v.estado === 'sin_fecha') return '<span class="ti-sem n"><i class="ti ti-minus" aria-hidden="true"></i> Sin fecha de fin</span>';
    return '<span class="ti-sem ok"><i class="ti ti-check" aria-hidden="true"></i> Vigente</span>';
  }
  function nombre(e) { return e ? esc(TI.nombreDe(e)) : '<span class="ti-mut">Sin asignar</span>'; }
  function bloque(t) { return t && String(t).trim() ? esc(t) : '<span class="ti-mut">Sin registrar</span>'; }

  /* ===== Lista ===== */
  var KPIS = [['vigentes', 'Contratos vigentes', 'Aprobados y en curso.'], ['porVencer', 'Por vencer', 'Dentro de la ventana de aviso.'], ['vencidos', 'Vencidos', 'Fin pasado y sin dar por terminado ni renovado.'], ['sinDocumento', 'Sin documento', 'Vigentes sin enlace al contrato.'], ['pendientesAprobacion', 'Pendientes de aprobación', 'Esperan decisión del Gerente.']];
  function filtrar() {
    var f = S.filtro, kp = f.kpi ? L.filtroContratos(f.kpi, L.hoyISO(), cfg()) : null, q = f.q.trim().toLowerCase();
    return contratos().filter(function (c) {
      if (kp && !kp(c)) return false; if (f.estado && c.estado !== f.estado) return false; if (f.tipo && c.tipo !== f.tipo) return false; if (f.prov && c.proveedorId !== f.prov) return false;
      return !q || (c.codigo + ' ' + c.titulo + ' ' + nomProv(c.proveedorId)).toLowerCase().indexOf(q) >= 0;
    });
  }
  function pintar() {
    var el = S.el; if (!el) return;
    var todos = TI.puede('contratos.ver_todos'), h = '<div class="ti-head"><div><h1 class="ti-h1">Proveedores y contratos</h1><div class="ti-sub">' + (todos ? 'Proveedores, contratos, vigencias y montos del departamento de TI.' : 'Los proveedores y contratos que creaste o tienes asignados.') + '</div></div></div>';
    if (S.error === 'permiso') { el.innerHTML = h + '<div class="ti-note err"><b>Sin acceso a los datos.</b> Si el problema continúa, el administrador debe publicar las reglas de <code>firestore.rules</code>.</div>'; return; }
    if (S.error) { el.innerHTML = h + '<div class="ti-note err">No se pudo cargar: ' + esc(S.error) + '</div>'; return; }
    h += '<div class="ti-tabs" role="tablist"><button role="tab" data-tab="contratos" aria-selected="' + (S.tab === 'contratos') + '">Contratos (' + contratos().length + ')</button><button role="tab" data-tab="proveedores" aria-selected="' + (S.tab === 'proveedores') + '">Proveedores (' + provs().length + ')</button></div>';
    h += S.tab === 'contratos' ? vistaContratos(todos) : vistaProveedores();
    var foco = document.activeElement && document.activeElement.id, pos = document.activeElement && document.activeElement.selectionStart;
    el.innerHTML = h; ligar(el);
    if (foco === 'pc-q') { var q = el.querySelector('#pc-q'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) {} } }
  }
  function vistaContratos(todos) {
    var ind = L.indicadoresContratos(contratos(), L.hoyISO(), cfg()), h = '';
    if (todos) {
      h += '<div class="ti-kpis">' + KPIS.map(function (k) { return '<button class="ti-kpi' + (S.filtro.kpi === k[0] ? ' on' : '') + '" data-kpi="' + k[0] + '" aria-pressed="' + (S.filtro.kpi === k[0]) + '"><div class="ti-kl">' + k[1] + '</div><div class="ti-kv">' + ind[k[0]] + '</div><div class="ti-kd">' + esc(k[2]) + '</div></button>'; }).join('') + '</div>';
      var mon = Object.keys(ind.montoAnual);
      h += '<div class="ti-note">Monto anual de contratos vigentes (mensual ×12 + anual; los pagos únicos no suman): ' + (mon.length ? mon.map(function (m) { return '<b>' + esc(money(ind.montoAnual[m], m)) + '</b>'; }).join(' · ') : '<b>No disponible</b> (no hay contratos vigentes con monto recurrente)') + '. Sin conversión entre monedas. Ventana de aviso de vencimiento: ' + cfg().avisoVencimientoDias + ' días (editable en Administración).</div>';
    }
    h += '<div class="ti-tools"><input id="pc-q" class="fi-sm" type="search" placeholder="Buscar por folio, título o proveedor" aria-label="Buscar contrato" value="' + esc(S.filtro.q) + '" style="min-width:240px">' +
      '<select id="pc-fe" class="fi-sm" aria-label="Filtrar por estado"><option value="">Todos los estados</option>' + L.ESTADOS_CONTRATO.map(function (e) { return '<option value="' + e + '"' + (S.filtro.estado === e ? ' selected' : '') + '>' + L.CONTRATO_ESTADO_LABEL[e] + '</option>'; }).join('') + '</select>' +
      '<select id="pc-ft" class="fi-sm" aria-label="Filtrar por tipo"><option value="">Todos los tipos</option>' + Object.keys(L.TIPOS_CONTRATO).map(function (t) { return '<option value="' + t + '"' + (S.filtro.tipo === t ? ' selected' : '') + '>' + L.TIPOS_CONTRATO[t] + '</option>'; }).join('') + '</select>' +
      '<select id="pc-fp" class="fi-sm" aria-label="Filtrar por proveedor"><option value="">Todos los proveedores</option>' + provs().map(function (p) { return '<option value="' + esc(p.id) + '"' + (S.filtro.prov === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>'; }).join('') + '</select>' +
      ((S.filtro.kpi || S.filtro.estado || S.filtro.tipo || S.filtro.prov || S.filtro.q) ? '<button class="btn btn-sm" id="pc-lim">Limpiar filtros</button>' : '') + '<span style="flex:1"></span>' + (todos ? '<button class="btn btn-sm" id="pc-csv">Exportar CSV</button>' : '') +
      (TI.puede('contratos.crear') ? '<button class="btn btn-blue btn-sm" id="pc-nuevo">+ Nuevo contrato</button>' : '') + '</div>';
    var rows = filtrar();
    h += '<div class="ti-card"><div class="ti-scroll"><table class="ti-table"><caption class="ti-sr">Contratos</caption><thead><tr><th>Folio</th><th>Contrato</th><th>Proveedor</th><th>Tipo</th><th>Estado</th><th>Vigencia</th><th>Monto</th></tr></thead><tbody>';
    if (!contratos().length) h += '<tr><td colspan="7" class="ti-empty">Aún no hay contratos. ' + (TI.puede('contratos.crear') ? 'Crea el primero con "Nuevo contrato".' : '') + '</td></tr>';
    else if (!rows.length) h += '<tr><td colspan="7" class="ti-empty">Ningún contrato coincide con los filtros.</td></tr>';
    rows.forEach(function (c) { h += '<tr class="ti-row" tabindex="0" role="button" data-c="' + esc(c.id) + '"><td class="ti-code">' + esc(c.codigo || c.id) + '</td><td><b>' + esc(c.titulo) + '</b></td><td>' + esc(nomProv(c.proveedorId)) + '</td><td>' + esc(L.TIPOS_CONTRATO[c.tipo] || c.tipo) + '</td><td>' + pillE(c.estado) + '</td><td>' + (c.fin ? esc(TI.fecha(c.inicio)) + ' – ' + esc(TI.fecha(c.fin)) + '<div>' + vigBadge(c) + '</div>' : '<span class="ti-mut">Sin definir</span>') + '</td><td>' + (c.monto != null && c.monto !== '' ? esc(money(c.monto, c.moneda)) + ' <span class="ti-mut">' + esc((L.PERIODICIDADES[c.periodicidad] || '').toLowerCase()) + '</span>' : '<span class="ti-mut">—</span>') + '</td></tr>'; });
    return h + '</tbody></table></div></div>';
  }
  function vistaProveedores() {
    var h = '<div class="ti-tools"><span class="ti-mut">' + provs().length + ' proveedores</span><span style="flex:1"></span>' + (TI.puede('proveedores.crear') ? '<button class="btn btn-blue btn-sm" id="pv-nuevo">+ Nuevo proveedor</button>' : '') + '</div>';
    h += '<div class="ti-card"><div class="ti-scroll"><table class="ti-table"><caption class="ti-sr">Proveedores</caption><thead><tr><th>Folio</th><th>Proveedor</th><th>Categoría</th><th>Contacto principal</th><th>Responsable</th><th>Estado</th></tr></thead><tbody>';
    if (!provs().length) h += '<tr><td colspan="6" class="ti-empty">Aún no hay proveedores. ' + (TI.puede('proveedores.crear') ? 'Crea el primero con "Nuevo proveedor".' : '') + '</td></tr>';
    provs().forEach(function (p) { var c = (p.contactos || [])[0]; h += '<tr class="ti-row" tabindex="0" role="button" data-p="' + esc(p.id) + '"><td class="ti-code">' + esc(p.codigo || p.id) + '</td><td><b>' + esc(p.nombre) + '</b></td><td>' + esc(L.CATEGORIAS_PROVEEDOR[p.categoria] || p.categoria) + '</td><td>' + (c ? esc(c.nombre) + (c.correo ? ' <span class="ti-mut">' + esc(c.correo) + '</span>' : '') : '<span class="ti-mut">Sin contactos</span>') + '</td><td>' + nombre(p.responsable) + '</td><td>' + (p.estado === 'inactivo' ? '<span class="pill ti-ct ti-ct-cancelado">Inactivo</span>' : '<span class="pill ti-ct ti-ct-vigente">Activo</span>') + '</td></tr>'; });
    return h + '</tbody></table></div></div>';
  }
  function ligar(el) {
    el.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { S.tab = b.dataset.tab; pintar(); }; });
    el.querySelectorAll('[data-kpi]').forEach(function (b) { b.onclick = function () { S.filtro.kpi = S.filtro.kpi === b.dataset.kpi ? '' : b.dataset.kpi; pintar(); }; });
    el.querySelectorAll('.ti-row').forEach(function (r) { var f = function () { if (r.dataset.c) abrirContrato(r.dataset.c); else abrirProveedor(r.dataset.p); }; r.onclick = f; r.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f(); } }; });
    var q = el.querySelector('#pc-q'); if (q) q.oninput = function () { S.filtro.q = q.value; pintar(); };
    [['pc-fe', 'estado'], ['pc-ft', 'tipo'], ['pc-fp', 'prov']].forEach(function (x) { var s = el.querySelector('#' + x[0]); if (s) s.onchange = function () { S.filtro[x[1]] = s.value; pintar(); }; });
    var lim = el.querySelector('#pc-lim'); if (lim) lim.onclick = function () { S.filtro = vacio(); pintar(); };
    var nc = el.querySelector('#pc-nuevo'); if (nc) nc.onclick = function () { editorContrato(null); };
    var np = el.querySelector('#pv-nuevo'); if (np) np.onclick = function () { editorProveedor(null); };
    var cs = el.querySelector('#pc-csv'); if (cs) cs.onclick = exportarCSV;
  }
  function celdaCSV(v) { var s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  function exportarCSV() {
    var rows = filtrar(), cab = ['Folio', 'Contrato', 'Proveedor', 'Tipo', 'Estado', 'Inicio', 'Fin', 'Vigencia', 'Monto', 'Moneda', 'Periodicidad', 'Responsable'];
    var out = [cab.map(celdaCSV).join(',')].concat(rows.map(function (c) { var v = L.estadoVigencia(c, L.hoyISO(), cfg()); return [c.codigo, c.titulo, nomProv(c.proveedorId), L.TIPOS_CONTRATO[c.tipo], L.CONTRATO_ESTADO_LABEL[c.estado], c.inicio, c.fin, v ? v.estado : '', c.monto, c.moneda, L.PERIODICIDADES[c.periodicidad], c.responsable].map(celdaCSV).join(','); }));
    var blob = new Blob(['﻿' + out.join('\r\n')], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'contratos-' + L.hoyISO() + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); TI.msg('Exportados ' + rows.length + ' contratos');
  }

  /* ===== Contratos: editor ===== */
  function opts(obj, sel, vac) { return (vac ? '<option value="">' + vac + '</option>' : '') + Object.keys(obj).map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(obj[k]) + '</option>'; }).join(''); }
  function respPosibles() { return TI.usuariosActivos().filter(function (x) { return L.tiene({ roles: x.roles }, 'contratos.crear'); }); }
  function filaDoc(x, i, pre) { return '<div class="ti-g2 ti-docrow" data-i="' + i + '"><div class="ti-f"><label>Título</label><input class="fi" data-dk="titulo" value="' + esc(x.titulo) + '"><div class="ti-err" data-e="' + pre + i + '.titulo"></div></div><div class="ti-f"><label>Enlace (https://…)</label><div style="display:flex;gap:6px"><input class="fi" data-dk="url" value="' + esc(x.url) + '"><button type="button" class="icon-btn" data-rmd aria-label="Quitar documento">✕</button></div><div class="ti-err" data-e="' + pre + i + '.url"></div></div></div>'; }
  function editorContrato(c, mostrarErrores, base) {
    var nuevo = !c, d = JSON.parse(JSON.stringify(c || base || { tipo: 'servicio', moneda: 'MXN', periodicidad: 'anual', renovacion: 'manual', responsable: TI.user.email, documentos: [] })), docs = d.documentos || [];
    var inp = function (id, k, lab, tipo, extra) { return '<div class="ti-f"><label for="' + id + '">' + lab + '</label><input id="' + id + '" class="fi" type="' + (tipo || 'text') + '" ' + (extra || '') + ' value="' + esc(d[k] == null ? '' : d[k]) + '"><div class="ti-err" data-e="' + k + '"></div></div>'; };
    var h = '<div class="ti-note">Un borrador solo exige título, tipo y proveedor. Para enviarlo a aprobación deben estar completos objeto, fechas, monto y responsable. Los documentos son enlaces https; no se guarda el archivo.' + (d.renovacionDe ? ' <b>Renueva ' + esc(d.renovacionDe) + '</b>; al aprobarse, el contrato anterior pasa a "Renovado".' : '') + '</div>' +
      '<div class="ti-g2">' + inp('k-tit', 'titulo', 'Título *', 'text', 'maxlength="200"') + '<div class="ti-f"><label for="k-tipo">Tipo *</label><select id="k-tipo" class="fi">' + opts(L.TIPOS_CONTRATO, d.tipo) + '</select></div></div>' +
      '<div class="ti-g2"><div class="ti-f"><label for="k-prov">Proveedor *</label><select id="k-prov" class="fi">' + '<option value="">Elige…</option>' + provs().filter(function (p) { return p.estado !== 'inactivo' || p.id === d.proveedorId; }).map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === d.proveedorId ? ' selected' : '') + '>' + esc(p.nombre) + '</option>'; }).join('') + '</select><div class="ti-err" data-e="proveedorId"></div></div>' +
      '<div class="ti-f"><label for="k-resp">Responsable *</label><select id="k-resp" class="fi"><option value="">Sin asignar</option>' + respPosibles().map(function (x) { return '<option value="' + esc(x.email) + '"' + (x.email === d.responsable ? ' selected' : '') + '>' + esc(x.nombre) + '</option>'; }).join('') + '</select><div class="ti-err" data-e="responsable"></div></div></div>' +
      '<div class="ti-f"><label for="k-obj">Objeto del contrato *</label><textarea id="k-obj" class="fi" rows="3" maxlength="3000">' + esc(d.objeto) + '</textarea><div class="ti-err" data-e="objeto"></div></div>' +
      '<div class="ti-g3">' + inp('k-ini', 'inicio', 'Inicio *', 'date') + inp('k-fin', 'fin', 'Fin *', 'date') + '<div class="ti-f"><label for="k-ren">Renovación</label><select id="k-ren" class="fi">' + opts({ manual: 'Manual', automatica: 'Automática' }, d.renovacion) + '</select></div></div>' +
      '<div class="ti-g3">' + inp('k-monto', 'monto', 'Monto *', 'number', 'min="0" step="0.01"') + '<div class="ti-f"><label for="k-mon">Moneda *</label><select id="k-mon" class="fi">' + opts(L.MONEDAS, d.moneda) + '</select></div><div class="ti-f"><label for="k-per">Periodicidad *</label><select id="k-per" class="fi">' + opts(L.PERIODICIDADES, d.periodicidad) + '</select></div></div>' +
      '<div class="ti-g2">' + inp('k-aviso', 'avisoDias', 'Días de aviso de vencimiento (opcional)', 'number', 'min="1" placeholder="Usa el valor global (' + cfg().avisoVencimientoDias + ')"') + inp('k-act', 'activoIds', 'Equipos relacionados (IDs, separados por coma)') + '</div>' +
      '<div class="ti-sec">Documentos (enlaces)</div><div id="k-docs"></div><button type="button" class="btn btn-sm" id="k-adddoc">+ Agregar enlace</button>';
    var m = TI.modal(nuevo ? (d.renovacionDe ? 'Renovar contrato' : 'Nuevo contrato') : 'Editar borrador — ' + c.codigo, h, { ancho: true, noCerrarFuera: true, pieHtml: '<button class="btn" id="k-cancel">Cancelar</button><button class="btn btn-blue" id="k-save">Guardar borrador</button>', enfocar: '#k-tit' });
    function leerDocs() { m.qa('.ti-docrow').forEach(function (r) { var i = +r.dataset.i; r.querySelectorAll('[data-dk]').forEach(function (x) { docs[i][x.dataset.dk] = x.value; }); }); }
    function pintarDocs() { m.q('#k-docs').innerHTML = docs.map(function (x, i) { return filaDoc(x, i, 'dc'); }).join('') || '<div class="ti-mut">Sin enlaces.</div>'; m.qa('[data-rmd]').forEach(function (b) { b.onclick = function () { leerDocs(); docs.splice(+b.closest('.ti-docrow').dataset.i, 1); pintarDocs(); }; }); }
    function leer() {
      leerDocs(); var monto = m.q('#k-monto').value;
      return { titulo: m.q('#k-tit').value, tipo: m.q('#k-tipo').value, proveedorId: m.q('#k-prov').value, responsable: m.q('#k-resp').value || null, objeto: m.q('#k-obj').value, inicio: m.q('#k-ini').value, fin: m.q('#k-fin').value, renovacion: m.q('#k-ren').value,
        monto: monto === '' ? null : parseFloat(monto), moneda: m.q('#k-mon').value, periodicidad: m.q('#k-per').value, avisoDias: m.q('#k-aviso').value === '' ? null : parseFloat(m.q('#k-aviso').value), activoIds: m.q('#k-act').value.trim(),
        documentos: docs.map(function (x) { return { titulo: x.titulo.trim(), url: x.url.trim() }; }), renovacionDe: d.renovacionDe || null };
    }
    function marcar(err) { m.qa('[data-e]').forEach(function (e) { e.textContent = err[e.dataset.e] || ''; }); var p = m.q('.ti-err:not(:empty)'); if (p) { var f = p.parentElement.querySelector('input,textarea,select'); if (f) f.focus(); } }
    pintarDocs(); m.q('#k-cancel').onclick = m.cerrar;
    m.q('#k-adddoc').onclick = function () { leerDocs(); docs.push({ titulo: '', url: '' }); pintarDocs(); };
    if (mostrarErrores) marcar(L.validarContrato(leer(), true));
    m.q('#k-save').onclick = function () {
      var x = leer(), err = L.validarContrato(x, false);
      if (Object.keys(err).length) { marcar(err); TI.msg('Hay ' + Object.keys(err).length + ' campo(s) por corregir.'); return; }
      var btn = m.q('#k-save'); btn.disabled = true; btn.textContent = 'Guardando…';
      (nuevo ? crearContrato(x) : guardarContrato(c, x)).then(function (id) { m.cerrar(); TI.msg('Borrador guardado'); abrirContrato(id); }).catch(function (e) { btn.disabled = false; btn.textContent = 'Guardar borrador'; TI.msg('No se pudo guardar: ' + TI.errTxt(e)); });
    };
  }
  var CAMPOS_C = ['titulo', 'tipo', 'proveedorId', 'responsable', 'objeto', 'inicio', 'fin', 'renovacion', 'monto', 'moneda', 'periodicidad', 'avisoDias', 'activoIds', 'documentos', 'renovacionDe'];
  function soloC(x) { var o = {}; CAMPOS_C.forEach(function (k) { o[k] = x[k] === undefined ? null : x[k]; }); return o; }
  function folio(tx, clave, pre, ancho) {
    var cRef = db.collection('ti_config').doc('contadores');
    return tx.get(cRef).then(function (cs) { var n = (cs.exists ? (cs.data()[clave] || 0) : 0) + 1; if (cs.exists) tx.update(cRef, (function () { var o = {}; o[clave] = n; return o; })()); else { var o = {}; o[clave] = n; tx.set(cRef, o); } return pre + ('00000' + n).slice(-ancho); });
  }
  function crearContrato(x) {
    var ahora = Date.now();
    return db.runTransaction(function (tx) {
      return folio(tx, 'contratos', 'CTR-', 4).then(function (id) {
        var ts = TI.serverTs(), ref = refC(id);
        tx.set(ref, Object.assign(soloC(x), { codigo: id, estado: 'borrador', creadoPor: TI.user.email, aprobacion: null, motivoRechazo: '', creadoMs: ahora, creadoEn: ts, actualizadoEn: ts }));
        tx.set(ref.collection('historial').doc(), { fecha: ts, usuario: TI.user.email, accion: 'crear', detalle: 'Contrato creado como borrador' + (x.renovacionDe ? ' (renueva ' + x.renovacionDe + ')' : ''), motivo: '' });
        TI.auditar(tx, { accion: 'crear_contrato', tipo: 'contrato', id: id, detalle: id + ': ' + x.titulo.trim().slice(0, 120) });
        return id;
      });
    });
  }
  function guardarContrato(c, x) {
    var b = db.batch(), ts = TI.serverTs(), ref = refC(c.id);
    b.update(ref, Object.assign(soloC(x), { actualizadoEn: ts }));
    b.set(ref.collection('historial').doc(), { fecha: ts, usuario: TI.user.email, accion: 'editar', detalle: 'Borrador editado', motivo: '' });
    TI.auditar(b, { accion: 'editar_contrato', tipo: 'contrato', id: c.id, detalle: c.id + ' editado' });
    return b.commit().then(function () { return c.id; });
  }

  /* ===== Contratos: detalle y acciones ===== */
  function abrirContrato(id) {
    var D = { id: id, historial: null, tab: 'resumen', modal: null }; S.detalle = D;
    D.modal = TI.modal(id, '<div class="ti-empty">Cargando…</div>', { ancho: true, alCerrar: function () { if (S.detalle === D) S.detalle = null; } });
    refC(id).get().then(function (s) {
      if (!s.exists) { D.modal.cerrar(); TI.msg('El contrato no existe o no tienes acceso.'); return; }
      var x = s.data(); x.id = id; if (!contratoPorId(id) && L.puedeVerContrato(TI.user, x)) { S.contratos2[id] = x; } pintarContrato(D);
    }).catch(function (e) { D.modal.cerrar(); TI.msg('No se pudo abrir el contrato: ' + TI.errTxt(e)); });
  }
  function pintarContrato(D) {
    var m = D.modal; if (!m || !document.body.contains(m.el)) return; var c = contratoPorId(D.id); if (!c) return; var u = TI.user, h = '';
    h += '<div class="ti-tabs" role="tablist">' + [['resumen', 'Resumen'], ['historial', 'Historial']].filter(function (t) { return TI.puede('contratos.ver_todos') || t[0] !== 'historial'; }).map(function (t) { return '<button role="tab" data-t="' + t[0] + '" aria-selected="' + (D.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>';
    if (D.tab === 'resumen') {
      h += '<dl class="ti-dl"><dt>Proveedor</dt><dd>' + esc(nomProv(c.proveedorId)) + '</dd><dt>Tipo</dt><dd>' + esc(L.TIPOS_CONTRATO[c.tipo] || c.tipo) + '</dd><dt>Responsable</dt><dd>' + nombre(c.responsable) + '</dd><dt>Creado por</dt><dd>' + nombre(c.creadoPor) + '</dd>' +
        '<dt>Objeto</dt><dd>' + bloque(c.objeto) + '</dd><dt>Vigencia</dt><dd>' + (c.inicio ? esc(TI.fecha(c.inicio)) + ' a ' + esc(TI.fecha(c.fin)) + ' ' + vigBadge(c) : '<span class="ti-mut">Sin definir</span>') + '</dd>' +
        '<dt>Renovación</dt><dd>' + esc(c.renovacion === 'automatica' ? 'Automática' : 'Manual') + (c.avisoDias ? ' <span class="ti-mut">· aviso ' + c.avisoDias + ' días</span>' : '') + '</dd>' +
        '<dt>Monto</dt><dd>' + (c.monto != null ? esc(money(c.monto, c.moneda)) + ' <span class="ti-mut">' + esc((L.PERIODICIDADES[c.periodicidad] || '').toLowerCase()) + '</span>' : '<span class="ti-mut">—</span>') + '</dd>' +
        '<dt>Equipos (ID)</dt><dd>' + bloque(c.activoIds) + '</dd>' + (c.renovacionDe ? '<dt>Renueva</dt><dd><span class="ti-code">' + esc(c.renovacionDe) + '</span></dd>' : '') +
        '<dt>Documentos</dt><dd>' + ((c.documentos || []).length ? '<ul class="ti-ul">' + c.documentos.map(function (d) { return '<li>' + (L.urlSegura(d.url) ? '<a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">' + esc(d.titulo) + '</a>' : esc(d.titulo)) + '</li>'; }).join('') + '</ul>' : '<span class="ti-warn">Sin documento: agrega el enlace al contrato firmado</span>') + '</dd>' +
        '<dt>Aprobación</dt><dd>' + (c.aprobacion ? 'Aprobó <b>' + esc(TI.nombreDe(c.aprobacion.por)) + '</b> el ' + TI.fechaHora(c.aprobacion.fecha) : '<span class="ti-mut">Sin aprobación</span>') + '</dd>' + (c.motivoRechazo ? '<dt>Último motivo de rechazo o devolución</dt><dd>' + esc(c.motivoRechazo) + '</dd>' : '') + '</dl>';
    }
    if (D.tab === 'historial') {
      if (D.historial === null) { h += '<div class="ti-empty">Cargando historial…</div>'; refC(D.id).collection('historial').orderBy('fecha', 'desc').limit(60).get().then(function (s) { D.historial = s.docs.map(function (x) { return x.data(); }); pintarContrato(D); }).catch(function () { D.historial = []; pintarContrato(D); }); }
      else h += D.historial.length ? '<div class="ti-tl">' + D.historial.map(function (x) { return '<div><b>' + esc(x.accion) + '</b> <span class="ti-mut">' + esc(TI.nombreDe(x.usuario)) + ' · ' + TI.fechaHora(x.fecha) + '</span>' + (x.detalle ? '<br><span class="ti-mut">' + esc(x.detalle) + '</span>' : '') + (x.motivo ? '<br><i>Motivo:</i> ' + esc(x.motivo) : '') + '</div>'; }).join('') + '</div>' : '<div class="ti-empty">Sin eventos.</div>';
    }
    h += '<div class="ti-status" id="ti-st" role="status"></div>';
    var pie = ''; if (c.estado === 'borrador' && (c.creadoPor === u.email || TI.puede('contratos.gestionar'))) pie += '<button class="btn" id="pc-edit">Editar borrador</button>';
    L.accionesContratoDisponibles({ user: u, contrato: c }).forEach(function (a) { var neg = ['rechazar', 'cancelar', 'terminar', 'devolver'].indexOf(a.id) >= 0; pie += '<button class="btn ' + (a.ok ? (neg ? '' : 'btn-blue') : 'ti-off') + '" data-a="' + a.id + '" ' + (a.ok ? '' : 'aria-disabled="true" data-why="' + esc(a.motivo) + '"') + '>' + esc(a.label) + '</button>'; });
    if (!pie) pie = '<span class="ti-mut">Sin acciones disponibles con tu rol en este estado.</span>';
    m.q('.modal-hd > div').innerHTML = '<h3>' + esc(c.codigo || c.id) + ' · ' + esc(c.titulo) + '</h3><div style="margin-top:4px">' + pillE(c.estado) + ' ' + vigBadge(c) + '</div>';
    m.q('.modal-body').innerHTML = h; var ft = m.q('.modal-footer'); if (!ft) { ft = document.createElement('div'); ft.className = 'modal-footer'; m.q('.modal-card').appendChild(ft); } ft.innerHTML = pie;
    m.qa('[data-t]').forEach(function (b) { b.onclick = function () { D.tab = b.dataset.t; pintarContrato(D); }; });
    m.qa('[data-a]').forEach(function (b) { b.onclick = function () { if (b.getAttribute('aria-disabled')) { m.q('#ti-st').textContent = b.dataset.why; return; } accion(D, c, b.dataset.a); }; });
    var ed = m.q('#pc-edit'); if (ed) ed.onclick = function () { m.cerrar(); editorContrato(c); };
  }
  function accion(D, c, id) {
    if (id === 'renovar') {
      var base = JSON.parse(JSON.stringify(c)); ['id', 'codigo', 'estado', 'aprobacion', 'motivoRechazo', 'creadoPor', 'creadoMs', 'creadoEn', 'actualizadoEn', 'terminadoMs'].forEach(function (k) { delete base[k]; });
      base.titulo = c.titulo + ' (renovación)'; base.renovacionDe = c.id; base.inicio = c.fin ? L.sumarDias(c.fin, 1) : ''; base.fin = ''; base.documentos = [];
      D.modal.cerrar(); editorContrato(null, false, base); return;
    }
    var a = L.ACCIONES_CONTRATO[id], req = a.requiere || [];
    if (!req.length) { ejecutar(D, c, id, {}); return; }
    var m = TI.modal(a.label, '<div class="ti-f"><label for="ac-motivo">Motivo *</label><textarea id="ac-motivo" class="fi" rows="3" maxlength="2000"></textarea></div><div class="ti-err" id="ac-e" role="alert"></div>', { pieHtml: '<button class="btn" id="ac-c">Cancelar</button><button class="btn btn-blue" id="ac-ok">Continuar</button>', enfocar: '#ac-motivo' });
    m.q('#ac-c').onclick = m.cerrar;
    m.q('#ac-ok').onclick = function () { var v = m.q('#ac-motivo').value.trim(); if (!v) { m.q('#ac-e').textContent = 'El motivo es obligatorio.'; return; } m.cerrar(); ejecutar(D, c, id, { motivo: v }); };
  }
  function ejecutar(D, c0, id, datos) {
    var ref = refC(c0.id), ahora = Date.now(), etiqueta = L.ACCIONES_CONTRATO[id].label;
    db.runTransaction(function (tx) {
      return tx.get(ref).then(function (s0) {
        if (!s0.exists) throw new Error('El contrato ya no existe.');
        var c = s0.data(); c.id = c0.id; var r = L.aplicarAccionContrato({ user: TI.user, contrato: c, ahora: ahora }, id, datos), ts = TI.serverTs();
        function hist(rf, accion, detalle, motivo) { tx.set(rf.collection('historial').doc(), { fecha: ts, usuario: TI.user.email, accion: accion, detalle: detalle, motivo: motivo || '' }); }
        var previo = id === 'aprobar' && c.renovacionDe ? refC(c.renovacionDe) : null;
        return (previo ? tx.get(previo) : Promise.resolve(null)).then(function (ps) {
          tx.update(ref, Object.assign({}, r.cambios, { actualizadoEn: ts })); hist(ref, id, r.historial.detalle, r.historial.motivo);
          if (ps && ps.exists && ps.data().estado === 'vigente') { tx.update(previo, { estado: 'renovado', actualizadoEn: ts }); hist(previo, 'renovado', 'Renovado por ' + c0.id, ''); }
          TI.auditar(tx, { accion: 'contrato_' + id, tipo: 'contrato', id: c0.id, detalle: (c.codigo || c0.id) + ': ' + r.historial.detalle, motivo: r.historial.motivo });
        });
      });
    }).then(function () {
      TI.msg('Listo: ' + etiqueta);
      refC(c0.id).get().then(function (s) { if (s.exists) { var x = s.data(); x.id = c0.id; ['contratos', 'contratos2'].forEach(function (k) { if (S[k][c0.id]) S[k][c0.id] = x; }); if (!contratoPorId(c0.id)) S.contratos2[c0.id] = x; } D.historial = null; pintarContrato(D); pintar(); });
    }).catch(function (e) {
      if (e.detalle) { TI.msg('El contrato está incompleto: completa los campos marcados.'); D.modal.cerrar(); editorContrato(c0, true); return; }
      TI.msg('No se pudo completar: ' + TI.errTxt(e));
    });
  }

  /* ===== Proveedores ===== */
  function abrirProveedor(id) {
    var p = provPorId(id); if (!p) return; var u = TI.user, cs = contratos().filter(function (c) { return c.proveedorId === id; });
    var h = '<dl class="ti-dl"><dt>Categoría</dt><dd>' + esc(L.CATEGORIAS_PROVEEDOR[p.categoria] || p.categoria) + '</dd><dt>RFC</dt><dd>' + bloque(p.rfc) + '</dd><dt>Sitio web</dt><dd>' + (p.sitioWeb && L.urlSegura(p.sitioWeb) ? '<a href="' + esc(p.sitioWeb) + '" target="_blank" rel="noopener noreferrer">' + esc(p.sitioWeb) + '</a>' : '<span class="ti-mut">—</span>') + '</dd><dt>Responsable</dt><dd>' + nombre(p.responsable) + '</dd>' +
      '<dt>Estado</dt><dd>' + (p.estado === 'inactivo' ? 'Inactivo' : 'Activo') + '</dd><dt>Contactos</dt><dd>' + ((p.contactos || []).length ? '<ul class="ti-ul">' + p.contactos.map(function (c) { return '<li><b>' + esc(c.nombre) + '</b>' + (c.rol ? ' · ' + esc(c.rol) : '') + (c.correo ? ' · ' + esc(c.correo) : '') + (c.telefono ? ' · ' + esc(c.telefono) : '') + '</li>'; }).join('') + '</ul>' : '<span class="ti-mut">Sin contactos</span>') + '</dd>' +
      '<dt>Notas</dt><dd>' + bloque(p.notas) + '</dd><dt>Contratos</dt><dd>' + (cs.length ? '<ul class="ti-ul">' + cs.map(function (c) { return '<li><span class="ti-code">' + esc(c.codigo) + '</span> ' + esc(c.titulo) + ' · ' + esc(L.CONTRATO_ESTADO_LABEL[c.estado]) + '</li>'; }).join('') + '</ul>' : '<span class="ti-mut">Sin contratos visibles</span>') + '</dd></dl>';
    var puede = TI.puede('proveedores.gestionar') || p.creadoPor === u.email || p.responsable === u.email;
    var m = TI.modal(p.codigo + ' · ' + p.nombre, h, { ancho: true, pieHtml: puede ? '<button class="btn btn-blue" id="pv-edit">Editar proveedor</button>' : '<span class="ti-mut">Solo lectura</span>' });
    var e = m.q('#pv-edit'); if (e) e.onclick = function () { m.cerrar(); editorProveedor(p); };
  }
  function editorProveedor(p) {
    var nuevo = !p, d = JSON.parse(JSON.stringify(p || { categoria: 'servicios', estado: 'activo', responsable: TI.user.email, contactos: [] })), cts = d.contactos || [];
    var h = '<div class="ti-g2"><div class="ti-f"><label for="v-nom">Nombre *</label><input id="v-nom" class="fi" maxlength="200" value="' + esc(d.nombre) + '"><div class="ti-err" data-e="nombre"></div></div><div class="ti-f"><label for="v-cat">Categoría *</label><select id="v-cat" class="fi">' + opts(L.CATEGORIAS_PROVEEDOR, d.categoria) + '</select></div></div>' +
      '<div class="ti-g3"><div class="ti-f"><label for="v-rfc">RFC (opcional)</label><input id="v-rfc" class="fi" maxlength="13" value="' + esc(d.rfc) + '"><div class="ti-err" data-e="rfc"></div></div><div class="ti-f"><label for="v-web">Sitio web (https)</label><input id="v-web" class="fi" value="' + esc(d.sitioWeb) + '"><div class="ti-err" data-e="sitioWeb"></div></div>' +
      '<div class="ti-f"><label for="v-resp">Responsable</label><select id="v-resp" class="fi"><option value="">Sin asignar</option>' + respPosibles().map(function (x) { return '<option value="' + esc(x.email) + '"' + (x.email === d.responsable ? ' selected' : '') + '>' + esc(x.nombre) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="ti-f"><label for="v-not">Notas</label><textarea id="v-not" class="fi" rows="2" maxlength="2000">' + esc(d.notas) + '</textarea></div><div class="ti-f"><label class="ti-chk"><input type="checkbox" id="v-act"' + (d.estado !== 'inactivo' ? ' checked' : '') + '> Proveedor activo</label></div>' +
      '<div class="ti-sec">Contactos</div><div id="v-cts"></div><button type="button" class="btn btn-sm" id="v-addct">+ Agregar contacto</button>';
    var m = TI.modal(nuevo ? 'Nuevo proveedor' : 'Editar — ' + p.codigo, h, { ancho: true, noCerrarFuera: true, pieHtml: '<button class="btn" id="v-c">Cancelar</button><button class="btn btn-blue" id="v-ok">Guardar</button>', enfocar: '#v-nom' });
    function filaCt(c, i) { return '<div class="ti-g3 ti-ctrow" data-i="' + i + '">' + [['nombre', 'Nombre'], ['rol', 'Rol'], ['correo', 'Correo'], ['telefono', 'Teléfono']].map(function (f, j) { return '<div class="ti-f"><label>' + f[1] + '</label><div style="display:flex;gap:6px"><input class="fi" data-ck="' + f[0] + '" value="' + esc(c[f[0]]) + '">' + (j === 3 ? '<button type="button" class="icon-btn" data-rmc aria-label="Quitar contacto">✕</button>' : '') + '</div><div class="ti-err" data-e="ct' + i + '.' + f[0] + '"></div></div>'; }).join('') + '</div>'; }
    function leerC() { m.qa('.ti-ctrow').forEach(function (r) { var i = +r.dataset.i; r.querySelectorAll('[data-ck]').forEach(function (x) { cts[i][x.dataset.ck] = x.value; }); }); }
    function pintarC() { m.q('#v-cts').innerHTML = cts.map(filaCt).join('') || '<div class="ti-mut">Sin contactos.</div>'; m.qa('[data-rmc]').forEach(function (b) { b.onclick = function () { leerC(); cts.splice(+b.closest('.ti-ctrow').dataset.i, 1); pintarC(); }; }); }
    pintarC(); m.q('#v-addct').onclick = function () { leerC(); cts.push({ nombre: '', rol: '', correo: '', telefono: '' }); pintarC(); }; m.q('#v-c').onclick = m.cerrar;
    m.q('#v-ok').onclick = function () {
      leerC(); var x = { nombre: m.q('#v-nom').value.trim(), categoria: m.q('#v-cat').value, rfc: m.q('#v-rfc').value.trim().toUpperCase(), sitioWeb: m.q('#v-web').value.trim(), responsable: m.q('#v-resp').value || null, notas: m.q('#v-not').value, estado: m.q('#v-act').checked ? 'activo' : 'inactivo', contactos: cts.map(function (c) { return { nombre: c.nombre.trim(), rol: c.rol.trim(), correo: c.correo.trim(), telefono: c.telefono.trim() }; }) };
      var err = L.validarProveedor(x); m.qa('[data-e]').forEach(function (e) { e.textContent = err[e.dataset.e] || ''; });
      if (Object.keys(err).length) { TI.msg('Hay ' + Object.keys(err).length + ' campo(s) por corregir.'); return; }
      var btn = m.q('#v-ok'); btn.disabled = true;
      (nuevo ? crearProveedor(x) : guardarProveedor(p, x)).then(function (id) { m.cerrar(); TI.msg('Proveedor guardado'); S.tab = 'proveedores'; pintar(); }).catch(function (e) { btn.disabled = false; TI.msg('No se pudo guardar: ' + TI.errTxt(e)); });
    };
  }
  function crearProveedor(x) {
    return db.runTransaction(function (tx) {
      return folio(tx, 'proveedores', 'PRV-', 3).then(function (id) {
        var ts = TI.serverTs(), ref = refP(id);
        tx.set(ref, Object.assign({}, x, { codigo: id, creadoPor: TI.user.email, creadoEn: ts, actualizadoEn: ts }));
        tx.set(ref.collection('historial').doc(), { fecha: ts, usuario: TI.user.email, accion: 'crear', detalle: 'Proveedor creado', motivo: '' });
        TI.auditar(tx, { accion: 'crear_proveedor', tipo: 'proveedor', id: id, detalle: id + ': ' + x.nombre.slice(0, 120) }); return id;
      });
    });
  }
  function guardarProveedor(p, x) {
    var b = db.batch(), ts = TI.serverTs(), ref = refP(p.id);
    b.update(ref, Object.assign({}, x, { actualizadoEn: ts }));
    b.set(ref.collection('historial').doc(), { fecha: ts, usuario: TI.user.email, accion: 'editar', detalle: 'Proveedor editado' + (x.estado !== p.estado ? ' (' + x.estado + ')' : ''), motivo: '' });
    TI.auditar(b, { accion: 'editar_proveedor', tipo: 'proveedor', id: p.id, detalle: p.id + ' editado' + (x.estado !== p.estado ? ' → ' + x.estado : '') });
    return b.commit().then(function () { return p.id; });
  }

  /* ===== Configuración (la usa Administración) ===== */
  TI.configProveedoresUI = function (el) {
    db.collection('ti_config').doc('proveedores').get().then(function (d) {
      S.config = d.exists ? d.data() : null; var c = cfg();
      el.innerHTML = '<div class="ti-note">La ventana de aviso es un valor editable de arranque, no un plazo oficial. Un contrato puede tener su propio aviso.</div><div class="ti-card" style="padding:16px"><div class="ti-f"><label for="pv-aviso">Días de aviso antes del vencimiento de un contrato</label><input id="pv-aviso" type="number" class="fi" min="1" max="720" value="' + c.avisoVencimientoDias + '" style="max-width:160px"><div class="ti-err" id="pv-aviso-e" role="alert"></div></div><button class="btn btn-blue" id="pv-guardar">Guardar</button></div>';
      el.querySelector('#pv-guardar').onclick = function () {
        var v = parseInt(el.querySelector('#pv-aviso').value, 10); if (!(v >= 1 && v <= 720)) { el.querySelector('#pv-aviso-e').textContent = 'Escribe un número de días entre 1 y 720.'; return; }
        var b = db.batch(), ts = TI.serverTs(), datos = { avisoVencimientoDias: v, actualizadoPor: TI.user.email, actualizadoEn: ts };
        b.set(db.collection('ti_config').doc('proveedores'), datos); TI.auditar(b, { accion: 'configurar_proveedores', tipo: 'config', id: 'proveedores', detalle: 'Aviso de vencimiento: ' + v + ' días' });
        b.commit().then(function () { S.config = datos; TI.msg('Configuración guardada'); avisar(); }).catch(function (e) { TI.msg('No se pudo guardar: ' + TI.errTxt(e)); });
      };
    }).catch(function (e) { el.innerHTML = '<div class="ti-note err">No se pudo leer la configuración: ' + esc(TI.errTxt(e)) + '</div>'; });
  };
})();
