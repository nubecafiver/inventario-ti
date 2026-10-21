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
const U = { adm: 'adm@x.mx', dir: 'dir@x.mx', resp: 'resp@x.mx', otro: 'otro@x.mx', tec: 'tec@x.mx', sol: 'sol@x.mx', nuevo: 'ramaya@cafiver.com.mx', sinrol: 'sinrol@x.mx', ger: 'ger@x.mx', cons: 'cons@x.mx', cons2: 'cons2@x.mx' };
const ROLES = { adm: ['administrador'], dir: ['director'], resp: ['resp_proceso'], otro: ['resp_proceso'], tec: ['tecnico'], sol: ['solicitante'], ger: ['gerente'], cons: ['consultor'], cons2: ['consultor'] };
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

test('usuarios_ti: el correo de arranque crea su propio registro de Gerente; otros no', async () => {
  await assertSucceeds(setDoc(doc(db('nuevo'), 'usuarios_ti', U.nuevo), { email: U.nuevo, roles: ['gerente'], activo: true }));
  await assertFails(setDoc(doc(db('nuevo'), 'usuarios_ti', U.nuevo), { email: U.nuevo, roles: ['gerente', 'tecnico'], activo: true }));
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

/* ===================== MESA DE AYUDA (tickets) — preparadas, no ejecutadas ===================== */
const ahoraMs = () => Date.now();
const ticket = (extra) => Object.assign({ codigo: 'TCK-0001', titulo: 'T', descripcion: 'd', tipo: 'incidente', categoria: 'sap', impacto: 'alto', urgencia: 'alta', prioridad: 'critica', estado: 'nuevo', solicitanteEmail: U.sol, responsable: null, departamento: '', sistema: '', activoId: '', evidencias: [], esperas: [], escaladoNivel: 0, reaperturas: 0, primeraRespuestaMs: null, resueltoMs: null, cerradoMs: null, creadoMs: ahoraMs() }, extra || {});
async function sembrarTicket(extra) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    for (const k of Object.keys(ROLES)) await setDoc(doc(f, 'usuarios_ti', U[k]), { email: U[k], roles: ROLES[k], activo: true });
    await setDoc(doc(f, 'ti_tickets', 'TCK-0001'), ticket(extra));
    await setDoc(doc(f, 'ti_tickets', 'TCK-0001', 'comentarios', 'c1'), { texto: 'público', autor: U.tec, interno: false, fechaMs: 1 });
    await setDoc(doc(f, 'ti_tickets', 'TCK-0001', 'comentarios', 'c2'), { texto: 'interno', autor: U.tec, interno: true, fechaMs: 2 });
  });
}
const tref = (k) => doc(db(k), 'ti_tickets', 'TCK-0001');
test('tickets: cualquier usuario activo crea el suyo (estado nuevo, sin responsable); no a nombre de otro', async () => {
  await sembrarTicket();
  const nuevo = (k, extra) => setDoc(doc(db(k), 'ti_tickets', 'TCK-0002'), Object.assign(ticket({ codigo: 'TCK-0002', solicitanteEmail: U[k], creadoEn: serverTimestamp() }), extra || {}));
  await assertSucceeds(nuevo('sol'));
  await assertSucceeds(nuevo('resp'));
  await assertFails(setDoc(doc(db('sol'), 'ti_tickets', 'TCK-0003'), ticket({ codigo: 'TCK-0003', solicitanteEmail: U.resp, creadoEn: serverTimestamp() })));
  await assertFails(nuevo('sol', { estado: 'resuelto' }));
  await assertFails(nuevo('sol', { responsable: U.tec }));
  await assertFails(nuevo('sinrol'));
  await assertFails(nuevo('sol', { creadoMs: ahoraMs() - 3600000 }));
});
test('tickets: lectura — TI ve todos; el solicitante solo los suyos; comentarios internos solo TI', async () => {
  await sembrarTicket();
  await assertSucceeds(getDoc(tref('tec'))); await assertSucceeds(getDoc(tref('dir'))); await assertSucceeds(getDoc(tref('adm'))); await assertSucceeds(getDoc(tref('sol')));
  await assertFails(getDoc(tref('resp')));
  await assertSucceeds(getDocs(query(collection(db('sol'), 'ti_tickets'), where('solicitanteEmail', '==', U.sol))));
  await assertFails(getDocs(collection(db('sol'), 'ti_tickets')));
  await assertSucceeds(getDocs(collection(db('tec'), 'ti_tickets')));
  await assertSucceeds(getDocs(query(collection(db('sol'), 'ti_tickets', 'TCK-0001', 'comentarios'), where('interno', '==', false))));
  await assertFails(getDocs(collection(db('sol'), 'ti_tickets', 'TCK-0001', 'comentarios')));
  await assertSucceeds(getDocs(collection(db('tec'), 'ti_tickets', 'TCK-0001', 'comentarios')));
  await assertFails(getDocs(collection(db('sol'), 'ti_tickets', 'TCK-0001', 'historial')));
});
test('tickets: el técnico toma un ticket nuevo, pero no uno ajeno; el director solo asigna; el solicitante no atiende', async () => {
  await sembrarTicket();
  await assertSucceeds(updateDoc(tref('tec'), { responsable: U.tec, estado: 'asignado', actualizadoEn: serverTimestamp() }));
  await assertFails(updateDoc(tref('sol'), { estado: 'en_atencion', actualizadoEn: serverTimestamp() }));
  await assertFails(updateDoc(tref('dir'), { estado: 'en_atencion', actualizadoEn: serverTimestamp() }));
  await assertSucceeds(updateDoc(tref('dir'), { responsable: U.adm, actualizadoEn: serverTimestamp() }));
  await assertFails(updateDoc(tref('resp'), { estado: 'cancelado' }));
});
test('tickets: transiciones — saltos inválidos, campos fijos y cancelar ajenos', async () => {
  await sembrarTicket({ estado: 'en_atencion', responsable: U.tec });
  await assertFails(updateDoc(tref('tec'), { estado: 'nuevo' }));
  await assertFails(updateDoc(tref('tec'), { estado: 'cerrado' }));
  await assertFails(updateDoc(tref('tec'), { titulo: 'otro', actualizadoEn: serverTimestamp() }));
  await assertFails(updateDoc(tref('tec'), { solicitanteEmail: U.tec }));
  await assertFails(updateDoc(tref('tec'), { estado: 'cancelado' }));
  await assertSucceeds(updateDoc(tref('tec'), { estado: 'resuelto', resueltoMs: ahoraMs(), actualizadoEn: serverTimestamp() }));
  await sembrarTicket({ estado: 'en_atencion', responsable: U.tec });
  await assertSucceeds(updateDoc(tref('adm'), { estado: 'cancelado', actualizadoEn: serverTimestamp() }));
});
test('tickets: el solicitante confirma, reabre dentro de la ventana y no fuera; cancela solo si es nuevo', async () => {
  await sembrarTicket({ estado: 'resuelto', responsable: U.tec, resueltoMs: ahoraMs() - 3600000 });
  await assertSucceeds(updateDoc(tref('sol'), { estado: 'en_atencion', resueltoMs: null, cerradoMs: null, confirmacion: null, reaperturas: 1, actualizadoEn: serverTimestamp() }));
  await sembrarTicket({ estado: 'resuelto', responsable: U.tec, resueltoMs: ahoraMs() - 9 * 86400000 });
  await assertFails(updateDoc(tref('sol'), { estado: 'en_atencion', resueltoMs: null, cerradoMs: null, confirmacion: null, reaperturas: 1, actualizadoEn: serverTimestamp() }));
  await assertSucceeds(updateDoc(tref('sol'), { estado: 'cerrado', cerradoMs: ahoraMs(), confirmacion: { por: U.sol, fecha: ahoraMs(), ok: true }, actualizadoEn: serverTimestamp() }));
  await sembrarTicket({ estado: 'asignado', responsable: U.tec });
  await assertFails(updateDoc(tref('sol'), { estado: 'cancelado', actualizadoEn: serverTimestamp() }));
  await assertFails(updateDoc(tref('resp'), { estado: 'cancelado', actualizadoEn: serverTimestamp() }));
});
test('tickets: comentarios — el solicitante solo públicos en su ticket; TI también internos; no se editan ni borran', async () => {
  await sembrarTicket({ estado: 'en_atencion', responsable: U.tec });
  const c = (k, interno) => setDoc(doc(db(k), 'ti_tickets', 'TCK-0001', 'comentarios', 'n' + Math.random().toString(36).slice(2)), { texto: 'x', autor: U[k], interno, fechaMs: ahoraMs(), fecha: serverTimestamp() });
  await assertSucceeds(c('sol', false)); await assertFails(c('sol', true)); await assertSucceeds(c('tec', true)); await assertFails(c('resp', false));
  await assertFails(updateDoc(doc(db('tec'), 'ti_tickets', 'TCK-0001', 'comentarios', 'c1'), { texto: 'editado' }));
  await assertFails(deleteDoc(doc(db('adm'), 'ti_tickets', 'TCK-0001', 'comentarios', 'c1')));
  await assertFails(deleteDoc(tref('adm')));
});
test('ti_config: folio de tickets lo incrementa cualquier usuario activo (+1); la configuración solo el administrador', async () => {
  await sembrarTicket();
  const cr = doc(db('sol'), 'ti_config', 'contadores');
  await assertSucceeds(setDoc(cr, { tickets: 1 }));
  await assertSucceeds(updateDoc(cr, { tickets: 2 }));
  await assertFails(updateDoc(cr, { tickets: 9 }));
  await assertFails(updateDoc(cr, { procesos: 5 }));
  const cfgDoc = (k) => doc(db(k), 'ti_config', 'tickets');
  const cfg = { categorias: [{ id: 'sap', nombre: 'SAP', activa: true }], sla: {}, horario: null, ventanaReaperturaDias: 5, alertaPct: 25, actualizadoPor: U.adm, actualizadoEn: serverTimestamp() };
  await assertSucceeds(setDoc(cfgDoc('adm'), cfg));
  await assertFails(setDoc(cfgDoc('dir'), Object.assign({}, cfg, { actualizadoPor: U.dir })));
  await assertFails(setDoc(cfgDoc('tec'), Object.assign({}, cfg, { actualizadoPor: U.tec })));
  await assertSucceeds(getDoc(cfgDoc('sol')));
});

