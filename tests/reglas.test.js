'use strict';
/* PRUEBAS DE LAS REGLAS DE FIRESTORE — PREPARADAS, NO EJECUTADAS EN EL ENTORNO DE DESARROLLO.
   El entorno donde se escribieron bloqueaba registry.npmjs.org y storage.googleapis.com, por lo que no se pudo instalar
   el emulador. Ejecutarlas en una máquina con acceso a internet:  cd tests && npm install && npm run test:reglas
   (requiere Java 11+ para el emulador). No tocan producción: usan el emulador y el proyecto "demo-cafiver-ti". */
const test = require('node:test');
const fs = require('fs'), path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { serverTimestamp, doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where, writeBatch, deleteDoc, runTransaction } = require('firebase/firestore');

let env;
const U = { adm: 'adm@x.mx', dir: 'dir@x.mx', resp: 'resp@x.mx', otro: 'otro@x.mx', tec: 'tec@x.mx', sol: 'sol@x.mx', nuevo: 'ramaya@cafiver.com.mx', sinrol: 'sinrol@x.mx' };
const ROLES = { adm: ['administrador'], dir: ['director'], resp: ['resp_proceso'], otro: ['resp_proceso'], tec: ['tecnico'], sol: ['solicitante'] };
const db = (k) => env.authenticatedContext('uid-' + k, { email: U[k] }).firestore();
const contenido = { objetivo: 'o', alcance: 'a', pasos: [{ descripcion: 'd', responsable: 'r' }], entradas: [], resultadosEsperados: [], sistemas: [], riesgos: [], controles: [], evidencias: [], indicadores: [], documentosRelacionados: [], tiempoObjetivo: '', descripcion: '' };

async function sembrar(estadoVersion, extra) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    for (const k of Object.keys(ROLES)) await setDoc(doc(f, 'usuarios_ti', U[k]), { email: U[k], roles: ROLES[k], activo: true });
    await setDoc(doc(f, 'ti_procesos', 'PRO-001'), Object.assign({ codigo: 'PRO-001', nombre: 'P', categoria: 'Servicio', responsable: U.resp, participantes: [], periodoRevisionMeses: 12, estado: estadoVersion, versionTrabajo: 1, versionPublicada: ['publicado', 'en_revision_periodica'].includes(estadoVersion) ? 1 : null, proximaRevision: null, documentado: false, creadoPor: U.resp }, extra || {}));
    await setDoc(doc(f, 'ti_procesos', 'PRO-001', 'versiones', '1'), { numero: 1, estado: estadoVersion, contenido, editores: [U.resp], creadoPor: U.resp, aprobacion: null });
  });
}
test.before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-cafiver-ti', firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') } }); });
test.after(async () => { await env.cleanup(); });
test.beforeEach(async () => { await env.clearFirestore(); });

