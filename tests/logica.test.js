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

test('permiso del resumen del inventario: solo Director y Administrador', () => {
  assert.equal(L.tiene(dir, 'inventario.resumen'), true);
  assert.equal(L.tiene(adm, 'inventario.resumen'), true);
  ['resp', 'tec', 'sol'].forEach((k) => assert.equal(L.tiene({ resp, tec, sol }[k], 'inventario.resumen'), false, k));
});

const HOY = '2026-10-14';
const eq = (e) => Object.assign({ estado: 'Bueno', responsable: 'Ana', fecha: '2025-10-14' }, e);

test('inventario: sin equipos devuelve ceros y sin porcentajes', () => {
  const i = L.indicadoresInventario([], HOY);
  assert.equal(i.total, 0); assert.equal(i.activos, 0); assert.equal(i.pctBueno, null); assert.equal(i.pctConResponsable, null);
  assert.deepEqual(L.indicadoresInventario(undefined, HOY).total, 0);
});
test('inventario: Baja no cuenta como activo ni en responsables, estado ni vida útil', () => {
  const i = L.indicadoresInventario([eq({ estado: 'Baja', responsable: '', fecha: '' }), eq({}), eq({ estado: ' baja ' })], HOY);
  assert.equal(i.total, 3); assert.equal(i.dadosDeBaja, 1); assert.equal(i.activos, 2, '" baja " en minúsculas no es la palabra exacta: cuenta como sin estado');
  assert.equal(i.sinEstado, 1);
});
test('inventario: responsable vacío o solo espacios cuenta como sin responsable', () => {
  const i = L.indicadoresInventario([eq({ responsable: '' }), eq({ responsable: '   ' }), eq({ responsable: null }), eq({ responsable: undefined }), eq({})], HOY);
  assert.equal(i.sinResponsable, 4); assert.equal(i.conResponsable, 1);
});
test('inventario: estado físico y estado desconocido', () => {
  const i = L.indicadoresInventario([eq({ estado: 'Bueno' }), eq({ estado: 'Regular' }), eq({ estado: 'Malo' }), eq({ estado: '' }), eq({ estado: 'Raro' }), eq({ estado: undefined })], HOY);
  assert.deepEqual([i.bueno, i.regular, i.malo, i.sinEstado], [1, 1, 1, 3]);
});
test('inventario: vida útil con la regla de la app (4 años) y fechas en el límite', () => {
  const f = (fecha) => L.indicadoresInventario([eq({ fecha })], HOY);
  assert.equal(f('2022-10-14').vidaVencida, 1, 'exactamente 4 años (con un día bisiesto en medio) ya es vencida');
  assert.equal(f('2022-10-20').vidaProxima, 1, 'un poco menos de 4 años: próxima');
  assert.equal(f('2023-10-14').vidaProxima, 1, '3 años y un día bisiesto: próxima');
  assert.equal(f('2023-10-15').vidaVigente, 1, 'un día menos de 3 años: vigente');
  assert.equal(f('2026-12-31').vidaVigente, 1, 'fecha futura: vigente');
  assert.equal(f('2010-01-01').vidaVencida, 1);
});
test('inventario: fechas vacías o inválidas van a "sin fecha" y no se mezclan', () => {
  const i = L.indicadoresInventario([eq({ fecha: '' }), eq({ fecha: null }), eq({ fecha: undefined }), eq({ fecha: 'ayer' }), eq({ fecha: '0000-00-00' }), eq({ fecha: '2026-13-40' }), eq({ fecha: '2025-10-14' })], HOY);
  assert.equal(i.sinFecha, 6); assert.equal(i.vidaVigente, 1);
  assert.equal(i.vidaVencida + i.vidaProxima + i.vidaVigente + i.sinFecha, i.activos, 'las cuatro categorías suman exactamente los activos');
});
test('inventario: porcentajes solo con ≥5 equipos activos', () => {
  const cuatro = L.indicadoresInventario([eq({}), eq({}), eq({}), eq({})], HOY);
  assert.equal(cuatro.pctBueno, null); assert.equal(cuatro.pctConResponsable, null);
  const cinco = L.indicadoresInventario([eq({}), eq({}), eq({}), eq({ estado: 'Malo' }), eq({ responsable: '' })], HOY);
  assert.equal(cinco.pctBueno, 80); assert.equal(cinco.pctConResponsable, 80);
  const conBajas = L.indicadoresInventario([eq({}), eq({}), eq({}), eq({}), eq({ estado: 'Baja' }), eq({ estado: 'Baja' })], HOY);
  assert.equal(conBajas.pctBueno, null, 'las bajas no suman a la muestra: solo hay 4 activos');
});
test('inventario: valores raros (null, objetos incompletos) no rompen el cálculo', () => {
  assert.doesNotThrow(() => L.indicadoresInventario([null, undefined, {}, { estado: 5 }, { fecha: 20200101 }], HOY));
  assert.equal(L.indicadoresInventario([null, {}], HOY).total, 2);
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

/* ===================== MESA DE AYUDA ===================== */
const H = 3600000;
const D = (d, h, m) => new Date(2026, 9, d, h || 0, m || 0).getTime();   // octubre 2026, hora local (12 = lunes)
const HORARIO = { dias: [1, 2, 3, 4, 5], inicio: '09:00', fin: '18:00' };
const cfgT = (extra) => Object.assign(L.configTicketsPorDefecto(), extra || {});
function tk(extra) {
  return Object.assign({ estado: 'nuevo', solicitanteEmail: 'sol@x.mx', responsable: null, categoria: 'sap', prioridad: 'alta', impacto: 'medio', urgencia: 'alta',
    creadoMs: D(12, 9), esperas: [] }, extra);
}
const ticketIds = (u, t, cfg, ahora) => L.accionesTicketDisponibles({ user: u, ticket: t, config: cfg, ahora }).filter((a) => a.ok).map((a) => a.id);

test('tickets: matriz de prioridad impacto × urgencia (9 combinaciones)', () => {
  const esperado = { 'alto|alta': 'critica', 'alto|media': 'alta', 'alto|baja': 'media', 'medio|alta': 'alta', 'medio|media': 'media', 'medio|baja': 'baja', 'bajo|alta': 'media', 'bajo|media': 'baja', 'bajo|baja': 'baja' };
  Object.keys(esperado).forEach((k) => { const [i, u] = k.split('|'); assert.equal(L.prioridadDe(i, u), esperado[k], k); });
  assert.equal(L.prioridadDe('x', 'alta'), null);
});
test('tickets: la configuración inicial no inventa SLA ni horario', () => {
  const c = L.configTicketsPorDefecto();
  assert.deepEqual(c.sla, {}); assert.equal(c.horario, null); assert.equal(c.categorias.length, 10);
  assert.equal(L.slaDe(c, tk()), null);
  const e = L.estadoSLA(tk(), c, D(13, 9));
  assert.equal(e.configurado, false); assert.equal(e.resolucion.estado, 'na'); assert.equal(e.respuesta.estado, 'na');
});
test('tickets: normalizarConfigTickets completa lo que falta y rechaza horario malformado', () => {
  const c = L.normalizarConfigTickets({ horario: { x: 1 }, ventanaReaperturaDias: 'a' });
  assert.equal(c.horario, null); assert.equal(c.ventanaReaperturaDias, 5); assert.equal(c.alertaPct, 25); assert.ok(c.categorias.length);
  assert.equal(L.normalizarConfigTickets(null).ventanaReaperturaDias, 5);
});
test('tickets: slug y nombre de categoría', () => {
  assert.equal(L.slugCategoria('Correo y colaboración'), 'correo-y-colaboracion');
  assert.equal(L.slugCategoria('  ¡Árbol & Ñandú! '), 'arbol-nandu');
  assert.equal(L.nombreCategoria(cfgT(), 'sap'), 'SAP'); assert.equal(L.nombreCategoria(cfgT(), 'zzz'), 'zzz');
});

test('horario: sin horario cuenta tiempo natural 24×7', () => {
  assert.equal(L.msLaborales(D(12, 9), D(13, 9), null), 24 * H);
  assert.equal(L.msLaborales(D(13, 9), D(12, 9), null), 0);
});
test('horario: solo horas de servicio, sin fines de semana', () => {
  assert.equal(L.msLaborales(D(12, 9), D(12, 18), HORARIO), 9 * H, 'un día completo');
  assert.equal(L.msLaborales(D(12, 17), D(13, 10), HORARIO), 2 * H, 'lunes 17-18 y martes 9-10');
  assert.equal(L.msLaborales(D(17, 9), D(19, 8), HORARIO), 0, 'sábado a lunes de madrugada: nada');
  assert.equal(L.msLaborales(D(17, 0), D(19, 0), HORARIO), 0, 'sábado y domingo');
  assert.equal(L.msLaborales(D(12, 0), D(19, 0), HORARIO), 5 * 9 * H, 'una semana laboral');
  assert.equal(L.msLaborales(D(12, 8), D(12, 8, 30), HORARIO), 0, 'antes de abrir');
});
test('horario: inválido o vacío no cuenta nada y horarioValido lo detecta', () => {
  assert.equal(L.horarioValido(HORARIO), true);
  assert.equal(L.horarioValido({ dias: [], inicio: '09:00', fin: '18:00' }), false);
  assert.equal(L.horarioValido({ dias: [1], inicio: '18:00', fin: '09:00' }), false);
  assert.equal(L.horarioValido(null), false);
  assert.equal(L.msLaborales(D(12, 9), D(13, 9), { dias: [], inicio: '09:00', fin: '18:00' }), 0);
});
test('SLA: las esperas se descuentan del tiempo efectivo', () => {
  const esperas = [{ desde: D(12, 10), hasta: D(12, 12), tipo: 'usuario' }];
  assert.equal(L.msEfectivos(D(12, 9), D(12, 15), esperas, HORARIO, D(12, 15)), 4 * H);
  const abierta = [{ desde: D(12, 13), hasta: null, tipo: 'tercero' }];
  assert.equal(L.msEfectivos(D(12, 9), D(12, 17), abierta, HORARIO, D(12, 17)), 4 * H, 'la espera abierta corre hasta ahora');
  const fuera = [{ desde: D(14, 9), hasta: D(14, 12) }];
  assert.equal(L.msEfectivos(D(12, 9), D(12, 15), fuera, HORARIO, D(12, 15)), 6 * H, 'una espera posterior al corte no resta');
});
test('SLA: fecha objetivo cruza la noche y el fin de semana', () => {
  const t = tk({ creadoMs: D(16, 12) });                   // viernes 16 oct 12:00
  assert.equal(new Date(D(16, 12)).getDay(), 5);
  assert.equal(L.fechaObjetivoMs(t, 8, HORARIO, D(16, 12)), D(19, 11), '6h el viernes + 2h el lunes');
  assert.equal(L.fechaObjetivoMs(tk({ creadoMs: D(12, 9) }), 4, null, D(12, 9)), D(12, 13), 'sin horario: tiempo natural');
});
test('SLA: la fecha objetivo se recorre por las esperas', () => {
  const t = tk({ creadoMs: D(12, 9), esperas: [{ desde: D(12, 10), hasta: D(12, 12), tipo: 'usuario' }] });
  assert.equal(L.fechaObjetivoMs(t, 4, HORARIO, D(12, 12)), D(12, 15));
});
const SLA = { 'sap|alta': { respuestaH: 2, resolucionH: 8 } };
test('SLA: estados en_curso, por_vencer, vencido, pausado', () => {
  const cfg = cfgT({ sla: SLA, horario: HORARIO, alertaPct: 25 });
  const t = tk();
  assert.equal(L.estadoSLA(t, cfg, D(12, 10)).resolucion.estado, 'en_curso');
  assert.equal(L.estadoSLA(t, cfg, D(12, 10)).respuesta.estado, 'en_curso');
  assert.equal(L.estadoSLA(t, cfg, D(12, 16, 30)).resolucion.estado, 'por_vencer', '1.5 h restantes de 8 h (≤25 %)');
  assert.equal(L.estadoSLA(t, cfg, D(12, 11, 30)).respuesta.estado, 'vencido');
  assert.equal(L.estadoSLA(t, cfg, D(13, 10)).resolucion.estado, 'vencido');
  const p = tk({ estado: 'espera_usuario', primeraRespuestaMs: D(12, 9, 30), esperas: [{ desde: D(12, 10), hasta: null, tipo: 'usuario' }] });
  const s = L.estadoSLA(p, cfg, D(14, 9));
  assert.equal(s.pausado, true); assert.equal(s.resolucion.estado, 'en_curso', 'en pausa no vence'); assert.equal(s.resolucion.objetivoMs, undefined);
});
test('SLA: respuesta y resolución cumplidas o incumplidas', () => {
  const cfg = cfgT({ sla: SLA, horario: HORARIO });
  const ok = tk({ estado: 'cerrado', primeraRespuestaMs: D(12, 10), resueltoMs: D(12, 16) });
  const s1 = L.estadoSLA(ok, cfg, D(20, 9)); assert.equal(s1.respuesta.estado, 'cumplido'); assert.equal(s1.resolucion.estado, 'cumplido');
  const mal = tk({ estado: 'resuelto', primeraRespuestaMs: D(12, 13), resueltoMs: D(14, 12) });
  const s2 = L.estadoSLA(mal, cfg, D(20, 9)); assert.equal(s2.respuesta.estado, 'incumplido'); assert.equal(s2.resolucion.estado, 'incumplido');
  assert.equal(L.estadoSLA(tk({ estado: 'cancelado' }), cfg, D(13, 9)).resolucion.estado, 'na');
});

test('tickets: permisos por rol', () => {
  assert.equal(L.tiene(sol, 'tickets.crear'), true); assert.equal(L.tiene(sol, 'tickets.ver_todos'), false);
  assert.equal(L.tiene(tec, 'tickets.atender'), true); assert.equal(L.tiene(tec, 'tickets.asignar'), false);
  assert.equal(L.tiene(dir, 'tickets.asignar'), true); assert.equal(L.tiene(dir, 'tickets.atender'), false, 'el director asigna pero no atiende');
  assert.equal(L.tiene(adm, 'tickets.configurar'), true); assert.equal(L.tiene(dir, 'tickets.configurar'), false);
  assert.equal(L.tiene(resp, 'tickets.ver_todos'), false);
});
test('tickets: visibilidad (solicitante solo ve los suyos)', () => {
  assert.equal(L.puedeVerTicket(sol, tk()), true);
  assert.equal(L.puedeVerTicket({ email: 'otro@x.mx', roles: ['solicitante'] }, tk()), false);
  assert.equal(L.puedeVerTicket(tec, tk()), true); assert.equal(L.puedeVerTicket(dir, tk()), true);
  assert.equal(L.esTI(sol), false); assert.equal(L.esTI(tec), true); assert.equal(L.esTI(dir), true);
});
test('tickets: flujo completo nuevo → asignado → en atención → espera → resuelto → cerrado', () => {
  let t = tk(); const cfg = cfgT();
  const paso = (u, id, datos, ahora) => { const r = L.aplicarAccionTicket({ user: u, ticket: t, config: cfg, ahora }, id, datos); t = Object.assign({}, t, r.cambios); return r; };
  assert.deepEqual(ticketIds(tec, t, cfg, D(12, 9)).sort(), ['tomar'], 'sin responsable el técnico solo puede tomarlo');
  paso(tec, 'tomar', {}, D(12, 9, 10));
  assert.equal(t.estado, 'asignado'); assert.equal(t.responsable, 'tec@x.mx');
  paso(tec, 'iniciar_atencion', {}, D(12, 9, 20));
  assert.equal(t.estado, 'en_atencion'); assert.equal(t.primeraRespuestaMs, D(12, 9, 20));
  paso(tec, 'esperar_usuario', { motivo: 'Falta captura de pantalla' }, D(12, 10));
  assert.equal(t.estado, 'espera_usuario'); assert.equal(t.esperas.length, 1); assert.equal(t.esperas[0].hasta, null);
  paso(sol, 'responder', { motivo: 'Aquí está' }, D(12, 11));
  assert.equal(t.estado, 'en_atencion'); assert.equal(t.esperas[0].hasta, D(12, 11));
  const r = paso(tec, 'resolver', { diagnostico: 'Permiso faltante', solucion: 'Se asignó el rol' }, D(12, 12));
  assert.equal(t.estado, 'resuelto'); assert.equal(t.resueltoMs, D(12, 12)); assert.equal(r.historial.accion, 'resolver');
  paso(sol, 'confirmar', {}, D(12, 13));
  assert.equal(t.estado, 'cerrado'); assert.equal(t.confirmacion.por, 'sol@x.mx');
  assert.equal(t.primeraRespuestaMs, D(12, 9, 20), 'la primera respuesta no se pisa');
});
test('tickets: acciones exigen datos obligatorios', () => {
  const cfg = cfgT();
  const en = tk({ estado: 'en_atencion', responsable: 'tec@x.mx' });
  assert.throws(() => L.aplicarAccionTicket({ user: tec, ticket: en, config: cfg }, 'resolver', { diagnostico: 'x' }), (e) => e.faltan && e.faltan.includes('solucion'));
  assert.throws(() => L.aplicarAccionTicket({ user: tec, ticket: en, config: cfg }, 'esperar_usuario', {}), /obligatorios/);
  assert.throws(() => L.aplicarAccionTicket({ user: adm, ticket: tk(), config: cfg }, 'asignar', {}), /obligatorios/);
  assert.throws(() => L.aplicarAccionTicket({ user: tec, ticket: en, config: cfg }, 'cambiar_prioridad', { impacto: 'x', urgencia: 'alta', motivo: 'm' }), /no válidos/);
});
test('tickets: solo quien tiene asignado el ticket lo atiende; el administrador siempre', () => {
  const cfg = cfgT(), otroTec = { email: 'tec2@x.mx', roles: ['tecnico'] };
  const t = tk({ estado: 'asignado', responsable: 'tec@x.mx' });
  assert.ok(ticketIds(tec, t, cfg).includes('iniciar_atencion'));
  assert.ok(!ticketIds(otroTec, t, cfg).includes('iniciar_atencion'));
  assert.ok(ticketIds(adm, t, cfg).includes('iniciar_atencion'));
  assert.throws(() => L.aplicarAccionTicket({ user: otroTec, ticket: t, config: cfg }, 'iniciar_atencion', {}), /asignado/);
});
test('tickets: asignar solo Director/Administrador; técnico no; cancelar ajeno solo Administrador', () => {
  const cfg = cfgT(), t = tk();
  assert.ok(ticketIds(dir, t, cfg).includes('asignar')); assert.ok(ticketIds(adm, t, cfg).includes('asignar'));
  assert.ok(!ticketIds(tec, t, cfg).includes('asignar'));
  assert.ok(!ticketIds(dir, t, cfg).includes('cancelar_ti')); assert.ok(ticketIds(adm, t, cfg).includes('cancelar_ti'));
  assert.ok(!ticketIds(dir, t, cfg).includes('tomar'), 'el director no atiende');
  const r = L.aplicarAccionTicket({ user: dir, ticket: t, config: cfg }, 'asignar', { responsable: 'tec@x.mx' });
  assert.equal(r.cambios.estado, 'asignado'); assert.equal(r.cambios.responsable, 'tec@x.mx');
});
test('tickets: el solicitante no ve acciones de TI ni actúa sobre tickets ajenos', () => {
  const cfg = cfgT(), t = tk({ estado: 'resuelto', resueltoMs: D(12, 12) });
  assert.deepEqual(ticketIds(sol, t, cfg, D(13, 9)).sort(), ['confirmar', 'reabrir']);
  assert.deepEqual(ticketIds({ email: 'otro@x.mx', roles: ['solicitante'] }, t, cfg, D(13, 9)), []);
  assert.deepEqual(ticketIds(sol, tk(), cfg).sort(), ['cancelar']);
});
test('tickets: reapertura dentro y fuera de la ventana configurada', () => {
  const t = tk({ estado: 'cerrado', resueltoMs: D(12, 12), cerradoMs: D(12, 13) });
  assert.ok(ticketIds(sol, t, cfgT(), D(16, 12)).includes('reabrir'), '4 días: dentro de 5');
  assert.ok(!ticketIds(sol, t, cfgT(), D(19, 12)).includes('reabrir'), '7 días: fuera');
  assert.ok(ticketIds(sol, t, cfgT({ ventanaReaperturaDias: 10 }), D(19, 12)).includes('reabrir'), 'la ventana es editable');
  const r = L.aplicarAccionTicket({ user: sol, ticket: t, config: cfgT(), ahora: D(14, 9) }, 'reabrir', { motivo: 'Sigue fallando' });
  assert.equal(r.cambios.estado, 'en_atencion'); assert.equal(r.cambios.reaperturas, 1); assert.equal(r.cambios.resueltoMs, null);
});
test('tickets: escalar suma nivel; cambiar prioridad recalcula con la matriz', () => {
  const cfg = cfgT(), t = tk({ estado: 'en_atencion', responsable: 'tec@x.mx' });
  const e = L.aplicarAccionTicket({ user: tec, ticket: t, config: cfg }, 'escalar', { responsable: 'adm@x.mx', motivo: 'Requiere SAP Basis' });
  assert.equal(e.cambios.escaladoNivel, 1); assert.equal(e.cambios.responsable, 'adm@x.mx');
  const p = L.aplicarAccionTicket({ user: tec, ticket: t, config: cfg }, 'cambiar_prioridad', { impacto: 'alto', urgencia: 'alta', motivo: 'Para toda la planta' });
  assert.equal(p.cambios.prioridad, 'critica');
});
test('tickets: validar ticket nuevo', () => {
  const cfg = cfgT();
  const ok = { titulo: 'No imprime', descripcion: 'x', tipo: 'incidente', categoria: 'impresoras', impacto: 'bajo', urgencia: 'media', evidencias: [], activoId: '' };
  assert.deepEqual(L.validarTicketNuevo(ok, cfg), {});
  const mal = L.validarTicketNuevo({ titulo: ' ', descripcion: '', tipo: 'x', categoria: 'zzz', impacto: '', urgencia: '', evidencias: [{ titulo: '', url: 'http://a' }], activoId: 'a b' }, cfg);
  ['titulo', 'descripcion', 'tipo', 'categoria', 'impacto', 'urgencia', 'ev0.titulo', 'ev0.url', 'activoId'].forEach((k) => assert.ok(mal[k], k));
  const inactiva = cfgT({ categorias: [{ id: 'sap', nombre: 'SAP', activa: false }] });
  assert.ok(L.validarTicketNuevo(Object.assign({}, ok, { categoria: 'sap' }), inactiva).categoria, 'categoría desactivada no se puede elegir');
});
test('indicadores de tickets: conteos y muestra mínima', () => {
  const cfg = cfgT({ sla: SLA, horario: null }), ahora = D(20, 9);
  const cerr = (n, horas) => tk({ estado: 'cerrado', creadoMs: D(12, 9) + n * 1000, resueltoMs: D(12, 9) + n * 1000 + horas * H });
  const pocos = L.indicadoresTickets([cerr(1, 2), cerr(2, 4), tk({ responsable: 'tec@x.mx', estado: 'asignado' })], cfg, ahora);
  assert.equal(pocos.abiertos, 1); assert.equal(pocos.resueltosEnPeriodo, 2);
  assert.equal(pocos.tiempoMedioResolucionHoras, null, 'menos de 5 resueltos: sin promedio');
  assert.equal(pocos.cumplimientoSLA, null);
  const cinco = L.indicadoresTickets([cerr(1, 2), cerr(2, 4), cerr(3, 6), cerr(4, 8), cerr(5, 10)], cfg, ahora);
  assert.equal(cinco.tiempoMedioResolucionHoras, 6);
  assert.equal(cinco.evaluablesSLA, 5); assert.equal(cinco.cumplidosSLA, 4); assert.equal(cinco.cumplimientoSLA, 80, '8 h de 8 cumple; 10 h no');
});
test('indicadores de tickets: críticos, sin asignar, vencidos, por responsable y ventana de 90 días', () => {
  const cfg = cfgT({ sla: { 'sap|critica': { resolucionH: 4 } } }), ahora = D(14, 9);
  const l = [tk({ prioridad: 'critica', creadoMs: D(12, 9) }), tk({ prioridad: 'media', responsable: 'tec@x.mx', estado: 'en_atencion', categoria: 'redes' }),
    tk({ estado: 'cancelado' }), tk({ estado: 'cerrado', resueltoMs: ahora - 100 * 86400000, creadoMs: ahora - 101 * 86400000 })];
  const i = L.indicadoresTickets(l, cfg, ahora);
  assert.equal(i.abiertos, 2); assert.equal(i.criticos, 1); assert.equal(i.sinAsignar, 1); assert.equal(i.vencidos, 1);
  assert.equal(i.porResponsable['(sin asignar)'], 1); assert.equal(i.porResponsable['tec@x.mx'], 1);
  assert.equal(i.resueltosEnPeriodo, 0, 'uno resuelto hace 100 días queda fuera de la ventana');
  assert.equal(i.slaConfigurado, true); assert.equal(L.indicadoresTickets(l, cfgT(), ahora).slaConfigurado, false);
  assert.equal(L.filtroTickets('vencidos', cfg, ahora)(l[0]), true); assert.equal(L.filtroTickets('vencidos', cfg, ahora)(l[1]), false);
  assert.equal(L.filtroTickets('nada'), null);
});

/* ===================== GERENTE Y CONSULTOR ===================== */
const ger = { email: 'ger@x.mx', roles: ['gerente'] };
const cons = { email: 'cons@x.mx', roles: ['consultor'] };
const cons2 = { email: 'cons2@x.mx', roles: ['consultor'] };
test('gerente: tiene todos los permisos del administrador y del director', () => {
  [...L.PERMISOS_POR_ROL.administrador, ...L.PERMISOS_POR_ROL.director].forEach((p) => assert.equal(L.tiene(ger, p), true, p));
  assert.equal(L.tiene(ger, 'usuarios.admin'), true); assert.equal(L.tiene(ger, 'procesos.aprobar'), true); assert.equal(L.tiene(ger, 'tickets.configurar'), true); assert.equal(L.tiene(ger, 'tickets.ver_todos'), true);
});
test('gerente: sigue sin poder aprobar lo que él mismo editó', () => {
  const p = proc({ estado: 'pendiente_aprobacion', responsable: 'ger@x.mx', creadoPor: 'ger@x.mx' });
  const v = ver({ estado: 'pendiente_aprobacion', editores: ['ger@x.mx'] });
  assert.ok(!ids({ user: ger, proceso: p, version: v }).includes('aprobar'));
  const v2 = ver({ estado: 'pendiente_aprobacion', editores: ['resp@x.mx'] });
  assert.ok(ids({ user: ger, proceso: proc({ estado: 'pendiente_aprobacion' }), version: v2 }).includes('aprobar'));
});
test('consultor: crea y edita sus procesos pero no aprueba, no administra ni ve auditoría', () => {
  assert.equal(L.tiene(cons, 'procesos.crear'), true); assert.equal(L.tiene(cons, 'procesos.editar_propios'), true);
  ['procesos.aprobar', 'procesos.publicar', 'usuarios.admin', 'auditoria.ver', 'inventario.resumen', 'tickets.ver_todos', 'tickets.configurar', 'tickets.asignar'].forEach((p) => assert.equal(L.tiene(cons, p), false, p));
});
test('consultor: solo ve tickets propios, asignados a él o nuevos sin responsable', () => {
  assert.equal(L.puedeVerTicket(cons, tk({ responsable: 'cons@x.mx', estado: 'asignado' })), true);
  assert.equal(L.puedeVerTicket(cons, tk({ solicitanteEmail: 'cons@x.mx' })), true);
  assert.equal(L.puedeVerTicket(cons, tk()), true, 'nuevo sin responsable: puede tomarlo');
  assert.equal(L.puedeVerTicket(cons, tk({ responsable: 'cons2@x.mx', estado: 'asignado' })), false);
  assert.equal(L.puedeVerTicket(cons, tk({ estado: 'en_atencion', responsable: null })), false);
  assert.equal(L.puedeVerTicket(ger, tk({ responsable: 'cons2@x.mx', estado: 'asignado' })), true);
});
test('consultor: toma y atiende lo suyo; no atiende lo de otro consultor ni asigna', () => {
  const cfg = cfgT();
  assert.ok(ticketIds(cons, tk(), cfg).includes('tomar')); assert.ok(!ticketIds(cons, tk(), cfg).includes('asignar'));
  const suyo = tk({ estado: 'asignado', responsable: 'cons@x.mx' });
  assert.ok(ticketIds(cons, suyo, cfg).includes('iniciar_atencion'));
  assert.ok(!ticketIds(cons2, suyo, cfg).includes('iniciar_atencion'));
  assert.ok(ticketIds(ger, suyo, cfg).includes('iniciar_atencion'), 'el gerente atiende cualquiera');
  assert.ok(ticketIds(ger, tk(), cfg).includes('asignar') && ticketIds(ger, tk(), cfg).includes('cancelar_ti'));
  assert.ok(!ticketIds(cons, tk(), cfg).includes('cancelar_ti'));
});

/* ===================== GESTIÓN DE CAMBIOS ===================== */
const cam = (extra) => Object.assign({ id: 'CHG-0001', titulo: 'Actualizar firmware', tipo: 'normal', descripcion: 'd', justificacion: 'j', sistema: 'Red', activoIds: 'EQ-1', impacto: 'medio', probabilidad: 'baja', riesgo: 'bajo',
  planImplementacion: 'p', planPruebas: 't', planReversa: 'r', inicioMs: D(20, 20), finMs: D(20, 23), estado: 'borrador', solicitanteEmail: 'cons@x.mx', responsableImpl: 'cons@x.mx', evidencias: [] }, extra || {});
const camIds = (u, c) => L.accionesCambioDisponibles({ user: u, cambio: c }).filter((a) => a.ok).map((a) => a.id);
test('cambios: matriz de riesgo impacto × probabilidad', () => {
  assert.equal(L.riesgoDe('alto', 'alta'), 'alto'); assert.equal(L.riesgoDe('alto', 'media'), 'alto'); assert.equal(L.riesgoDe('medio', 'media'), 'medio');
  assert.equal(L.riesgoDe('alto', 'baja'), 'medio'); assert.equal(L.riesgoDe('bajo', 'media'), 'bajo'); assert.equal(L.riesgoDe('bajo', 'baja'), 'bajo'); assert.equal(L.riesgoDe('x', 'baja'), null);
});
test('cambios: validación (borrador solo pide título; enviar exige planes, riesgo y ventana)', () => {
  assert.deepEqual(L.validarCambio({ titulo: 'x', tipo: 'normal' }, false), {});
  const e = L.validarCambio({ titulo: 'x', tipo: 'normal', inicioMs: 10, finMs: 5, activoIds: 'a b', evidencias: [{ titulo: '', url: 'http://a' }] }, true);
  ['descripcion', 'justificacion', 'sistema', 'planImplementacion', 'planPruebas', 'planReversa', 'impacto', 'probabilidad', 'finMs', 'activoIds', 'ev0.titulo', 'ev0.url'].forEach((k) => assert.ok(e[k], k));
  assert.deepEqual(L.validarCambio(cam(), true), {});
});
test('cambios: flujo completo con segregación (el solicitante no aprueba lo suyo)', () => {
  let c = cam(); const paso = (u, id, d, ahora) => { const r = L.aplicarAccionCambio({ user: u, cambio: c, ahora }, id, d); c = Object.assign({}, c, r.cambios); return r; };
  assert.ok(camIds(cons, c).includes('enviar')); assert.ok(!camIds(cons2, c).includes('enviar'));
  paso(cons, 'enviar', {}, D(15, 9)); assert.equal(c.estado, 'pendiente_aprobacion');
  assert.ok(!camIds(cons, c).includes('aprobar'), 'el consultor no aprueba'); assert.ok(camIds(ger, c).includes('aprobar'));
  paso(ger, 'aprobar', {}, D(15, 10)); assert.equal(c.aprobacion.por, 'ger@x.mx'); assert.equal(c.aprobacion.excepcion, false);
  assert.ok(camIds(cons, c).includes('iniciar')); assert.ok(!camIds(cons2, c).includes('iniciar'));
  paso(cons, 'iniciar', {}, D(20, 20)); paso(cons, 'finalizar_ok', { resultado: 'Sin incidentes' }, D(20, 22));
  assert.equal(c.estado, 'implementado'); assert.equal(c.fallo, false);
  assert.ok(!camIds(cons, c).includes('cerrar')); paso(ger, 'cerrar', { revision: 'Todo correcto' }, D(21, 9)); assert.equal(c.estado, 'cerrado');
});
test('cambios: el gerente no aprueba lo que solicitó, salvo emergencia con motivo (queda como excepción)', () => {
  const normal = cam({ estado: 'pendiente_aprobacion', solicitanteEmail: 'ger@x.mx' });
  assert.ok(!camIds(ger, normal).includes('aprobar'));
  const emerg = cam({ estado: 'pendiente_aprobacion', solicitanteEmail: 'ger@x.mx', tipo: 'emergencia' });
  assert.ok(camIds(ger, emerg).includes('aprobar'));
  assert.throws(() => L.aplicarAccionCambio({ user: ger, cambio: emerg }, 'aprobar', {}), /obligatorios/);
  assert.equal(L.aplicarAccionCambio({ user: ger, cambio: emerg }, 'aprobar', { motivo: 'Caída total' }).cambios.aprobacion.excepcion, true);
});
test('cambios: enviar un borrador incompleto falla con el detalle de campos', () => {
  assert.throws(() => L.aplicarAccionCambio({ user: cons, cambio: cam({ planReversa: '' }) }, 'enviar', {}), (e) => !!(e.detalle && e.detalle.planReversa));
});
test('cambios: rechazar y devolver exigen motivo; fallo marca revertido; cancelar según rol', () => {
  const pend = cam({ estado: 'pendiente_aprobacion' });
  assert.throws(() => L.aplicarAccionCambio({ user: ger, cambio: pend }, 'rechazar', {}), /obligatorios/);
  assert.equal(L.aplicarAccionCambio({ user: ger, cambio: pend }, 'devolver', { motivo: 'Falta plan' }).cambios.estado, 'borrador');
  const imp = cam({ estado: 'en_implementacion' });
  const f = L.aplicarAccionCambio({ user: cons, cambio: imp }, 'finalizar_fallo', { resultado: 'Se cayó', revertido: true }).cambios;
  assert.equal(f.estado, 'fallido'); assert.equal(f.revertido, true); assert.equal(f.fallo, true);
  assert.ok(camIds(cons, cam({ estado: 'pendiente_aprobacion' })).includes('cancelar')); assert.ok(!camIds(cons, cam({ estado: 'aprobado' })).includes('cancelar'));
  assert.ok(camIds(ger, cam({ estado: 'aprobado' })).includes('cancelar'));
});
test('cambios: visibilidad (consultor solo los suyos; gerente todos)', () => {
  assert.equal(L.puedeVerCambio(cons, cam()), true); assert.equal(L.puedeVerCambio(cons2, cam()), false); assert.equal(L.puedeVerCambio(ger, cam()), true);
  assert.equal(L.puedeVerCambio(cons2, cam({ responsableImpl: 'cons2@x.mx' })), true); assert.equal(L.puedeVerCambio(sol, cam()), false);
});
test('cambios: conflictos de ventana por sistema o equipo', () => {
  const otros = [cam({ id: 'A', estado: 'aprobado', inicioMs: D(20, 22), finMs: D(21, 1), sistema: 'red', activoIds: 'ZZ-9' }), cam({ id: 'B', estado: 'aprobado', inicioMs: D(20, 22), finMs: D(21, 1), sistema: 'ERP', activoIds: 'eq-1' }),
    cam({ id: 'C', estado: 'aprobado', inicioMs: D(20, 22), finMs: D(21, 1), sistema: 'ERP', activoIds: 'Q' }), cam({ id: 'D', estado: 'borrador', inicioMs: D(20, 22), finMs: D(21, 1) }), cam({ id: 'E', estado: 'aprobado', inicioMs: D(22, 9), finMs: D(22, 11) })];
  assert.deepEqual(L.conflictosCambio(cam(), otros).map((x) => x.id).sort(), ['A', 'B']);
});
test('cambios: indicadores y muestra mínima de éxito', () => {
  const ahora = D(20, 9), fin = (n, fallo) => cam({ id: 'F' + n, estado: 'implementado', resultado: 'r', fallo, finalizadoMs: ahora - 86400000 });
  const poc = L.indicadoresCambios([fin(1, false), fin(2, true), cam({ estado: 'pendiente_aprobacion' }), cam({ estado: 'aprobado', inicioMs: ahora + 86400000, finMs: ahora + 90000000 }), cam({ estado: 'aprobado', inicioMs: ahora - 5 * 86400000, finMs: ahora - 4 * 86400000 }), cam({ tipo: 'emergencia', creadoMs: ahora - 1000, estado: 'aprobado', inicioMs: ahora + 30 * 86400000, finMs: ahora + 31 * 86400000 })], ahora);
  assert.equal(poc.abiertos, 4); assert.equal(poc.pendientesAprobacion, 1); assert.equal(poc.programados7d, 1); assert.equal(poc.vencidos, 1); assert.equal(poc.emergencias, 1); assert.equal(poc.tasaExito, null);
  const cinco = L.indicadoresCambios([fin(1, false), fin(2, false), fin(3, false), fin(4, false), fin(5, true)], ahora);
  assert.equal(cinco.tasaExito, 80);
  assert.equal(L.indicadoresCambios([Object.assign(fin(9, false), { finalizadoMs: ahora - 100 * 86400000 })], ahora).finalizados, 0, 'fuera de la ventana de 90 días');
});

/* ===================== PROVEEDORES Y CONTRATOS ===================== */
const ctr = (extra) => Object.assign({ titulo: 'Soporte ERP', tipo: 'soporte', proveedorId: 'PRV-001', objeto: 'o', inicio: '2026-01-01', fin: '2026-12-31', monto: 1000, moneda: 'MXN', periodicidad: 'mensual', responsable: 'cons@x.mx', estado: 'borrador', creadoPor: 'cons@x.mx', documentos: [{ titulo: 'PDF', url: 'https://d.com/x' }] }, extra || {});
const ctrIds = (u, c) => L.accionesContratoDisponibles({ user: u, contrato: c }).filter((a) => a.ok).map((a) => a.id);
test('contratos: fechas ISO válidas y diferencia en días exacta', () => {
  assert.equal(L.fechaISOok('2026-02-28'), true); assert.equal(L.fechaISOok('2026-02-30'), false); assert.equal(L.fechaISOok('28/02/2026'), false); assert.equal(L.fechaISOok(''), false);
  assert.equal(L.diasEntreISO('2026-10-14', '2026-10-15'), 1); assert.equal(L.diasEntreISO('2026-01-01', '2026-12-31'), 364); assert.equal(L.diasEntreISO('2026-10-14', '2026-10-13'), -1);
});
test('contratos: vigencia calculada (vigente, por vencer, vencido) con ventana global editable y por contrato', () => {
  const hoy = '2026-10-14', v = (extra, cfg) => L.estadoVigencia(ctr(Object.assign({ estado: 'vigente' }, extra)), hoy, cfg);
  assert.equal(v({ fin: '2027-12-31' }).estado, 'vigente');
  assert.equal(v({ fin: '2027-01-12' }).estado, 'por_vencer', '90 días exactos');
  assert.equal(v({ fin: '2027-01-13' }).estado, 'vigente', '91 días');
  assert.equal(v({ fin: '2026-10-14' }).estado, 'por_vencer', 'vence hoy');
  assert.equal(v({ fin: '2026-10-13' }).estado, 'vencido'); assert.equal(v({ fin: '2026-10-13' }).dias, -1);
  assert.equal(v({ fin: '2027-01-13' }, { avisoVencimientoDias: 120 }).estado, 'por_vencer', 'ventana global editable');
  assert.equal(v({ fin: '2026-11-20', avisoDias: 10 }).estado, 'vigente', 'ventana propia del contrato');
  assert.equal(v({ fin: '' }).estado, 'sin_fecha');
  assert.equal(L.estadoVigencia(ctr({ estado: 'borrador' }), hoy), null);
});
test('contratos: validar proveedor y contrato', () => {
  assert.deepEqual(L.validarProveedor({ nombre: 'A', categoria: 'nube', contactos: [{ nombre: 'x', correo: 'a@b.mx' }] }), {});
  const e = L.validarProveedor({ nombre: '', categoria: 'zz', rfc: '12', sitioWeb: 'http://x', contactos: [{ nombre: '', correo: 'mal' }] });
  ['nombre', 'categoria', 'rfc', 'sitioWeb', 'ct0.nombre', 'ct0.correo'].forEach((k) => assert.ok(e[k], k));
  assert.deepEqual(L.validarContrato(ctr(), true), {});
  assert.deepEqual(L.validarContrato({ titulo: 't', tipo: 'otro', proveedorId: 'P' }, false), {});
  const m = L.validarContrato({ titulo: '', tipo: 'x', inicio: '2026-05-01', fin: '2026-01-01', monto: -1, documentos: [{ titulo: '', url: 'http://a' }], activoIds: 'a b' }, true);
  ['titulo', 'tipo', 'proveedorId', 'fin', 'monto', 'objeto', 'moneda', 'periodicidad', 'responsable', 'dc0.titulo', 'dc0.url', 'activoIds'].forEach((k) => assert.ok(m[k], k));
});
test('contratos: flujo con segregación (quien lo crea no lo aprueba)', () => {
  let c = ctr(); const paso = (u, id, d) => { const r = L.aplicarAccionContrato({ user: u, contrato: c, ahora: 5 }, id, d); c = Object.assign({}, c, r.cambios); return r; };
  assert.ok(ctrIds(cons, c).includes('enviar')); assert.ok(!ctrIds(cons2, c).includes('enviar'), 'otro consultor ni lo ve');
  paso(cons, 'enviar'); assert.equal(c.estado, 'pendiente_aprobacion');
  assert.ok(!ctrIds(cons, c).includes('aprobar')); assert.ok(ctrIds(ger, c).includes('aprobar'));
  assert.throws(() => L.aplicarAccionContrato({ user: ger, contrato: c }, 'rechazar', {}), /obligatorios/);
  paso(ger, 'aprobar'); assert.equal(c.estado, 'vigente'); assert.equal(c.aprobacion.por, 'ger@x.mx');
  assert.ok(ctrIds(ger, c).includes('terminar') && ctrIds(ger, c).includes('renovar') && ctrIds(cons, c).includes('renovar') && !ctrIds(cons, c).includes('terminar'));
  assert.throws(() => L.aplicarAccionContrato({ user: ger, contrato: c }, 'renovar', {}), /interfaz/);
  paso(ger, 'terminar', { motivo: 'Cambio de proveedor' }); assert.equal(c.estado, 'terminado');
});
test('contratos: el gerente tampoco aprueba el contrato que él creó; enviar incompleto da detalle', () => {
  assert.ok(!ctrIds(ger, ctr({ estado: 'pendiente_aprobacion', creadoPor: 'ger@x.mx' })).includes('aprobar'));
  assert.throws(() => L.aplicarAccionContrato({ user: cons, contrato: ctr({ objeto: '' }) }, 'enviar', {}), (e) => !!(e.detalle && e.detalle.objeto));
});
test('contratos: visibilidad (consultor solo lo que creó o tiene asignado)', () => {
  assert.equal(L.puedeVerContrato(cons, ctr()), true); assert.equal(L.puedeVerContrato(cons2, ctr()), false); assert.equal(L.puedeVerContrato(cons2, ctr({ responsable: 'cons2@x.mx' })), true);
  assert.equal(L.puedeVerContrato(ger, ctr()), true); assert.equal(L.puedeVerContrato(sol, ctr()), false);
  assert.equal(L.puedeVerProveedor(cons, { creadoPor: 'cons@x.mx' }), true); assert.equal(L.puedeVerProveedor(cons2, { creadoPor: 'cons@x.mx' }), false); assert.equal(L.puedeVerProveedor(ger, { creadoPor: 'cons@x.mx' }), true);
});
test('contratos: indicadores — monto anual por moneda (mensual ×12, anual ×1, único no suma)', () => {
  const hoy = '2026-10-14', l = [ctr({ estado: 'vigente', monto: 100, periodicidad: 'mensual', fin: '2026-12-01' }), ctr({ estado: 'vigente', monto: 500, periodicidad: 'anual', moneda: 'USD', fin: '2027-12-31', documentos: [] }),
    ctr({ estado: 'vigente', monto: 999, periodicidad: 'unico', fin: '2026-01-01' }), ctr({ estado: 'borrador', monto: 7777 }), ctr({ estado: 'pendiente_aprobacion' }), ctr({ estado: 'terminado', monto: 50 })];
  const i = L.indicadoresContratos(l, hoy);
  assert.equal(i.vigentes, 3); assert.equal(i.porVencer, 1); assert.equal(i.vencidos, 1); assert.equal(i.sinDocumento, 1); assert.equal(i.pendientesAprobacion, 1);
  assert.deepEqual(i.montoAnual, { MXN: 1200, USD: 500 }, 'monedas separadas, sin conversión');
  assert.equal(L.filtroContratos('vencidos', hoy)(l[2]), true); assert.equal(L.filtroContratos('nada', hoy), null);
});