/* ===================== GERENTE Y CONSULTOR — preparadas, no ejecutadas ===================== */
test('gerente: ve todo y administra; consultor no', async () => {
  await sembrar('pendiente_aprobacion'); await sembrarTicket({ estado: 'asignado', responsable: U.cons2 });
  await assertSucceeds(getDoc(doc(db('ger'), 'ti_procesos', 'PRO-001')));
  await assertSucceeds(getDocs(collection(db('ger'), 'ti_auditoria')));
  await assertSucceeds(getDoc(tref('ger')));
  await assertSucceeds(setDoc(doc(db('ger'), 'usuarios_ti', 'nuevo@x.mx'), { email: 'nuevo@x.mx', roles: ['consultor'], activo: true }));
  await assertFails(setDoc(doc(db('cons'), 'usuarios_ti', 'otro2@x.mx'), { email: 'otro2@x.mx', roles: ['gerente'], activo: true }));
  await assertFails(getDocs(collection(db('cons'), 'ti_auditoria')));
});
test('consultor: procesos propios sí, aprobar no', async () => {
  await sembrar('borrador', { responsable: U.cons, creadoPor: U.cons });
  await assertSucceeds(getDoc(doc(db('cons'), 'ti_procesos', 'PRO-001')));
  await assertFails(updateDoc(doc(db('cons'), 'ti_procesos', 'PRO-001', 'versiones', '1'), { estado: 'aprobado' }));
});
test('consultor: tickets — lee asignados, propios y nuevos sin responsable; no los de otro consultor; atiende solo los suyos', async () => {
  await sembrarTicket({ estado: 'asignado', responsable: U.cons2 });
  await assertFails(getDoc(tref('cons')));
  await assertSucceeds(updateDoc(tref('ger'), { responsable: U.cons, actualizadoEn: serverTimestamp() }));
  await assertSucceeds(getDoc(tref('cons')));
  await assertSucceeds(updateDoc(tref('cons'), { estado: 'en_atencion', primeraRespuestaMs: ahoraMs(), actualizadoEn: serverTimestamp() }));
  await assertFails(updateDoc(tref('cons2'), { estado: 'resuelto', resueltoMs: ahoraMs(), actualizadoEn: serverTimestamp() }));
  await assertFails(updateDoc(tref('cons'), { estado: 'cancelado', actualizadoEn: serverTimestamp() }));
  await assertSucceeds(updateDoc(tref('ger'), { estado: 'cancelado', actualizadoEn: serverTimestamp() }));
});
test('consultor: toma un ticket nuevo sin responsable; consulta con filtro de sin responsable', async () => {
  await sembrarTicket({ estado: 'nuevo', responsable: null });
  await assertSucceeds(getDocs(query(collection(db('cons'), 'ti_tickets'), where('responsable', '==', null), where('estado', '==', 'nuevo'))));
  await assertFails(getDocs(collection(db('cons'), 'ti_tickets')));
  await assertSucceeds(updateDoc(tref('cons'), { responsable: U.cons, estado: 'asignado', actualizadoEn: serverTimestamp() }));
});

