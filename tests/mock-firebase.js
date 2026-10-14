/* Simulación mínima de Firebase (Auth + Firestore) en memoria, SOLO para pruebas de interfaz en el navegador.
   NO aplica reglas de seguridad: esas se prueban con el emulador de Firestore (ver tests/reglas.test.js).
   Se inyecta en lugar de https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js. */
(function () {
  'use strict';
  function TS(ms) { this.ms = ms; }
  TS.prototype.toDate = function () { return new Date(this.ms); };
  var store = window.__SEED_STORE || {};      // ruta -> datos
  var USERS = window.__SEED_USERS || {};      // correo -> contraseña
  var listeners = [], writes = 0;
  window.__MOCK = { store: store, writes: function () { return writes; }, fail: null, failRead: null, lecturas: {} };

  function clone(v) {
    if (v instanceof TS) return new TS(v.ms);
    if (Array.isArray(v)) return v.map(clone);
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = clone(v[k]); }); return o; }
    return v;
  }
  function resolver(nuevo, previo) {
    var o = {};
    Object.keys(nuevo).forEach(function (k) {
      var v = nuevo[k];
      if (v && v.__sv === 'ts') o[k] = new TS(Date.now());
      else if (v && v.__sv === 'union') { var base = (previo && Array.isArray(previo[k])) ? previo[k].slice() : []; v.vals.forEach(function (x) { if (base.indexOf(x) < 0) base.push(x); }); o[k] = base; }
      else o[k] = clone(v);
    });
    return o;
  }
  function DocSnap(path, data) { this.id = path.split('/').pop(); this.ref = new DocRef(path); this.exists = data !== undefined; this._d = data; }
  DocSnap.prototype.data = function () { return this._d === undefined ? undefined : clone(this._d); };
  function DocRef(path) { this.path = path; this.id = path.split('/').pop(); }
  DocRef.prototype.collection = function (n) { return new Query(this.path + '/' + n); };
  DocRef.prototype.get = function () { var p = this.path; return Promise.resolve(new DocSnap(p, store[p])); };
  DocRef.prototype.set = function (d) { return commit([{ op: 'set', path: this.path, data: d }]); };
  DocRef.prototype.update = function (d) { return commit([{ op: 'update', path: this.path, data: d }]); };
  DocRef.prototype.onSnapshot = function (cb, err) { var p = this.path; return listen({ run: function () { cb(new DocSnap(p, store[p])); } }); };

  function Query(path, filtros, orden, limite) { this.path = path; this.f = filtros || []; this.o = orden || null; this.l = limite || null; }
  Query.prototype.doc = function (id) { return new DocRef(this.path + '/' + (id || ('auto' + Math.random().toString(36).slice(2, 10)))); };
  Query.prototype.add = function (d) { var r = this.doc(); return r.set(d).then(function () { return r; }); };
  Query.prototype.where = function (f, op, v) { return new Query(this.path, this.f.concat([[f, op, v]]), this.o, this.l); };
  Query.prototype.orderBy = function (f, dir) { return new Query(this.path, this.f, [f, dir || 'asc'], this.l); };
  Query.prototype.limit = function (n) { return new Query(this.path, this.f, this.o, n); };
  Query.prototype._docs = function () {
    var pre = this.path + '/', self = this, out = Object.keys(store).filter(function (p) { return p.indexOf(pre) === 0 && p.slice(pre.length).indexOf('/') < 0; }).map(function (p) { return new DocSnap(p, store[p]); });
    out = out.filter(function (d) { return self.f.every(function (x) {
      var val = d._d[x[0]];
      if (x[1] === '==') return val === x[2];
      if (x[1] === '>') return typeof val === typeof x[2] && val > x[2];
      if (x[1] === 'in') return x[2].indexOf(val) >= 0;
      throw new Error('Operador no soportado en la simulación: ' + x[1]);
    }); });
    if (this.o) { var f = this.o[0], dir = this.o[1] === 'desc' ? -1 : 1; out.sort(function (a, b) { var x = a._d[f], y = b._d[f]; x = x instanceof TS ? x.ms : x; y = y instanceof TS ? y.ms : y; return (x > y ? 1 : x < y ? -1 : 0) * dir; }); }
    if (this.l) out = out.slice(0, this.l);
    return out;
  };
  Query.prototype.get = function () {
    if (window.__MOCK.failRead) { var f = window.__MOCK.failRead(this.path); if (f) return Promise.reject(f); }
    var d = this._docs(); window.__MOCK.lecturas[this.path] = (window.__MOCK.lecturas[this.path] || 0) + d.length;
    return Promise.resolve({ docs: d, empty: !d.length, size: d.length });
  };
  Query.prototype.onSnapshot = function (cb, err) { var q = this; return listen({ run: function () { var d = q._docs(); cb({ docs: d, empty: !d.length, size: d.length }); } }); };

  function listen(l) { listeners.push(l); setTimeout(function () { try { l.run(); } catch (e) { console.error(e); } }, 0); return function () { var i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); }; }
  function notificar() { setTimeout(function () { listeners.slice().forEach(function (l) { try { l.run(); } catch (e) { console.error(e); } }); }, 0); }
  function commit(ops) {
    if (window.__MOCK.fail) { var f = window.__MOCK.fail(ops); if (f) return Promise.reject(f); }
    var tmp = {}; // validar antes de aplicar (atómico)
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i], ex = o.path in tmp ? tmp[o.path] : store[o.path];
      if (o.op === 'update') { if (ex === undefined) { var e = new Error('No document to update: ' + o.path); e.code = 'not-found'; return Promise.reject(e); } tmp[o.path] = Object.assign({}, ex, resolver(o.data, ex)); }
      else tmp[o.path] = resolver(o.data, null);
    }
    Object.keys(tmp).forEach(function (p) { store[p] = tmp[p]; }); writes += ops.length; notificar();
    return Promise.resolve();
  }
  function Batch() { this.ops = []; }
  Batch.prototype.set = function (r, d) { this.ops.push({ op: 'set', path: r.path, data: d }); return this; };
  Batch.prototype.update = function (r, d) { this.ops.push({ op: 'update', path: r.path, data: d }); return this; };
  Batch.prototype.commit = function () { return commit(this.ops); };
  function Tx() { this.ops = []; }
  Tx.prototype.get = function (r) { return r.get(); };
  Tx.prototype.set = function (r, d) { this.ops.push({ op: 'set', path: r.path, data: d }); return this; };
  Tx.prototype.update = function (r, d) { this.ops.push({ op: 'update', path: r.path, data: d }); return this; };

  var db = {
    collection: function (n) { return new Query(n); },
    batch: function () { return new Batch(); },
    runTransaction: function (fn) { var tx = new Tx(); return Promise.resolve().then(function () { return fn(tx); }).then(function (r) { return commit(tx.ops).then(function () { return r; }); }); }
  };
  function firestore() { return db; }
  firestore.FieldValue = { serverTimestamp: function () { return { __sv: 'ts' }; }, arrayUnion: function () { return { __sv: 'union', vals: [].slice.call(arguments) }; } };

  var actual = null, oyentes = [], auth = {
    get currentUser() { return actual; },
    onAuthStateChanged: function (cb) { oyentes.push(cb); setTimeout(function () { cb(actual); }, 0); return function () { oyentes = oyentes.filter(function (x) { return x !== cb; }); }; },
    signInWithEmailAndPassword: function (email, pass) {
      if (USERS[email] !== pass) { var e = new Error('x'); e.code = 'auth/invalid-credential'; return Promise.reject(e); }
      actual = { uid: 'uid-' + email, email: email }; var u = actual; setTimeout(function () { oyentes.slice().forEach(function (f) { f(u); }); }, 0); return Promise.resolve({ user: actual });
    },
    signOut: function () { actual = null; setTimeout(function () { oyentes.slice().forEach(function (f) { f(null); }); }, 0); return Promise.resolve(); }
  };
  window.firebase = { initializeApp: function () {}, firestore: firestore, auth: function () { return auth; } };
})();
