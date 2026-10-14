'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../ti/js/ti-logic.js');

const dir = { email: 'dir@x.mx', roles: ['director'] };
const adm = { email: 'adm@x.mx', roles: ['administrador'] };
const resp = { email: 'resp@x.mx', roles: ['resp_proceso'] };
const otro = { email: 'otro@x.mx', roles: ['resp_proceso'] };
const tec = { email: 'tec@x.mx', roles: ['tecnico'] };
const sol = { email: 'sol@x.mx', roles: ['solicitante'] };

function contenidoCompleto() {
  const c = L.contenidoVacio();
  c.objetivo = 'obj'; c.alcance = 'alc';
  c.pasos = [Object.assign(L.pasoVacio(), { descripcion: 'd', responsable: 'r' })];
  return c;
}
function proc(extra) {
  return Object.assign({ responsable: 'resp@x.mx', creadoPor: 'resp@x.mx', participantes: [], estado: 'borrador',
    versionTrabajo: 1, versionPublicada: null, periodoRevisionMeses: 12 }, extra);
}
function ver(extra) {
  return Object.assign({ numero: 1, estado: 'borrador', contenido: contenidoCompleto(), editores: ['resp@x.mx'] }, extra);
}
const ids = (ctx) => L.accionesDisponibles(ctx).filter((a) => a.ok).map((a) => a.id);

test('permisos por rol (mínimo privilegio)', () => {
  assert.equal(L.tiene(dir, 'procesos.aprobar'), true);
  assert.equal(L.tiene(adm, 'procesos.aprobar'), false, 'el administrador no aprueba por ser administrador');
  assert.equal(L.tiene(resp, 'procesos.aprobar'), false);
  assert.equal(L.tiene(sol, 'procesos.ver'), false);
  assert.equal(L.tiene(tec, 'procesos.crear'), false);
  assert.equal(L.tiene(adm, 'usuarios.admin'), true);
  assert.equal(L.tiene(dir, 'usuarios.admin'), false);
});

test('visibilidad: el técnico solo ve procedimientos con versión publicada; el solicitante nada', () => {
  assert.equal(L.puedeVer(tec, proc({ versionPublicada: null })), false);
  assert.equal(L.puedeVer(tec, proc({ versionPublicada: 2 })), true);
  assert.equal(L.puedeVer(sol, proc({ versionPublicada: 2 })), false);
  assert.equal(L.puedeVer(dir, proc()), true);
});

test('edición: el responsable solo edita sus procesos; el administrador todos', () => {
  assert.equal(L.esEditor(resp, proc()), true);
  assert.equal(L.esEditor(otro, proc()), false);
  assert.equal(L.esEditor(adm, proc()), true);
  assert.equal(L.esEditor(dir, proc()), false);
  assert.equal(L.esEditor(otro, proc({ participantes: ['otro@x.mx'] })), true);
});

test('flujo completo: borrador → revisión → aprobación → publicado, con cada rol', () => {
  const p = proc();
  let v = ver();
  assert.deepEqual(ids({ user: resp, proceso: p, version: v }), ['enviar_revision', 'marcar_obsoleto'].filter((x) => x === 'enviar_revision'));
  let c = L.aplicarAccion({ user: resp, proceso: p, version: v }, 'enviar_revision');
  assert.equal(c.version.estado, 'en_revision');
  v = ver({ estado: 'en_revision' });
  assert.ok(ids({ user: resp, proceso: p, version: v }).includes('solicitar_aprobacion'));
  v = ver({ estado: 'pendiente_aprobacion' });
  assert.deepEqual(ids({ user: resp, proceso: p, version: v }), [], 'el responsable no aprueba');
  c = L.aplicarAccion({ user: dir, proceso: p, version: v }, 'aprobar', { hoy: '2026-01-10' });
  assert.equal(c.version.estado, 'aprobado');
  assert.equal(c.version.aprobacion.por, 'dir@x.mx');
  v = ver({ estado: 'aprobado' });
  c = L.aplicarAccion({ user: dir, proceso: p, version: v }, 'publicar', { hoy: '2026-01-31' });
  assert.equal(c.proceso.versionPublicada, 1);
  assert.equal(c.proceso.documentado, true);
  assert.equal(c.proceso.proximaRevision, '2027-01-31');
});

test('segregación de funciones: quien editó la versión no puede aprobarla', () => {
  const p = proc();
  const v = ver({ estado: 'pendiente_aprobacion', editores: ['resp@x.mx', 'dir@x.mx'] });
  const a = L.accionesDisponibles({ user: dir, proceso: p, version: v }).find((x) => x.id === 'aprobar');
  assert.equal(a.ok, false);
  assert.match(a.motivo, /Segregación/);
  assert.throws(() => L.aplicarAccion({ user: dir, proceso: p, version: v }, 'aprobar'), /Segregación/);
});