/* ===================== GESTIÓN DE CAMBIOS — preparadas, no ejecutadas ===================== */
const cambio = (extra) => Object.assign({ codigo: 'CHG-0001', titulo: 'C', tipo: 'normal', descripcion: 'd', justificacion: 'j', sistema: 'Red', activoIds: '', impacto: 'medio', probabilidad: 'baja', riesgo: 'bajo', planImplementacion: 'p', planPruebas: 't', planReversa: 'r', inicioMs: 1000, finMs: 2000, estado: 'borrador', solicitanteEmail: U.cons, responsableImpl: U.cons, evidencias: [], aprobacion: null, creadoMs: Date.now() }, extra || {});
async function sembrarCambio(extra) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    for (const k of Object.keys(ROLES)) await setDoc(doc(f, 'usuarios_ti', U[k]), { email: U[k], roles: ROLES[k], activo: true });
    await setDoc(doc(f, 'ti_cambios', 'CHG-0001'), cambio(extra));
  });
}
const cref = (k) => doc(db(k), 'ti_cambios', 'CHG-0001');
test('cambios: crean gerente y consultor (a su nombre, en borrador); técnico y solicitante no', async () => {
  await sembrarCambio();
  const nuevo = (k, id) => setDoc(doc(db(k), 'ti_cambios', id), cambio({ codigo: id, solicitanteEmail: U[k], creadoEn: serverTimestamp() }));
  await assertSucceeds(nuevo('cons', 'CHG-0002')); await assertSucceeds(nuevo('ger', 'CHG-0003'));
  await assertFails(nuevo('tec', 'CHG-0004')); await assertFails(nuevo('sol', 'CHG-0005'));
  await assertFails(setDoc(doc(db('cons'), 'ti_cambios', 'CHG-0006'), cambio({ codigo: 'CHG-0006', solicitanteEmail: U.ger, creadoEn: serverTimestamp() })));
  await assertFails(setDoc(doc(db('cons'), 'ti_cambios', 'CHG-0007'), cambio({ codigo: 'CHG-0007', estado: 'aprobado', creadoEn: serverTimestamp() })));
});
test('cambios: lectura — gerente todos; consultor solo solicitados o asignados; solicitante nada', async () => {
  await sembrarCambio();
  await assertSucceeds(getDoc(cref('ger'))); await assertSucceeds(getDoc(cref('dir'))); await assertSucceeds(getDoc(cref('cons')));
  await assertFails(getDoc(cref('cons2'))); await assertFails(getDoc(cref('sol')));
  await assertFails(getDocs(collection(db('cons'), 'ti_cambios')));
  await assertSucceeds(getDocs(query(collection(db('cons'), 'ti_cambios'), where('solicitanteEmail', '==', U.cons))));
});
test('cambios: enviar exige planes completos; aprobar solo el gerente/director y no lo propio (salvo emergencia)', async () => {
  await sembrarCambio({ planReversa: '' });
  await assertFails(updateDoc(cref('cons'), { estado: 'pendiente_aprobacion', enviadoMs: Date.now(), actualizadoEn: serverTimestamp() }));
  await sembrarCambio();
  await assertSucceeds(updateDoc(cref('cons'), { estado: 'pendiente_aprobacion', enviadoMs: Date.now(), actualizadoEn: serverTimestamp() }));
  await assertFails(updateDoc(cref('cons'), { estado: 'aprobado', aprobacion: { por: U.cons }, actualizadoEn: serverTimestamp() }));
  await assertSucceeds(updateDoc(cref('ger'), { estado: 'aprobado', aprobacion: { por: U.ger, fecha: 1, excepcion: false }, actualizadoEn: serverTimestamp() }));
  await sembrarCambio({ estado: 'pendiente_aprobacion', solicitanteEmail: U.ger });
  await assertFails(updateDoc(cref('ger'), { estado: 'aprobado', aprobacion: { por: U.ger }, actualizadoEn: serverTimestamp() }));
  await sembrarCambio({ estado: 'pendiente_aprobacion', solicitanteEmail: U.ger, tipo: 'emergencia' });
  await assertSucceeds(updateDoc(cref('ger'), { estado: 'aprobado', aprobacion: { por: U.ger, excepcion: true }, actualizadoEn: serverTimestamp() }));
});
test('cambios: implementa solo el asignado o el gerente; no se salta estados; cerrar es del gerente; cancelar según rol', async () => {
  await sembrarCambio({ estado: 'aprobado' });
  await assertFails(updateDoc(cref('cons2'), { estado: 'en_implementacion', inicioRealMs: 1, actualizadoEn: serverTimestamp() }));
  await assertFails(updateDoc(cref('cons'), { estado: 'implementado', actualizadoEn: serverTimestamp() }));
  await assertSucceeds(updateDoc(cref('cons'), { estado: 'en_implementacion', inicioRealMs: 1, actualizadoEn: serverTimestamp() }));
  await assertSucceeds(updateDoc(cref('cons'), { estado: 'implementado', finRealMs: 2, resultado: 'ok', fallo: false, finalizadoMs: 2, actualizadoEn: serverTimestamp() }));
  await assertFails(updateDoc(cref('cons'), { estado: 'cerrado', revision: 'x', cerradoMs: 3, actualizadoEn: serverTimestamp() }));
  await assertSucceeds(updateDoc(cref('ger'), { estado: 'cerrado', revision: 'x', cerradoMs: 3, actualizadoEn: serverTimestamp() }));
  await sembrarCambio({ estado: 'aprobado' });
  await assertFails(updateDoc(cref('cons'), { estado: 'cancelado', actualizadoEn: serverTimestamp() }));
  await assertSucceeds(updateDoc(cref('ger'), { estado: 'cancelado', actualizadoEn: serverTimestamp() }));
  await assertFails(deleteDoc(cref('ger')));
});
test('ti_config: folio de cambios lo incrementa quien puede crear cambios (+1); solicitante no', async () => {
  await sembrarCambio();
  await assertSucceeds(setDoc(doc(db('cons'), 'ti_config', 'contadores'), { cambios: 1 }));
  await assertSucceeds(updateDoc(doc(db('ger'), 'ti_config', 'contadores'), { cambios: 2 }));
  await assertFails(updateDoc(doc(db('ger'), 'ti_config', 'contadores'), { cambios: 9 }));
  await assertFails(updateDoc(doc(db('sol'), 'ti_config', 'contadores'), { cambios: 3 }));
});

