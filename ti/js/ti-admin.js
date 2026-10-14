/* CAFIVER TI — Administración: usuarios y roles (usuarios_ti/{correo}) y bitácora de auditoría (ti_auditoria).
   Los permisos se validan en las reglas de Firestore; ocultar botones aquí es solo comodidad. */
(function () {
  'use strict';
  var TI = window.TI, L = TI.L, esc = TI.esc;
  var A = { tab: 'usuarios', el: null, audit: null, filtro: '', cargandoAudit: false };

  TI.registrarVista('ti-admin', {
    permitido: function (u) { return L.tiene(u, 'usuarios.admin') || L.tiene(u, 'auditoria.ver') || !!TI.pendienteBootstrap; },
    render: function (el) { A.el = el; if (!L.tiene(TI.user, 'usuarios.admin') && !TI.pendienteBootstrap) A.tab = 'auditoria'; pintar(); if (A.tab === 'usuarios' && !TI.usuariosCache) TI.cargarUsuariosCache().then(pintar); },
    destruir: function () { A.audit = null; A.el = null; A.tab = 'usuarios'; }
  });

  var DESCRIPCION = {
    director: 'Ve todos los procesos, aprueba o rechaza procedimientos (no los que él mismo editó), consulta la auditoría.',
    administrador: 'Crea y edita cualquier proceso, publica, carga el catálogo inicial, administra usuarios y roles, consulta la auditoría. No aprueba por ser administrador.',
    resp_proceso: 'Crea procesos y edita solo aquellos donde es responsable, participante o creador. Envía a revisión y a aprobación.',
    tecnico: 'Consulta únicamente procedimientos publicados vigentes.',
    solicitante: 'Sin acceso a procesos. Reservado para crear y dar seguimiento a tickets en la mesa de ayuda (fase posterior).'
  };

  function pintar() {
    var el = A.el; if (!el) return;
    var admin = TI.puede('usuarios.admin'), audi = TI.puede('auditoria.ver'), h = '';
    h += '<div class="ti-head"><div><h1 class="ti-h1">Administración</h1><div class="ti-sub">Usuarios, roles y bitácora de auditoría de la plataforma de TI.</div></div></div>';
    if (TI.pendienteBootstrap) {
      el.innerHTML = h + '<div class="ti-note warn"><b>Configuración inicial.</b> Aún no hay roles en la plataforma. Tu correo (<b>' + esc(TI.user.email) + '</b>) está autorizado para crear su propio registro como <b>Administrador de la plataforma y Director de TI</b>. Después podrás asignar roles a tu equipo.<div style="margin-top:10px"><button class="btn btn-blue" id="ad-boot">Crear mi registro de administrador</button></div></div>';
      el.querySelector('#ad-boot').onclick = inicializar; return;
    }
    h += '<div class="ti-tabs" role="tablist">' + (admin ? '<button role="tab" data-t="usuarios" aria-selected="' + (A.tab === 'usuarios') + '">Usuarios y roles</button><button role="tab" data-t="roles" aria-selected="' + (A.tab === 'roles') + '">Qué puede hacer cada rol</button>' : '') + (audi ? '<button role="tab" data-t="auditoria" aria-selected="' + (A.tab === 'auditoria') + '">Auditoría</button>' : '') + '</div>';
    if (A.tab === 'usuarios' && admin) h += vistaUsuarios();
    if (A.tab === 'roles' && admin) h += vistaRoles();
    if (A.tab === 'auditoria' && audi) h += vistaAuditoria();
    el.innerHTML = h;
    el.querySelectorAll('[data-t]').forEach(function (b) { b.onclick = function () { A.tab = b.dataset.t; if (A.tab === 'auditoria' && !A.audit) cargarAuditoria(); pintar(); }; });
    el.querySelectorAll('[data-ed]').forEach(function (b) { b.onclick = function () { editarUsuario(b.dataset.ed); }; });
    var nu = el.querySelector('#ad-nuevo'); if (nu) nu.onclick = function () { editarUsuario(null); };
    var eq = el.querySelector('#ad-equipo'); if (eq) eq.onclick = asignarEquipo;
    var rf = el.querySelector('#ad-ref'); if (rf) rf.onclick = cargarAuditoria;
    var q = el.querySelector('#ad-q'); if (q) q.oninput = function () { A.filtro = q.value; var pos = q.selectionStart; pintar(); var n = el.querySelector('#ad-q'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} };
    if (A.tab === 'auditoria' && audi && !A.audit && !A.cargandoAudit) cargarAuditoria();
  }

  /* ----- Usuarios ----- */
  function vistaUsuarios() {
    var cache = TI.usuariosCache || {}, emails = {};
    Object.keys(cache).forEach(function (e) { emails[e] = 1; });
    if (window.USER_DIR) Object.keys(USER_DIR).forEach(function (e) { emails[e] = 1; });
    var h = '<div class="ti-tools"><span class="ti-mut">Cuentas de inicio de sesión: ' + Object.keys(emails).length + '. El acceso al inventario existente no cambia con estos roles.</span><span style="flex:1"></span>' + (faltanEquipo().length ? '<button class="btn btn-sm" id="ad-equipo" title="Asigna el rol Responsable de proceso a los correos de tu equipo que aún no tienen registro">Asignar roles iniciales al equipo (' + faltanEquipo().length + ')</button> ' : '') + '<button class="btn btn-blue btn-sm" id="ad-nuevo">+ Agregar usuario</button></div>';
    h += '<div class="ti-card"><div class="ti-scroll"><table class="ti-table"><caption class="ti-sr">Usuarios y roles</caption><thead><tr><th>Usuario</th><th>Roles</th><th>Estado</th><th></th></tr></thead><tbody>';
    Object.keys(emails).sort().forEach(function (e) {
      var d = cache[e], nombre = (d && d.nombre) || (window.USER_DIR && USER_DIR[e] && USER_DIR[e].name) || e;
      h += '<tr><td><b>' + esc(nombre) + '</b><br><span class="ti-mut">' + esc(e) + '</span></td><td>' + (d && (d.roles || []).length ? d.roles.map(function (r) { return '<span class="pill ti-e ti-e-en_revision" style="margin:0 4px 4px 0">' + esc(L.ROLES[r] || r) + '</span>'; }).join('') : '<span class="ti-mut">Sin roles asignados</span>') + '</td><td>' + (d ? (d.activo === false ? '<span class="pill ti-e ti-e-obsoleto">Inactivo</span>' : '<span class="pill ti-e ti-e-publicado">Activo</span>') : '<span class="ti-mut">Sin registro</span>') + '</td><td style="text-align:right"><button class="btn btn-sm" data-ed="' + esc(e) + '">' + (d ? 'Cambiar roles' : 'Asignar roles') + '</button></td></tr>';
    });
    return h + '</tbody></table></div></div><div class="ti-note">Cada cambio de roles queda en la auditoría. Siempre debe quedar al menos un Administrador activo.</div>';
  }
  function vistaRoles() {
    return '<div class="ti-card"><div class="ti-scroll"><table class="ti-table"><thead><tr><th>Rol</th><th>Alcance en procesos y administración</th></tr></thead><tbody>' + Object.keys(L.ROLES).map(function (r) { return '<tr><td><b>' + esc(L.ROLES[r]) + '</b></td><td>' + esc(DESCRIPCION[r]) + '</td></tr>'; }).join('') + '</tbody></table></div></div><div class="ti-note">Un usuario puede tener varios roles; sus permisos se suman. La separación de funciones se mantiene aunque una persona tenga varios roles: nadie aprueba una versión que él mismo editó.</div>';
  }
  function editarUsuario(email) {
    var cache = TI.usuariosCache || {}, d = email ? cache[email] : null;
    var nombre = (d && d.nombre) || (email && window.USER_DIR && USER_DIR[email] && USER_DIR[email].name) || '';
    var h = '<div class="ti-f"><label for="u-mail">Correo *</label><input id="u-mail" class="fi" type="email" value="' + esc(email || '') + '"' + (email ? ' readonly' : '') + '><div class="ti-err" id="u-e1" role="alert"></div></div>' +
      '<div class="ti-f"><label for="u-nom">Nombre</label><input id="u-nom" class="fi" value="' + esc(nombre) + '"></div>' +
      '<div class="ti-f"><label>Roles</label><div class="ti-checks">' + Object.keys(L.ROLES).map(function (r) { return '<label><input type="checkbox" class="u-rol" value="' + r + '"' + (d && (d.roles || []).indexOf(r) >= 0 ? ' checked' : '') + '> ' + esc(L.ROLES[r]) + '</label>'; }).join('') + '</div><div class="ti-err" id="u-e2" role="alert"></div></div>' +
      '<div class="ti-f"><label><input type="checkbox" id="u-act"' + (!d || d.activo !== false ? ' checked' : '') + '> Usuario activo</label></div>' +
      '<div class="ti-help">El usuario debe existir en Firebase Authentication para poder iniciar sesión. Aquí solo se asignan sus roles.</div>';
    var m = TI.modal(email ? 'Roles de ' + nombre : 'Agregar usuario', h, { pieHtml: '<button class="btn" id="u-c">Cancelar</button><button class="btn btn-blue" id="u-ok">Guardar</button>', enfocar: email ? '#u-nom' : '#u-mail' });
    m.q('#u-c').onclick = m.cerrar;
    m.q('#u-ok').onclick = function () {
      var mail = m.q('#u-mail').value.trim().toLowerCase(), roles = [].slice.call(m.qa('.u-rol')).filter(function (x) { return x.checked; }).map(function (x) { return x.value; }), activo = m.q('#u-act').checked;
      m.q('#u-e1').textContent = ''; m.q('#u-e2').textContent = '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { m.q('#u-e1').textContent = 'Escribe un correo válido.'; m.q('#u-mail').focus(); return; }
      if (activo && !roles.length) { m.q('#u-e2').textContent = 'Asigna al menos un rol o desactiva al usuario.'; return; }
      var otros = Object.keys(cache).filter(function (k) { return k !== mail && cache[k].activo !== false && (cache[k].roles || []).indexOf('administrador') >= 0; }).length;
      if (!(activo && roles.indexOf('administrador') >= 0) && !otros) { m.q('#u-e2').textContent = 'Debe quedar al menos un Administrador activo.'; return; }
      var antes = d ? (d.roles || []).join(', ') + (d.activo === false ? ' (inactivo)' : '') : 'sin registro';
      var batch = db.batch(), ts = TI.serverTs(), ref = db.collection('usuarios_ti').doc(mail);
      var datos = { email: mail, nombre: m.q('#u-nom').value.trim() || mail.split('@')[0], roles: roles, activo: activo, actualizadoPor: TI.user.email, actualizadoEn: ts };
      if (d) batch.update(ref, datos); else batch.set(ref, Object.assign(datos, { creadoPor: TI.user.email, creadoEn: ts }));
      TI.auditar(batch, { accion: 'cambio_roles', tipo: 'usuario', id: mail, detalle: antes + ' → ' + roles.join(', ') + (activo ? '' : ' (inactivo)') });
      var btn = m.q('#u-ok'); btn.disabled = true;
      batch.commit().then(function () { m.cerrar(); TI.msg('Roles guardados'); return TI.cargarUsuariosCache(); }).then(function () { if (mail === TI.user.email) return TI.init(); }).then(pintar)
        .catch(function (e) { btn.disabled = false; TI.msg('No se pudo guardar: ' + e.message); });
    };
  }
  function faltanEquipo() { var c = TI.usuariosCache || {}; return TI.EQUIPO_INICIAL.filter(function (x) { return !c[x.email]; }); }
  function asignarEquipo() {
    var falta = faltanEquipo(); if (!falta.length) return;
    TI.confirmar('Asignar roles iniciales al equipo', 'Se crearán ' + falta.length + ' registros con el rol Responsable de proceso: ' + falta.map(function (x) { return x.email; }).join(', ') + '. Podrás cambiar sus roles después. Cada correo debe tener su cuenta en Firebase Authentication para poder entrar.', 'Asignar roles', function () {
      var batch = db.batch(), ts = TI.serverTs();
      falta.forEach(function (x) {
        var nombre = (window.USER_DIR && USER_DIR[x.email] && USER_DIR[x.email].name) || x.email.split('@')[0];
        batch.set(db.collection('usuarios_ti').doc(x.email), { email: x.email, nombre: nombre, roles: x.roles, activo: true, creadoPor: TI.user.email, creadoEn: ts, actualizadoPor: TI.user.email, actualizadoEn: ts });
        TI.auditar(batch, { accion: 'cambio_roles', tipo: 'usuario', id: x.email, detalle: 'sin registro → ' + x.roles.join(', ') + ' (equipo inicial)' });
      });
      batch.commit().then(function () { TI.msg('Roles asignados a ' + falta.length + ' personas'); return TI.cargarUsuariosCache(); }).then(pintar).catch(function (e) { TI.msg('No se pudo asignar: ' + e.message); });
    });
  }
  function inicializar() {
    var email = TI.user.email, ts = TI.serverTs(), batch = db.batch(), ref = db.collection('usuarios_ti').doc(email);
    batch.set(ref, { email: email, nombre: (window.curUser && curUser.name) || email, roles: TI.ARRANQUE_ROLES.slice(), activo: true, creadoPor: email, creadoEn: ts, actualizadoPor: email, actualizadoEn: ts });
    TI.auditar(batch, { accion: 'arranque_plataforma', tipo: 'usuario', id: email, detalle: 'Registro inicial: Administrador y Director' });
    batch.commit().then(function () { TI.msg('Listo: ya eres Administrador y Director'); return TI.init(); }).then(function () { TI.ir('ti-admin'); })
      .catch(function (e) { TI.msg('No se pudo crear el registro: ' + e.message + '. Si las reglas de Firestore aún no incluyen usuarios_ti, publícalas primero (ver docs/PLATAFORMA.md).'); });
  }

  /* ----- Auditoría ----- */
  function cargarAuditoria() {
    A.cargandoAudit = true;
    db.collection('ti_auditoria').orderBy('fecha', 'desc').limit(100).get().then(function (s) { A.audit = s.docs.map(function (d) { return d.data(); }); A.cargandoAudit = false; pintar(); })
      .catch(function (e) { A.audit = []; A.cargandoAudit = false; TI.msg('No se pudo leer la auditoría: ' + e.message); pintar(); });
  }
  function vistaAuditoria() {
    var q = A.filtro.trim().toLowerCase();
    var filas = (A.audit || []).filter(function (x) { return !q || (x.usuario + ' ' + x.accion + ' ' + x.registroId + ' ' + x.detalle + ' ' + x.motivo).toLowerCase().indexOf(q) >= 0; });
    var h = '<div class="ti-tools"><input id="ad-q" class="fi-sm" type="search" placeholder="Filtrar por usuario, acción o registro" aria-label="Filtrar auditoría" value="' + esc(A.filtro) + '" style="min-width:260px"><span class="ti-mut">Últimos 100 eventos. Solo lectura: nadie puede editar ni borrar la auditoría.</span><span style="flex:1"></span><button class="btn btn-sm" id="ad-ref">Actualizar</button></div>';
    h += '<div class="ti-card"><div class="ti-scroll"><table class="ti-table"><caption class="ti-sr">Auditoría</caption><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Registro</th><th>Detalle</th><th>Motivo</th></tr></thead><tbody>';
    if (A.audit === null) h += '<tr><td colspan="6" class="ti-empty">Cargando…</td></tr>';
    else if (!filas.length) h += '<tr><td colspan="6" class="ti-empty">' + (A.audit.length ? 'Ningún evento coincide.' : 'Aún no hay eventos registrados.') + '</td></tr>';
    filas.forEach(function (x) { h += '<tr><td>' + TI.fechaHora(x.fecha) + '</td><td>' + esc(TI.nombreDe(x.usuario)) + '</td><td>' + esc(x.accion) + '</td><td class="ti-code">' + esc(x.tipoRegistro) + ' ' + esc(x.registroId) + '</td><td>' + esc(x.detalle) + '</td><td>' + esc(x.motivo || '') + '</td></tr>'; });
    return h + '</tbody></table></div></div>';
  }
})();