test('el administrador no puede aprobar aunque no haya editado', () => {
  const v = ver({ estado: 'pendiente_aprobacion' });
  assert.throws(() => L.aplicarAccion({ user: adm, proceso: proc(), version: v }, 'aprobar'), /Director/);
});

test('no se salta estados: no se puede publicar un borrador ni aprobar algo en revisión', () => {
  assert.throws(() => L.aplicarAccion({ user: dir, proceso: proc(), version: ver({ estado: 'borrador' }) }, 'publicar'), /no es válida/);
  assert.throws(() => L.aplicarAccion({ user: dir, proceso: proc(), version: ver({ estado: 'en_revision' }) }, 'aprobar'), /no es válida/);
});

test('rechazar y marcar obsoleto exigen motivo', () => {
  const v = ver({ estado: 'pendiente_aprobacion' });
  assert.throws(() => L.aplicarAccion({ user: dir, proceso: proc(), version: v }, 'rechazar'), /motivo/i);
  const c = L.aplicarAccion({ user: dir, proceso: proc(), version: v }, 'rechazar', { motivo: 'falta el alcance' });
  assert.equal(c.version.estado, 'borrador');
  assert.equal(c.version.motivoRechazo, 'falta el alcance');
  const pub = proc({ estado: 'publicado', versionPublicada: 1 });
  assert.throws(() => L.aplicarAccion({ user: dir, proceso: pub, version: ver({ estado: 'publicado' }) }, 'marcar_obsoleto'), /motivo/i);
});

test('enviar a revisión valida que el borrador esté completo', () => {
  const v = ver({ contenido: L.contenidoVacio() });
  try { L.aplicarAccion({ user: resp, proceso: proc(), version: v }, 'enviar_revision'); assert.fail('debía lanzar'); }
  catch (e) { assert.ok(e.detalle.objetivo && e.detalle.alcance && e.detalle.pasos); }
});

test('versionado: un procedimiento publicado que cambia crea una versión nueva y conserva la anterior', () => {
  const p = proc({ estado: 'publicado', versionPublicada: 1, versionTrabajo: 1 });
  const v = ver({ estado: 'publicado' });
  const c = L.aplicarAccion({ user: resp, proceso: p, version: v }, 'nueva_version');
  assert.deepEqual(c.version, {}, 'la versión publicada no se toca');
  assert.equal(c.nuevaVersion.numero, 2);
  assert.equal(c.nuevaVersion.estado, 'borrador');
  assert.equal(c.proceso.versionTrabajo, 2);
  assert.equal(c.proceso.versionPublicada, undefined, 'la v1 sigue siendo la vigente');
  assert.deepEqual(c.nuevaVersion.editores, ['resp@x.mx']);
  assert.notEqual(c.nuevaVersion.contenido, v.contenido, 'copia profunda');
});

test('al publicar la v2, la v1 queda como reemplazada', () => {
  const p = proc({ estado: 'aprobado', versionPublicada: 1, versionTrabajo: 2 });
  const v = ver({ numero: 2, estado: 'aprobado' });
  const c = L.aplicarAccion({ user: dir, proceso: p, version: v }, 'publicar', { hoy: '2026-03-01' });
  assert.deepEqual(c.versionAnterior, { numero: 1, estado: 'reemplazada' });
  assert.equal(c.proceso.versionPublicada, 2);
});

test('no se puede crear otra versión si ya hay un borrador abierto', () => {
  const p = proc({ estado: 'borrador', versionPublicada: 1, versionTrabajo: 2 });
  const vPublicada = ver({ numero: 1, estado: 'publicado' });
  assert.deepEqual(L.accionesDisponibles({ user: resp, proceso: p, version: vPublicada }), [], 'solo se actúa sobre la versión de trabajo');
});

test('marcar obsoleto limpia la vigencia', () => {
  const p = proc({ estado: 'publicado', versionPublicada: 1 });
  const c = L.aplicarAccion({ user: dir, proceso: p, version: ver({ estado: 'publicado' }) }, 'marcar_obsoleto', { motivo: 'sustituido' });
  assert.equal(c.proceso.estado, 'obsoleto');
  assert.equal(c.proceso.versionPublicada, null);
});

test('ratificar mueve la próxima revisión sin crear versión', () => {
  const p = proc({ estado: 'en_revision_periodica', versionPublicada: 1, periodoRevisionMeses: 6 });
  const c = L.aplicarAccion({ user: dir, proceso: p, version: ver({ estado: 'en_revision_periodica' }) }, 'ratificar', { hoy: '2026-08-31' });
  assert.equal(c.proceso.proximaRevision, '2027-02-28');
  assert.equal(c.nuevaVersion, null);
});