test('usuarios_ti: el correo de arranque crea su propio registro de administrador; otros no', async () => {
  await assertSucceeds(setDoc(doc(db('nuevo'), 'usuarios_ti', U.nuevo), { email: U.nuevo, roles: ['administrador'], activo: true }));
  await assertFails(setDoc(doc(db('sinrol'), 'usuarios_ti', U.sinrol), { email: U.sinrol, roles: ['administrador'], activo: true }));
  await assertFails(setDoc(doc(db('nuevo'), 'usuarios_ti', U.nuevo + 'x'), { email: U.nuevo + 'x', roles: ['administrador'], activo: true }));
});
test('usuarios_ti: solo el administrador asigna roles; cada quien lee el suyo', async () => {
  await sembrar('borrador');
  await assertSucceeds(setDoc(doc(db('adm'), 'usuarios_ti', 'nuevo@x.mx'), { email: 'nuevo@x.mx', roles: ['tecnico'], activo: true }));
  await assertFails(setDoc(doc(db('resp'), 'usuarios_ti', 'nuevo2@x.mx'), { email: 'nuevo2@x.mx', roles: ['tecnico'], activo: true }));
  await assertFails(updateDoc(doc(db('resp'), 'usuarios_ti', U.resp), { roles: ['administrador'] }));
  await assertSucceeds(getDoc(doc(db('sinrol'), 'usuarios_ti', U.sinrol)));
  await assertFails(deleteDoc(doc(db('adm'), 'usuarios_ti', U.resp)));
});
test('procesos: el responsable crea (cabecera + versión 1 en un lote); el técnico y el solicitante no', async () => {
  await sembrar('borrador');
  const crear = (k, id) => { const f = db(k), b = writeBatch(f); b.set(doc(f, 'ti_procesos', id), { codigo: id, nombre: 'N', categoria: 'Servicio', responsable: U[k], participantes: [], periodoRevisionMeses: 12, estado: 'borrador', versionTrabajo: 1, versionPublicada: null, proximaRevision: null, documentado: false, creadoPor: U[k] }); b.set(doc(f, 'ti_procesos', id, 'versiones', '1'), { numero: 1, estado: 'borrador', contenido, editores: [U[k]], creadoPor: U[k], aprobacion: null }); return b.commit(); };
  await assertSucceeds(crear('resp', 'PRO-010'));
  await assertFails(crear('tec', 'PRO-011'));
  await assertFails(crear('sol', 'PRO-012'));
});
test('procesos: lectura por rol (técnico solo publicados, solicitante nada)', async () => {
  await sembrar('publicado');
  await assertSucceeds(getDocs(query(collection(db('tec'), 'ti_procesos'), where('versionPublicada', '>', 0))));
  await assertFails(getDocs(collection(db('tec'), 'ti_procesos')));
  await assertFails(getDocs(collection(db('sol'), 'ti_procesos')));
  await assertSucceeds(getDoc(doc(db('dir'), 'ti_procesos', 'PRO-001')));
  await assertFails(getDocs(collection(db('tec'), 'ti_procesos', 'PRO-001', 'historial')));
});
test('versiones: el responsable envía a revisión; no puede aprobar ni publicar', async () => {
  await sembrar('borrador');
  const v = (k) => doc(db(k), 'ti_procesos', 'PRO-001', 'versiones', '1'), p = (k) => doc(db(k), 'ti_procesos', 'PRO-001');
  const f = db('resp'), b = writeBatch(f);
  b.update(doc(f, 'ti_procesos', 'PRO-001', 'versiones', '1'), { estado: 'en_revision' }); b.update(doc(f, 'ti_procesos', 'PRO-001'), { estado: 'en_revision' });
  await assertSucceeds(b.commit());
  await assertFails(updateDoc(v('resp'), { estado: 'aprobado', aprobacion: { por: U.resp } }));
  await assertFails(updateDoc(v('otro'), { estado: 'pendiente_aprobacion' }));
});
test('aprobación: solo el Director, y no si editó la versión (segregación de funciones)', async () => {
  await sembrar('pendiente_aprobacion');
  const aprobar = async (k) => { const f = db(k), b = writeBatch(f); b.update(doc(f, 'ti_procesos', 'PRO-001', 'versiones', '1'), { estado: 'aprobado', aprobacion: { por: U[k], fecha: '2026-01-01', comentario: '' } }); b.update(doc(f, 'ti_procesos', 'PRO-001'), { estado: 'aprobado' }); return b.commit(); };
  await assertFails(aprobar('adm'));
  await assertFails(aprobar('resp'));
  await assertSucceeds(aprobar('dir'));
  await env.withSecurityRulesDisabled(async (c) => { await updateDoc(doc(c.firestore(), 'ti_procesos', 'PRO-001', 'versiones', '1'), { estado: 'pendiente_aprobacion', editores: [U.resp, U.dir] }); await updateDoc(doc(c.firestore(), 'ti_procesos', 'PRO-001'), { estado: 'pendiente_aprobacion' }); });
  await assertFails(aprobar('dir'));
});
test('no se puede publicar tocando solo la cabecera ni modificar una versión aprobada', async () => {
  await sembrar('aprobado');
  await assertFails(updateDoc(doc(db('resp'), 'ti_procesos', 'PRO-001'), { estado: 'publicado', versionPublicada: 1 }));
  await assertFails(updateDoc(doc(db('adm'), 'ti_procesos', 'PRO-001', 'versiones', '1'), { contenido: Object.assign({}, contenido, { objetivo: 'cambiado' }) }));
  const f = db('dir'), b = writeBatch(f);
  b.update(doc(f, 'ti_procesos', 'PRO-001', 'versiones', '1'), { estado: 'publicado' }); b.update(doc(f, 'ti_procesos', 'PRO-001'), { estado: 'publicado', versionPublicada: 1 });
  await assertSucceeds(b.commit());
});
test('nada se borra', async () => {
  await sembrar('borrador');
  for (const k of ['adm', 'dir', 'resp']) { await assertFails(deleteDoc(doc(db(k), 'ti_procesos', 'PRO-001'))); await assertFails(deleteDoc(doc(db(k), 'ti_procesos', 'PRO-001', 'versiones', '1'))); }
});
test('auditoría: se crea con el usuario propio; nadie edita ni borra; solo Director y Administrador leen', async () => {
  await sembrar('borrador');
  const ev = (k) => ({ fecha: serverTimestamp(), usuario: U[k], accion: 'x', tipoRegistro: 'proceso', registroId: 'PRO-001', resultado: 'ok', detalle: '', motivo: '' });
  await assertSucceeds(setDoc(doc(db('resp'), 'ti_auditoria', 'a1'), ev('resp')));
  await assertFails(setDoc(doc(db('resp'), 'ti_auditoria', 'a2'), ev('dir')));
  await assertFails(updateDoc(doc(db('adm'), 'ti_auditoria', 'a1'), { accion: 'y' }));
  await assertFails(deleteDoc(doc(db('adm'), 'ti_auditoria', 'a1')));
  await assertSucceeds(getDoc(doc(db('dir'), 'ti_auditoria', 'a1')));
  await assertFails(getDoc(doc(db('resp'), 'ti_auditoria', 'a1')));
});
test('catálogo: una tanda de 8 procesos cabe en los límites de las reglas', async () => {
  await sembrar('borrador');
  const f = db('adm');
  await assertSucceeds(runTransaction(f, async (tx) => {
    const c = doc(f, 'ti_config', 'contadores'); await tx.get(c);
    for (let n = 1; n <= 8; n++) { const id = 'PRO-1' + n; tx.set(doc(f, 'ti_procesos', id), { codigo: id, nombre: 'T' + n, categoria: 'Servicio', responsable: '', participantes: [], periodoRevisionMeses: 12, estado: 'borrador', versionTrabajo: 1, versionPublicada: null, proximaRevision: null, documentado: false, esPlantilla: true, creadoPor: U.adm }); tx.set(doc(f, 'ti_procesos', id, 'versiones', '1'), { numero: 1, estado: 'borrador', contenido, editores: [U.adm], creadoPor: U.adm, aprobacion: null }); }
    tx.set(c, { procesos: 8 });
  }));
});
test('inventario (transitorio): usuario autenticado lee y escribe; sin sesión no', async () => {
  await assertSucceeds(setDoc(doc(db('sinrol'), 'equipos', 'EQ1'), { id: 'EQ1' }));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'equipos', 'EQ1')));
  await assertFails(getDoc(doc(db('adm'), 'coleccion_inexistente', 'x')));
});
