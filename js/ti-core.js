/* CAFIVER TI — Núcleo de la plataforma: roles, auditoría, ventanas y conexión con la app de inventario.
   No modifica el inventario: solo agrega vistas nuevas y envuelve switchView / enterApp / doLogout. */
(function () {
  'use strict';
  var L = window.TI_LOGIC;
  var TI = window.TI = { L: L, user: null, ready: false, estado: 'inicio', vistas: {}, unsubs: [], usuariosCache: null };

  /* Administradores que pueden crear su propio registro la primera vez (deben coincidir con firestore.rules). */
  TI.BOOTSTRAP_ADMINS = ['ramaya@cafiver.com.mx'];
  /* Roles del primer ingreso (decisión de la Dirección de TI): quien arranca la plataforma es Administrador y Director.
     Debe coincidir con la regla de creación de usuarios_ti en firestore.rules. */
  TI.ARRANQUE_ROLES = ['administrador', 'director'];
  /* Equipo inicial: cada persona entra como Responsable de proceso (crea y edita sus procedimientos; el Director aprueba).
     Los roles se pueden cambiar después en Administración. El nombre solo se rellena si la app ya lo conoce (USER_DIR). */
  TI.EQUIPO_INICIAL = [
    { email: 'vlopez@cafiver.com.mx', roles: ['resp_proceso'] },
    { email: 'aosorio@cafiver.com.mx', roles: ['resp_proceso'] },
    { email: 'soportetecnico@cafiver.com.mx', roles: ['resp_proceso'] },
    { email: 'dgomez@cafiver.com.mx', roles: ['resp_proceso'] }
  ];

  /* ===== Utilidades ===== */
  TI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  TI.fecha = function (iso) {
    if (!iso) return '—';
    var p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
  };
  TI.fechaHora = function (ts) {
    if (!ts) return '—';
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  };
  TI.nombreDe = function (email) {
    if (!email) return '—';
    var c = TI.usuariosCache && TI.usuariosCache[email];
    if (c && c.nombre) return c.nombre;
    if (window.USER_DIR && USER_DIR[email]) return USER_DIR[email].name;
    return email;
  };
  TI.msg = function (m) { if (typeof window.toast === 'function') window.toast(m); else alert(m); };
  TI.serverTs = function () { return firebase.firestore.FieldValue.serverTimestamp(); };

  /* ===== Auditoría (solo creación; las reglas impiden editar o borrar) ===== */
  TI.auditar = function (batchOTx, e) {
    var ref = db.collection('ti_auditoria').doc();
    var datos = {
      fecha: TI.serverTs(), usuario: TI.user.email, accion: e.accion, tipoRegistro: e.tipo, registroId: e.id,
      resultado: e.resultado || 'ok', detalle: String(e.detalle || '').slice(0, 500), motivo: String(e.motivo || '').slice(0, 500)
    };
    if (batchOTx) batchOTx.set(ref, datos); else ref.set(datos);
    return ref;
  };

  /* ===== Ventanas ===== */
  TI.modal = function (titulo, cuerpoHtml, opciones) {
    opciones = opciones || {};
    var ov = document.createElement('div');
    ov.className = 'ti-ov';
    ov.innerHTML = '<div class="modal-card ' + (opciones.ancho ? 'wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + TI.esc(titulo) + '">' +
      '<div class="modal-hd"><div style="min-width:0">' + (opciones.encabezadoHtml || '<h3>' + TI.esc(titulo) + '</h3>') + '</div><button class="icon-btn ti-x" aria-label="Cerrar">&#x2715;</button></div>' +
      '<div class="modal-body">' + cuerpoHtml + '</div>' + (opciones.pieHtml ? '<div class="modal-footer">' + opciones.pieHtml + '</div>' : '') + '</div>';
    var prev = document.activeElement;
    function cerrar() { document.removeEventListener('keydown', onKey); ov.remove(); if (prev && document.contains(prev)) prev.focus(); if (opciones.alCerrar) opciones.alCerrar(); }
    function onKey(e) { if (e.key === 'Escape' && ov === TI._topModal()) cerrar(); }
    ov.addEventListener('mousedown', function (e) { if (e.target === ov && !opciones.noCerrarFuera) cerrar(); });
    ov.querySelector('.ti-x').onclick = cerrar;
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    (opciones.enfocar ? ov.querySelector(opciones.enfocar) : ov.querySelector('.ti-x')).focus();
    return { el: ov, cerrar: cerrar, q: function (s) { return ov.querySelector(s); }, qa: function (s) { return ov.querySelectorAll(s); } };
  };
  TI._topModal = function () { var m = document.querySelectorAll('.ti-ov'); return m[m.length - 1]; };
  /* Confirmación propia de la plataforma (no depende de confirmAction de la app). */
  TI.confirmar = function (titulo, mensaje, textoBoton, cb) {
    var m = TI.modal(titulo, '<p style="font-size:13px;line-height:1.5">' + TI.esc(mensaje) + '</p>',
      { pieHtml: '<button class="btn" id="ti-conf-no">Cancelar</button><button class="btn btn-blue" id="ti-conf-ok">' + TI.esc(textoBoton || 'Continuar') + '</button>', enfocar: '#ti-conf-no' });
    m.q('#ti-conf-no').onclick = m.cerrar;
    m.q('#ti-conf-ok').onclick = function () { m.cerrar(); cb(); };
  };
  /* Pregunta de texto con motivo obligatorio. */
  TI.pedirMotivo = function (titulo, etiqueta, cb) {
    var m = TI.modal(titulo, '<div class="ti-f"><label for="ti-mot">' + TI.esc(etiqueta) + ' *</label><textarea id="ti-mot" class="fi" rows="3"></textarea><div class="ti-err" id="ti-mot-e" role="alert"></div></div>',
      { pieHtml: '<button class="btn" id="ti-mot-c">Cancelar</button><button class="btn btn-blue" id="ti-mot-ok">Continuar</button>', enfocar: '#ti-mot' });
    m.q('#ti-mot-c').onclick = m.cerrar;
    m.q('#ti-mot-ok').onclick = function () {
      var v = m.q('#ti-mot').value.trim();
      if (!v) { m.q('#ti-mot-e').textContent = 'El motivo es obligatorio.'; m.q('#ti-mot').focus(); return; }
      m.cerrar(); cb(v);
    };
  };

  /* ===== Usuarios y roles ===== */
  TI.cargarUsuariosCache = function () {
    return db.collection('usuarios_ti').get().then(function (s) {
      TI.usuariosCache = {}; s.docs.forEach(function (d) { TI.usuariosCache[d.id] = d.data(); }); return TI.usuariosCache;
    }).catch(function (e) { console.warn('usuarios_ti:', e.message); TI.usuariosCache = TI.usuariosCache || {}; return TI.usuariosCache; });
  };
  TI.usuariosActivos = function () {
    var c = TI.usuariosCache || {};
    return Object.keys(c).filter(function (k) { return c[k].activo !== false; }).sort().map(function (k) { return { email: k, nombre: c[k].nombre || k, roles: c[k].roles || [] }; });
  };
  TI.puede = function (permiso) { return L.tiene(TI.user, permiso); };

  /* ===== Navegación y vistas ===== */
  TI.registrarVista = function (id, def) { TI.vistas[id] = def; };
  TI.puedeEntrar = function (id) { var v = TI.vistas[id]; return !!(v && TI.user && v.permitido(TI.user)); };

  TI.montar = function () {
    if (document.getElementById('tnav-ti-procesos')) return;
    var area = document.querySelector('.tnav-nav-area');
    var ref = document.getElementById('view-personal');
    if (!area || !ref) { console.warn('TI: no se encontró la estructura de la app para montar el menú'); return; }
    var html = '<div class="tnav-section ti-nav hidden" id="ti-sec-gestion">Gestión de TI</div>' +
      '<button class="tnav ti-nav hidden" id="tnav-ti-procesos" onclick="switchView(\'ti-procesos\')"><i class="ti ti-sitemap tnav-icon" aria-hidden="true"></i><span class="tnav-txt">Procesos y procedimientos</span></button>' +
      '<div class="tnav-section ti-nav hidden" id="ti-sec-admin">Administración</div>' +
      '<button class="tnav ti-nav hidden" id="tnav-ti-admin" onclick="switchView(\'ti-admin\')"><i class="ti ti-shield-lock tnav-icon" aria-hidden="true"></i><span class="tnav-txt">Usuarios, roles y auditoría</span></button>';
    area.insertAdjacentHTML('beforeend', html);   /* al final: no altera el orden de las secciones existentes */
    Object.keys(TI.vistas).forEach(function (id) {
      var d = document.createElement('div');
      d.id = 'view-' + id; d.className = 'view-wrap ti-view hidden';
      ref.parentNode.insertBefore(d, ref.nextSibling);
    });
  };
  TI.actualizarMenu = function () {
    var u = TI.user, verProc = !!(u && (L.tiene(u, 'procesos.ver') || L.tiene(u, 'procesos.ver_publicados')));
    var verAdmin = !!(u && (L.tiene(u, 'usuarios.admin') || L.tiene(u, 'auditoria.ver') || TI.pendienteBootstrap));
    function mostrar(id, si) { var e = document.getElementById(id); if (e) e.classList.toggle('hidden', !si); }
    mostrar('ti-sec-gestion', verProc); mostrar('tnav-ti-procesos', verProc);
    mostrar('ti-sec-admin', verAdmin); mostrar('tnav-ti-admin', verAdmin);
  };

  var switchViewOriginal = window.switchView;
  window.switchView = function (v) {
    var mia = TI.vistas[v];
    Object.keys(TI.vistas).forEach(function (id) {
      var el = document.getElementById('view-' + id), nav = document.getElementById('tnav-' + id);
      if (el) el.classList.toggle('hidden', id !== v);
      if (nav) nav.classList.toggle('on', id === v);
    });
    if (!mia) { switchViewOriginal(v); return; }
    if (!TI.puedeEntrar(v)) { TI.msg('No tienes permiso para abrir esta sección.'); switchViewOriginal('dashboard'); return; }
    switchViewOriginal('__ti__');                 /* oculta las vistas del inventario sin renderizar ninguna */
    window.curView = v;
    var el = document.getElementById('view-' + v); if (el) el.classList.remove('hidden');
    var nav = document.getElementById('tnav-' + v); if (nav) nav.classList.add('on');
    mia.render(document.getElementById('view-' + v));
  };

  /* ===== Ciclo de sesión ===== */
  TI.init = function () {
    TI.montar();
    var email = (window.curUser && curUser.email || '').toLowerCase();
    TI.user = null; TI.ready = false; TI.estado = 'cargando'; TI.pendienteBootstrap = false;
    return db.collection('usuarios_ti').doc(email).get().then(function (d) {
      var data = d.exists ? d.data() : null;
      if (data && data.activo !== false) {
        TI.user = { email: email, nombre: data.nombre || (window.curUser && curUser.name) || email, roles: data.roles || [] };
        TI.estado = 'ok';
      } else {
        TI.estado = data ? 'inactivo' : 'sin-registro';
        TI.pendienteBootstrap = !data && TI.BOOTSTRAP_ADMINS.indexOf(email) >= 0;
        if (TI.pendienteBootstrap) TI.user = { email: email, nombre: (window.curUser && curUser.name) || email, roles: [] };
      }
      TI.ready = true; TI.actualizarMenu();
      if (TI.user && TI.user.roles.length) return TI.cargarUsuariosCache();
    }).catch(function (e) {
      TI.estado = 'error'; TI.errorMsg = e.message; TI.ready = true; TI.actualizarMenu();
      console.warn('TI: no se pudo leer el rol del usuario:', e.message);
    });
  };
  TI.cerrarSesion = function () {
    TI.unsubs.forEach(function (f) { try { f(); } catch (e) {} }); TI.unsubs = [];
    document.querySelectorAll('.ti-ov').forEach(function (o) { o.remove(); });
    TI.user = null; TI.ready = false; TI.usuariosCache = null;
    Object.keys(TI.vistas).forEach(function (id) { var e = document.getElementById('view-' + id); if (e) { e.classList.add('hidden'); e.innerHTML = ''; } if (TI.vistas[id].destruir) TI.vistas[id].destruir(); });
    document.querySelectorAll('.ti-nav').forEach(function (e) { e.classList.add('hidden'); });
  };

  var enterAppOriginal = window.enterApp;
  window.enterApp = function () { enterAppOriginal.apply(this, arguments); TI.init(); };
  var doLogoutOriginal = window.doLogout;
  window.doLogout = function () { TI.cerrarSesion(); return doLogoutOriginal.apply(this, arguments); };
})();