test('fechas: sumar meses respeta fin de mes', () => {
  assert.equal(L.sumarMeses('2026-01-31', 1), '2026-02-28');
  assert.equal(L.sumarMeses('2027-01-31', 1), '2027-02-28');
  assert.equal(L.sumarMeses('2028-01-31', 1), '2028-02-29');
  assert.equal(L.sumarMeses('2026-11-15', 3), '2027-02-15');
  assert.equal(L.sumarDias('2026-12-30', 3), '2027-01-02');
});

test('indicadores: sin porcentaje con muestra insuficiente (<5)', () => {
  const lista = [proc({ estado: 'publicado', versionPublicada: 1, documentado: true, proximaRevision: '2026-12-01' }), proc(), proc()];
  const i = L.indicadores(lista, '2026-10-01');
  assert.equal(i.registrados, 3);
  assert.equal(i.documentados, 1);
  assert.equal(i.porcentajeDocumentados, null);
});

test('indicadores: cálculo con datos suficientes, vencidos y próximos', () => {
  const hoy = '2026-10-01';
  const lista = [
    proc({ estado: 'publicado', versionPublicada: 1, documentado: true, proximaRevision: '2026-10-15', participantes: ['a'] }),   // próximo
    proc({ estado: 'publicado', versionPublicada: 1, documentado: true, proximaRevision: '2026-09-01' }),                         // vencido, sin respaldo
    proc({ estado: 'publicado', versionPublicada: 1, documentado: false, proximaRevision: '2027-05-01', participantes: ['a'] }), // vigente no documentado
    proc({ estado: 'pendiente_aprobacion', participantes: ['a'] }),
    proc({ estado: 'en_revision', participantes: ['a'] }),
    proc({ estado: 'obsoleto' })
  ];
  const i = L.indicadores(lista, hoy);
  assert.equal(i.registrados, 5, 'los obsoletos no cuentan');
  assert.equal(i.documentados, 2);
  assert.equal(i.porcentajeDocumentados, 40);
  assert.equal(i.publicados, 3);
  assert.equal(i.proximosRevision, 1);
  assert.equal(i.revisionVencida, 1);
  assert.equal(i.pendientesAprobacion, 1);
  assert.equal(i.enRevision, 1);
  assert.equal(i.sinRespaldo, 1, 'solo el publicado vencido no tiene participantes; el obsoleto no cuenta');
});

test('filtros de tarjeta devuelven exactamente los registros que componen el indicador', () => {
  const hoy = '2026-10-01';
  const lista = [
    proc({ estado: 'publicado', versionPublicada: 1, documentado: true, proximaRevision: '2026-09-01' }),
    proc({ estado: 'publicado', versionPublicada: 1, documentado: true, proximaRevision: '2026-10-10', participantes: ['a'] }),
    proc({ estado: 'borrador', participantes: ['a'] }), proc({ estado: 'borrador', participantes: ['a'] }), proc({ estado: 'borrador', participantes: ['a'] })
  ];
  const i = L.indicadores(lista, hoy);
  ['registrados', 'documentados', 'enRevision', 'pendientesAprobacion', 'publicados', 'proximosRevision', 'revisionVencida', 'sinRespaldo'].forEach((k) => {
    const n = lista.filter(L.filtroIndicador(k, hoy)).length;
    const esperado = k === 'documentados' ? i.documentados : i[k];
    assert.equal(n, esperado, 'tarjeta ' + k);
  });
});

test('catálogo inicial: 21 procesos únicos, solo nombre y categoría válida', () => {
  assert.equal(L.CATALOGO_INICIAL.length, 21);
  assert.equal(new Set(L.CATALOGO_INICIAL.map((x) => x[0])).size, 21);
  L.CATALOGO_INICIAL.forEach((x) => { assert.equal(x.length, 2); assert.ok(L.CATEGORIAS.includes(x[1]), x[1]); });
});

test('enlaces de documentos: solo https', () => {
  assert.equal(L.urlSegura('https://drive.google.com/x'), true);
  assert.equal(L.urlSegura('http://x.com'), false);
  assert.equal(L.urlSegura('javascript:alert(1)'), false);
  assert.equal(L.urlSegura('no es url'), false);
  const e = L.validarContenido(Object.assign(L.contenidoVacio(), { documentosRelacionados: [{ titulo: '', url: 'javascript:1' }] }), false);
  assert.ok(e['doc0.titulo'] && e['doc0.url']);
});

test('lineas: una por renglón, sin vacías', () => {
  assert.deepEqual(L.lineas(' a \n\n b\r\n'), ['a', 'b']);
  assert.deepEqual(L.lineas(''), []);
});