/* ===================== PROVEEDORES Y CONTRATOS — preparadas, no ejecutadas ===================== */
const contrato = (extra) => Object.assign({ codigo: 'CTR-0001', titulo: 'C', tipo: 'soporte', proveedorId: 'PRV-001', objeto: 'o', inicio: '2026-01-01', fin: '2026-12-31', monto: 100, moneda: 'MXN', periodicidad: 'mensual', responsable: U.cons, estado: 'borrador', creadoPor: U.cons, aprobacion: null, documentos: [], creadoMs: Date.now() }, extra || {});
async function sembrarContrato(extra) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    for (const k of Object.keys(ROLES)) await setDoc(doc(f, 'usuarios_ti', U[k]), { email: U[k], roles: ROLES[k], activo: true });
    await setDoc(doc(f, 'ti_contratos', 'CTR-0001'), contrato(extra));
    await setDoc(doc(f, 'ti_proveedores', 'PRV-001'), { codigo: 'PRV-001', nombre: 'P', categoria: 'nube', estado: 'activo', creadoPor: U.cons, responsable: U.cons });
  });
}
const kref = (k) => doc(db(k), 'ti_contratos', 'CTR-0001');
test('contratos: crean gerente y consultor a su nombre en borrador; técnico y solicitante no', async () => {
  await sembrarContrato();
  const nuevo = (k, id) => setDoc(doc(db(k), 'ti_contratos', id), contrato({ codigo: id, creadoPor: U[k], creadoEn: serverTimestamp() }));
  await assertSucceeds(nuevo('cons', 'CTR-0002')); await assertSucceeds(nuevo('ger', 'CTR-0003'));
  await assertFails(nuevo('tec', 'CTR-0004')); await assertFails(nuevo('sol', 'CTR-0005'));
  await assertFails(setDoc(doc(db('cons'), 'ti_contratos', 'CTR-0006'), contrato({ codigo: 'CTR-0006', creadoPor: U.ger, creadoEn: serverTimestamp() })));
});
test('contratos: lectura — gerente todos; consultor solo los suyos; solicitante nada', async () => {
  await sembrarContrato();
  await assertSucceeds(getDoc(kref('ger'))); await assertSucceeds(getDoc(kref('dir'))); await assertSucceeds(getDoc(kref('cons')));
  await assertFails(getDoc(kref('cons2'))); await assertFails(getDoc(kref('sol')));
  await assertFails(getDocs(collection(db('cons'), 'ti_contratos')));
  await assertSucceeds(getDocs(query(collection(db('cons'), 'ti_contratos'), where('creadoPor', '==', U.cons))));
});
test('contratos: enviar exige datos completos; aprueba el gerente, nunca el creador; terminar y renovar', async () => {
  await sembrarContrato({ objeto: '' });
  await assertFails(updateDoc(kref('cons'), { estado: 'pendiente_aprobacion', actualizadoEn: serverTimestamp() }));
  await sembrarContrato();
  await assertSucceeds(updateDoc(kref('cons'), { estado: 'pendiente_aprobacion', actualizadoEn: serverTimestamp() }));
  await assertFails(updateDoc(kref('cons'), { estado: 'vigente', aprobacion: { por: U.cons }, actualizadoEn: serverTimestamp() }));
  await assertSucceeds(updateDoc(kref('ger'), { estado: 'vigente', aprobacion: { por: U.ger, fecha: 1 }, actualizadoEn: serverTimestamp() }));
  await assertFails(updateDoc(kref('cons'), { estado: 'terminado', terminadoMs: 1, actualizadoEn: serverTimestamp() }));
  await assertSucceeds(updateDoc(kref('ger'), { estado: 'renovado', actualizadoEn: serverTimestamp() }));
  await sembrarContrato({ estado: 'pendiente_aprobacion', creadoPor: U.ger });
  await assertFails(updateDoc(kref('ger'), { estado: 'vigente', aprobacion: { por: U.ger }, actualizadoEn: serverTimestamp() }));
});
test('contratos: un contrato vigente no se edita (monto, fechas); cancelar solo antes de aprobarse', async () => {
  await sembrarContrato({ estado: 'vigente' });
  await assertFails(updateDoc(kref('cons'), { monto: 1, actualizadoEn: serverTimestamp() }));
  await assertFails(updateDoc(kref('ger'), { monto: 1, actualizadoEn: serverTimestamp() }));
  await assertFails(updateDoc(kref('ger'), { estado: 'cancelado', actualizadoEn: serverTimestamp() }));
  await sembrarContrato({ estado: 'pendiente_aprobacion' });
  await assertSucceeds(updateDoc(kref('cons'), { estado: 'cancelado', actualizadoEn: serverTimestamp() }));
  await assertFails(deleteDoc(kref('ger')));
});
test('proveedores: crean gerente y consultor; el consultor solo ve y edita los suyos; folios y configuración', async () => {
  await sembrarContrato();
  await assertSucceeds(setDoc(doc(db('cons'), 'ti_proveedores', 'PRV-002'), { codigo: 'PRV-002', nombre: 'X', categoria: 'otro', estado: 'activo', creadoPor: U.cons, creadoEn: serverTimestamp() }));
  await assertFails(setDoc(doc(db('sol'), 'ti_proveedores', 'PRV-003'), { codigo: 'PRV-003', nombre: 'X', categoria: 'otro', estado: 'activo', creadoPor: U.sol, creadoEn: serverTimestamp() }));
  await assertFails(getDoc(doc(db('cons2'), 'ti_proveedores', 'PRV-001'))); await assertSucceeds(getDoc(doc(db('ger'), 'ti_proveedores', 'PRV-001')));
  await assertFails(updateDoc(doc(db('cons2'), 'ti_proveedores', 'PRV-001'), { nombre: 'Y' }));
  await assertSucceeds(updateDoc(doc(db('cons'), 'ti_proveedores', 'PRV-001'), { nombre: 'Y' }));
  await assertSucceeds(setDoc(doc(db('cons'), 'ti_config', 'contadores'), { contratos: 1 }));
  await assertSucceeds(updateDoc(doc(db('cons'), 'ti_config', 'contadores'), { contratos: 2 }));
  await assertFails(updateDoc(doc(db('cons'), 'ti_config', 'contadores'), { contratos: 9 }));
  const cfg = { avisoVencimientoDias: 90, actualizadoPor: U.ger, actualizadoEn: serverTimestamp() };
  await assertSucceeds(setDoc(doc(db('ger'), 'ti_config', 'proveedores'), cfg)); await assertFails(setDoc(doc(db('cons'), 'ti_config', 'proveedores'), Object.assign({}, cfg, { actualizadoPor: U.cons })));
});

