/* CAFIVER TI — Carcasa de la aplicación: inicio de sesión, menú, enrutador y pantalla de inicio.
   Es independiente de la app de inventario (ver docs/PLATAFORMA.md). */
(function () {
  'use strict';
  var TI = window.TI, L = TI.L, esc = TI.esc;
  var actual = null;

  /* La pantalla de Inicio (dashboard) vive en ti/js/ti-inicio.js. */

  /* ===== Enrutador ===== */
  TI.ir = function (id, parametros) {
    var vista = TI.vistas[id];
    if (!vista) return;
    if (!TI.puedeEntrar(id)) { TI.msg('No tienes permiso para abrir esta sección.'); id = 'ti-inicio'; vista = TI.vistas[id]; }
    actual = id;
    Object.keys(TI.vistas).forEach(function (v) {
      var el = document.getElementById('view-' + v); if (el) el.classList.toggle('hidden', v !== id);
      var nav = document.getElementById('tnav-' + v); if (nav) { nav.classList.toggle('on', v === id); if (v === id) nav.setAttribute('aria-current', 'page'); else nav.removeAttribute('aria-current'); }
    });
    document.body.classList.remove('menu-abierto'); document.getElementById('burger').setAttribute('aria-expanded', 'false');
    try { if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id); } catch (e) {}
    vista.render(document.getElementById('view-' + id), parametros);
    window.scrollTo(0, 0);
  };
  /* Se llama al cargar o cambiar el rol: muestra solo los menús que corresponden. */
  TI.alCambiarRol = function () {
    var u = TI.user, verProc = !!(u && (L.tiene(u, 'procesos.ver') || L.tiene(u, 'procesos.ver_publicados')));
    var verAdmin = !!(u && (L.tiene(u, 'usuarios.admin') || L.tiene(u, 'auditoria.ver')) || TI.pendienteBootstrap);
    document.getElementById('tnav-ti-procesos').classList.toggle('hidden', !verProc);
    document.getElementById('tnav-ti-admin').classList.toggle('hidden', !verAdmin);
    var roles = u && u.roles && u.roles.length ? u.roles.map(function (r) { return L.ROLES[r] || r; }).join(' · ') : 'Sin rol en la plataforma';
    document.getElementById('cur-rol').textContent = roles;
  };

  /* ===== Sesión ===== */
  function mostrarLogin() {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}   /* un nuevo inicio de sesión siempre empieza en Inicio */
    document.getElementById('app').classList.add('hidden'); document.getElementById('login-screen').classList.remove('hidden');
    var b = document.getElementById('login-btn'); b.disabled = false; b.textContent = 'Iniciar sesión';
  }
  function iniciales(n) { return (n || '?').split(' ').map(function (w) { return w[0] || ''; }).join('').toUpperCase().slice(0, 2); }
  function entrar(user) {
    var email = (user.email || '').toLowerCase(), conocido = USER_DIR[email];
    window.curUser = curUser = { uid: user.uid, email: email, name: conocido ? conocido.name : email.split('@')[0] };
    document.getElementById('login-screen').classList.add('hidden'); document.getElementById('app').classList.remove('hidden');
    document.getElementById('cur-nm').textContent = curUser.name; document.getElementById('cur-av').textContent = iniciales(curUser.name);
    TI.init().then(function () {
      var nombre = TI.user && TI.user.nombre; if (nombre) { curUser.name = nombre; document.getElementById('cur-nm').textContent = nombre; document.getElementById('cur-av').textContent = iniciales(nombre); }
      var destino = (location.hash || '').replace('#', '');
      TI.ir(TI.vistas[destino] && TI.puedeEntrar(destino) ? destino : 'ti-inicio');
    });
  }
  function error(msg) { var e = document.getElementById('login-error'); e.textContent = msg; e.style.display = 'block'; }
  document.getElementById('login-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var email = document.getElementById('login-email').value.trim().toLowerCase(), pass = document.getElementById('login-pass').value;
    document.getElementById('login-error').style.display = 'none';
    if (!email) return error('Escribe tu correo.');
    if (!pass) return error('Escribe tu contraseña.');
    var b = document.getElementById('login-btn'); b.disabled = true; b.textContent = 'Entrando…';
    auth.signInWithEmailAndPassword(email, pass).catch(function (e) {
      b.disabled = false; b.textContent = 'Iniciar sesión';
      var m = 'Correo o contraseña incorrectos.';
      if (e.code === 'auth/user-not-found') m = 'Usuario no encontrado.';
      if (e.code === 'auth/invalid-email') m = 'Formato de correo inválido.';
      if (e.code === 'auth/too-many-requests') m = 'Demasiados intentos. Espera unos minutos.';
      if (e.code === 'auth/network-request-failed') m = 'Sin conexión a internet.';
      error(m);
    });
  });
  document.getElementById('salir').onclick = function () { TI.cerrarSesion(); auth.signOut(); };
  document.querySelectorAll('[data-vista]').forEach(function (b) { b.onclick = function () { TI.ir(b.dataset.vista); }; });
  document.getElementById('burger').onclick = function () { var a = document.body.classList.toggle('menu-abierto'); this.setAttribute('aria-expanded', String(a)); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('menu-abierto')) document.body.classList.remove('menu-abierto'); });

  /* La sesión se restaura sola al recargar. */
  var primera = true;
  auth.onAuthStateChanged(function (u) {
    if (u) { if (!window.curUser || window.curUser.uid !== u.uid) entrar(u); }
    else { if (!primera) { TI.cerrarSesion(); } window.curUser = curUser = null; mostrarLogin(); }
    primera = false;
  });
})();