/* ===================== RESPALDOS — preparadas, no ejecutadas ===================== */
const respaldo = (extra) => Object.assign({ codigo: 'RSP-001', nombre: 'R', que: 'q', categoria: 'servidor', frecuencia: 'diario', ubicacion: 'NAS', responsable: U.cons, creadoPor: U.cons, estado: 'activo', ultimaEjecucionMs: null, ultimaEjecucionResultado: null, ultimaPruebaMs: null, ultimaPruebaResultado: null, creadoMs: Date.now() }, extra || {});
async function sembrarRespaldo(extra) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    for (const k of Object.keys(ROLES)) await setDoc(doc(f, 'usuarios_ti', U[k]), { email: U[k], roles: ROLES[k], activo: true });
    await setDoc(doc(f, 'ti_respaldos', 'RSP-001'), respaldo(extra));
  });
}
const rref = (k) => doc(db(k), 'ti_respaldos', 'RSP-001');
test('respaldos: crean gerente y consultor a su nombre, sin ejecuciones; técnico y solicitante no', async () => {
  await sembrarRespaldo();
  const nuevo = (k, id, extra) => setDoc(doc(db(k), 'ti_respaldos', id), respaldo(Object.assign({ codigo: id, creadoPor: U[k], creadoEn: serverTimestamp() }, extra || {})));
  await assertSucceeds(nuevo('cons', 'RSP-002')); await assertSucceeds(nuevo('ger', 'RSP-003'));
  await assertFails(nuevo('tec', 'RSP-004')); await assertFails(nuevo('sol', 'RSP-005'));
  await assertFails(nuevo('cons', 'RSP-006', { ultimaEjecucionMs: 5, ultimaEjecucionResultado: 'exitoso' }));
  await assertFails(nuevo('cons', 'RSP-007', { frecuencia: 'cada_hora' }));
});
test('respaldos: lectura — gerente y director todos; consultor solo los suyos; solicitante nada', async () => {
  await sembrarRespaldo();
  await assertSucceeds(getDoc(rref('ger'))); await assertSucceeds(getDoc(rref('dir'))); await assertSucceeds(getDoc(rref('cons')));
  await assertFails(getDoc(rref('cons2'))); await assertFails(getDoc(rref('sol')));
  await assertFails(getDocs(collection(db('cons'), 'ti_respaldos')));
});
test('respaldos: ejecuciones y pruebas — las registra el responsable o el gerente; solo se crean; fecha no futura', async () => {
  await sembrarRespaldo();
  const ej = (k, extra) => setDoc(doc(collection(db(k), 'ti_respaldos', 'RSP-001', 'ejecuciones')), Object.assign({ fechaMs: Date.now() - 1000, resultado: 'exitoso', registradoPor: U[k], fecha: serverTimestamp() }, extra || {}));
  await assertSucceeds(ej('cons')); await assertSucceeds(ej('ger'));
  await assertFails(ej('cons2')); await assertFails(ej('dir')); await assertFails(ej('sol'));
  await assertFails(ej('cons', { fechaMs: Date.now() + 86400000 })); await assertFails(ej('cons', { resultado: 'excelente' }));
  await assertFails(setDoc(doc(collection(db('cons'), 'ti_respaldos', 'RSP-001', 'ejecuciones')), { fechaMs: 1, resultado: 'exitoso', registradoPor: U.ger, fecha: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(collection(db('cons'), 'ti_respaldos', 'RSP-001', 'pruebas')), { fechaMs: Date.now() - 1000, resultado: 'exitosa', registradoPor: U.cons, fecha: serverTimestamp() }));
  await assertFails(setDoc(doc(collection(db('cons'), 'ti_respaldos', 'RSP-001', 'pruebas')), { fechaMs: Date.now() - 1000, resultado: 'exitoso', registradoPor: U.cons, fecha: serverTimestamp() }));
});
test('respaldos: el resumen del trabajo solo cambia con campos de última ejecución/prueba; retirar solo el gerente', async () => {
  await sembrarRespaldo();
  await assertSucceeds(updateDoc(rref('cons'), { ultimaEjecucionMs: 5, ultimaEjecucionResultado: 'exitoso', actualizadoEn: serverTimestamp() }));
  await assertFails(updateDoc(rref('cons'), { ultimaEjecucionMs: 5, creadoPor: U.cons2 }));
  await assertFails(updateDoc(rref('cons2'), { ultimaEjecucionMs: 6, actualizadoEn: serverTimestamp() }));
  await assertSucceeds(updateDoc(rref('cons'), { estado: 'pausado', actualizadoEn: serverTimestamp() }));
  await assertSucceeds(updateDoc(rref('cons'), { estado: 'activo', actualizadoEn: serverTimestamp() }));
  await assertFails(updateDoc(rref('cons'), { estado: 'retirado', actualizadoEn: serverTimestamp() }));
  await assertSucceeds(updateDoc(rref('ger'), { estado: 'retirado', actualizadoEn: serverTimestamp() }));
  await assertFails(deleteDoc(rref('ger')));
});
test('ti_config: folio de respaldos (+1) y configuración solo del administrador', async () => {
  await sembrarRespaldo();
  await assertSucceeds(setDoc(doc(db('cons'), 'ti_config', 'contadores'), { respaldos: 1 }));
  await assertSucceeds(updateDoc(doc(db('cons'), 'ti_config', 'contadores'), { respaldos: 2 }));
  await assertFails(updateDoc(doc(db('cons'), 'ti_config', 'contadores'), { respaldos: 9 }));
  const cfg = { pruebaMaxDias: 180, actualizadoPor: U.ger, actualizadoEn: serverTimestamp() };
  await assertSucceeds(setDoc(doc(db('ger'), 'ti_config', 'respaldos'), cfg)); await assertFails(setDoc(doc(db('cons'), 'ti_config', 'respaldos'), Object.assign({}, cfg, { actualizadoPor: U.cons })));
});

test('historial: no se puede escribir suelto (sin una escritura del documento padre en el mismo lote)', async () => {
  await sembrarTicket();
  const h = () => doc(collection(db('sol'), 'ti_tickets', 'TCK-0001', 'historial'));
  // Sin tocar el ticket: rechazado aunque el usuario esté activo y se firme como él mismo.
  await assertFails(setDoc(h(), { fecha: serverTimestamp(), usuario: U.sol, accion: 'falso', detalle: 'x', motivo: '' }));
  // Junto con una acción permitida del solicitante (cancelar su ticket nuevo): aceptado.
  const b = writeBatch(db('sol'));
  b.update(tref('sol'), { estado: 'cancelado', esperas: [], actualizadoEn: serverTimestamp() });
  b.set(h(), { fecha: serverTimestamp(), usuario: U.sol, accion: 'cancelar', detalle: 'x', motivo: '' });
  await assertSucceeds(b.commit());
});
