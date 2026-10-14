/* Pruebas de integración en navegador (Chromium + Playwright) de la app independiente ti/index.html, con Firebase simulado
   en memoria (tests/mock-firebase.js). Verifican interfaz y flujos, y que la app de inventario (index.html) NO se modificó.
   NO prueban las reglas de seguridad (ver reglas.test.js).
   Uso: node tests/integracion.js   (requiere playwright; variable PLAYWRIGHT_MODULE para indicar su ruta) */
'use strict';
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const RAIZ = path.resolve(__dirname, '..');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-firebase.js'), 'utf8');
const SHOTS = process.env.SHOTS;
const USERS = { 'ramaya@cafiver.com.mx': 'pw', 'aosorio@cafiver.com.mx': 'pw', 'vlopez@cafiver.com.mx': 'pw', 'soportetec@cafiver.com.mx': 'pw', 'soportetecnico@cafiver.com.mx': 'pw', 'dgomez@cafiver.com.mx': 'pw' };
const ADMIN = 'ramaya@cafiver.com.mx', DIR = 'aosorio@cafiver.com.mx', RESP = 'vlopez@cafiver.com.mx', TEC = 'soportetec@cafiver.com.mx', SOL = 'soportetecnico@cafiver.com.mx';
const URL_APP = 'file://' + path.join(RAIZ, 'ti', 'index.html');

const resultados = [];
function ok(nombre, cond, extra) { resultados.push({ nombre, ok: !!cond }); console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre + (cond ? '' : '  → ' + JSON.stringify(extra))); }

async function abrir(browser, errores, semilla) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => errores.push(e.message)); page.on('dialog', (d) => d.dismiss());
  await page.addInitScript((a) => { window.__SEED_USERS = a.u; window.__SEED_STORE = a.s || {}; window.__xss = undefined; }, { u: USERS, s: semilla || {} });
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('file:')) return route.continue();
    if (u.includes('firebase-app-compat.js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK });
    if (u.includes('gstatic.com/firebasejs')) return route.fulfill({ contentType: 'application/javascript', body: '' });
    return route.abort();
  });
  await page.goto(URL_APP);
  return {
    page,
    login: async (email) => { await page.fill('#login-email', email); await page.fill('#login-pass', 'pw'); await page.click('#login-btn'); await page.waitForSelector('#app:not(.hidden)'); await page.waitForFunction(() => window.TI && window.TI.ready, null, { timeout: 5000 }); await page.waitForFunction(() => document.querySelector('.ti-view:not(.hidden)'), null, { timeout: 5000 }); },
    logout: async () => { await page.click('#salir'); await page.waitForSelector('#login-screen:not(.hidden)'); },
    ir: async (v) => { await page.evaluate((x) => TI.ir(x), v); await page.waitForTimeout(150); },
    visible: (sel) => page.locator(sel).isVisible().catch(() => false),
    filas: () => page.locator('.ti-row').count(),
    espera: (ms) => page.waitForTimeout(ms || 150),
    toast: async () => (await page.locator('#ti-toast').textContent()) || '',
    abrirFila: async (cod) => { await page.click('.ti-row:has-text("' + cod + '")'); await page.waitForSelector('.ti-ov .modal-footer'); await page.waitForTimeout(120); },
    cerrarModal: async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(100); },
    accion: (id) => page.locator('.ti-ov [data-a=' + id + ']'),
    shot: async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, n + '.png') }); } }
  };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const errores = [];
  const A = await abrir(browser, errores), page = A.page;
  const { login, logout, ir, visible, filas, espera, toast, abrirFila, cerrarModal, accion, shot } = A;

  /* ---------- T0: la app de inventario NO se modificó ---------- */
  let hashActual = '', hashMain = '';
  try { hashActual = execSync('git hash-object index.html', { cwd: RAIZ }).toString().trim(); hashMain = execSync('git rev-parse origin/main:index.html', { cwd: RAIZ }).toString().trim(); } catch (e) { hashMain = 'no disponible'; }
  ok('T0 index.html (app de inventario) es idéntico al de la rama principal', hashActual && hashActual === hashMain, { hashActual, hashMain });
  const inv = await page.evaluate(() => ({ funcs: typeof window.loadAppData, equipos: typeof window.equipos, tnav: document.querySelectorAll('.tnav-nav-area').length }));
  ok('T0 la app nueva no carga código del inventario', inv.funcs === 'undefined' && inv.equipos === 'undefined' && inv.tnav === 0, inv);
  ok('T0 sin sesión se muestra solo el inicio de sesión', (await visible('#login-screen')) && !(await visible('#app')));

  /* ---------- T1: arranque (bootstrap) ---------- */
  await login(ADMIN);
  ok('T1 arranque: sin registro, solo aparece Administración', (await visible('#tnav-ti-admin')) && !(await visible('#tnav-ti-procesos')));
  await ir('ti-admin');
  ok('T1 panel de configuración inicial visible', await visible('#ad-boot'));
  await page.click('#ad-boot'); await page.waitForSelector('#tnav-ti-procesos:not(.hidden)', { timeout: 4000 }).catch(() => {});
  ok('T1 tras crear su registro aparece Procesos', await visible('#tnav-ti-procesos'));
  ok('T1 el menú dice "Inicio" y muestra el rol', (await page.locator('#tnav-ti-inicio').textContent()).includes('Inicio') && (await page.locator('#cur-rol').textContent()).includes('Administrador'));

  /* ---------- T1b: roles desde la interfaz ---------- */
  await ir('ti-admin'); await espera(200);
  await shot('0-admin-usuarios');
  const asignar = async (email, rol) => { await page.click('[data-ed="' + email + '"]'); await page.check('.ti-ov .u-rol[value=' + rol + ']'); await page.click('#u-ok'); await espera(250); };
  await asignar(DIR, 'director'); await asignar(RESP, 'resp_proceso'); await asignar(TEC, 'tecnico'); await asignar(SOL, 'solicitante');
  const usuarios = await page.evaluate(() => Object.keys(window.__MOCK.store).filter((k) => k.startsWith('usuarios_ti/')).length);
  ok('T1b se registraron 5 usuarios con rol', usuarios === 5, usuarios);
  await page.click('[data-ed="' + ADMIN + '"]'); await page.uncheck('.ti-ov .u-rol[value=administrador]'); await page.check('.ti-ov .u-rol[value=tecnico]'); await page.click('#u-ok'); await espera(150);
  ok('T1b no se puede dejar sin Administrador', (await page.locator('#u-e2').textContent()).includes('al menos un Administrador'));
  await cerrarModal();

  /* ---------- T2: catálogo inicial ---------- */
  await ir('ti-procesos');
  ok('T2 lista vacía con mensaje comprensible', (await page.locator('.ti-empty').first().textContent()).includes('Aún no hay procesos'));
  await page.click('#ti-cat'); await page.click('#ti-conf-ok'); await page.waitForFunction(() => document.querySelectorAll('.ti-row').length >= 21, null, { timeout: 5000 }).catch(() => {});
  ok('T2 catálogo: 21 procesos', (await filas()) === 21, await filas());
  const cat = await page.evaluate(() => { const p = Object.keys(window.__MOCK.store).filter((k) => /^ti_procesos\/PRO-\d+$/.test(k)).map((k) => window.__MOCK.store[k]); return { n: p.length, borradores: p.filter((x) => x.estado === 'borrador').length, sinResp: p.filter((x) => x.responsable === '').length, plantillas: p.filter((x) => x.esPlantilla).length, contador: window.__MOCK.store['ti_config/contadores'].procesos, pasos: Object.keys(window.__MOCK.store).filter((k) => /versiones\/1$/.test(k)).reduce((a, k) => a + window.__MOCK.store[k].contenido.pasos.length, 0) }; });
  ok('T2 todos borrador, sin responsable, marcados plantilla, sin pasos inventados', cat.borradores === 21 && cat.sinResp === 21 && cat.plantillas === 21 && cat.pasos === 0 && cat.contador === 21, cat);
  await page.click('#ti-cat'); await page.click('#ti-conf-ok').catch(() => {}); await espera(200);
  ok('T2 cargar de nuevo no duplica', (await filas()) === 21 && (await toast()).includes('ya está cargado'), await toast());
  await shot('1-lista-catalogo');
  ok('T2 KPI: 21 registrados', (await page.locator('[data-kpi=registrados] .ti-kv').textContent()) === '21');

  /* ---------- T3: crear proceso, validar y enviar a revisión ---------- */
  await page.click('#ti-nuevo'); await page.fill('#e-nombre', '<img src=x onerror="window.__xss=1"> Proceso de prueba');
  await page.selectOption('#e-cat', 'Seguridad'); await page.check('.ti-ov .ti-part[value="' + RESP + '"]');
  await page.click('#e-addpaso'); await page.click('#e-save'); await espera(150);
  ok('T3 validación: paso sin descripción ni responsable', (await page.locator('.ti-ov .ti-err:not(:empty)').count()) >= 2);
  await page.fill('#ps0descripcion', 'Registrar el hallazgo'); await page.fill('#ps0responsable', 'Responsable del proceso'); await page.click('#e-save');
  await page.waitForSelector('.ti-ov .modal-footer', { timeout: 3000 }).catch(() => {}); await espera(200);
  const nombreRender = await page.locator('.ti-ov .modal-hd h3').textContent();
  ok('T3 el proceso nuevo se creó como PRO-022 en borrador', nombreRender.includes('PRO-022'), nombreRender);
  ok('T3 seguridad XSS: el nombre se muestra como texto y no ejecuta código', (await page.evaluate(() => window.__xss)) === undefined && nombreRender.includes('<img'), nombreRender);
  await shot('2-detalle-borrador');
  ok('T3 aparece "Enviar a revisión" para el editor', await accion('enviar_revision').count() === 1);
  await accion('enviar_revision').click(); await espera(250);
  await shot('3-editor-errores');
  ok('T3 borrador incompleto: no se envía y se abre el editor con errores', (await visible('#e-obj')) && (await page.locator('.ti-ov [data-e=objetivo]').textContent()).length > 0);
  await page.fill('#e-obj', 'Gestionar la seguridad de los activos.'); await page.fill('#e-alc', 'Activos de TI.'); await page.click('#e-save'); await espera(250);
  await cerrarModal(); await abrirFila('PRO-022');
  await accion('enviar_revision').click(); await espera(250);
  ok('T3 enviado a revisión', (await page.locator('.ti-ov .modal-hd .ti-e').first().textContent()).includes('En revisión'));
  await accion('solicitar_aprobacion').click(); await espera(250);
  ok('T3 pendiente de aprobación', (await page.locator('.ti-ov .modal-hd .ti-e').first().textContent()).includes('Pendiente'));
  const apr = accion('aprobar');
  ok('T3 quien arrancó la plataforma (Admin + Director) NO aprueba lo que él mismo editó', (await apr.getAttribute('aria-disabled')) === 'true');
  await apr.click({ force: true }); ok('T3 explica el motivo (separación de funciones)', (await page.locator('#ti-st').textContent()).includes('Segregación'));
  await cerrarModal();

  /* ---------- T5: el Director aprueba y publica ---------- */
  await logout(); await login(DIR);
  ok('T5 director ve Procesos y Administración (auditoría)', (await visible('#tnav-ti-procesos')) && (await visible('#tnav-ti-admin')));
  await ir('ti-procesos'); await abrirFila('PRO-022');
  await accion('aprobar').click(); await espera(300);
  ok('T5 aprobado', (await page.locator('.ti-ov .modal-hd .ti-e').first().textContent()).includes('Aprobado'));
  await accion('publicar').click(); await espera(300);
  ok('T5 publicado', (await page.locator('.ti-ov .modal-hd .ti-e').first().textContent()).includes('Publicado'));
  const pub = await page.evaluate(() => ({ p: window.__MOCK.store['ti_procesos/PRO-022'], v: window.__MOCK.store['ti_procesos/PRO-022/versiones/1'] }));
  ok('T5 se registró la aprobación, la vigencia, la próxima revisión y el indicador "documentado"', pub.v.aprobacion && pub.v.aprobacion.por === DIR && pub.p.versionPublicada === 1 && /^\d{4}-\d{2}-\d{2}$/.test(pub.p.proximaRevision) && pub.p.documentado === true, pub);
  await shot('4-detalle-publicado');
  await page.click('.ti-ov .ti-tabs [data-t=historial]'); await espera(250);
  ok('T5 historial con eventos de quién hizo cada acción', (await page.locator('.ti-ov .ti-tl > div').count()) >= 4);
  await cerrarModal();
  ok('T5 KPI publicados = 1 y documentados = 5% (1 de 22; hay ≥5 procesos)', (await page.locator('[data-kpi=publicados] .ti-kv').textContent()) === '1' && (await page.locator('[data-kpi=documentados] .ti-kv').textContent()) === '5%', await page.locator('[data-kpi=documentados] .ti-kv').textContent());
  await page.click('[data-kpi=publicados]'); ok('T5 clic en tarjeta filtra los registros que la componen', (await filas()) === 1);
  await page.click('#ti-lim');

  /* ---------- T6: versionado ---------- */
  await logout(); await login(ADMIN);
  await ir('ti-procesos'); await abrirFila('PRO-022');
  await accion('nueva_version').click(); await espera(300);
  const vv = await page.evaluate(() => ({ v1: window.__MOCK.store['ti_procesos/PRO-022/versiones/1'], v2: window.__MOCK.store['ti_procesos/PRO-022/versiones/2'], p: window.__MOCK.store['ti_procesos/PRO-022'] }));
  ok('T6 la v1 publicada se conserva intacta', vv.v1.estado === 'publicado' && vv.p.versionPublicada === 1);
  ok('T6 se creó v2 en borrador copiando el contenido', vv.v2 && vv.v2.estado === 'borrador' && vv.v2.contenido.objetivo === vv.v1.contenido.objetivo && vv.p.versionTrabajo === 2 && vv.p.estado === 'borrador');
  await page.click('.ti-ov .ti-tabs [data-t=versiones]'); await espera(100);
  ok('T6 pestaña de versiones lista v1 y v2', (await page.locator('.ti-ov .ti-table tbody tr').count()) === 2);
  await cerrarModal();
  ok('T6 la lista muestra "v2 (vigente v1)"', (await page.locator('.ti-row:has-text("PRO-022")').textContent()).includes('vigente v1'));

  /* ---------- T7: técnico ---------- */
  await logout(); await login(TEC);
  await ir('ti-procesos');
  ok('T7 técnico: ve solo procedimientos publicados', (await filas()) === 1 && (await page.locator('.ti-row').textContent()).includes('PRO-022'));
  ok('T7 técnico: sin indicadores ni botón "Nuevo proceso" ni catálogo', !(await visible('.ti-kpis')) && !(await visible('#ti-nuevo')) && !(await visible('#ti-cat')));
  ok('T7 técnico: Administración oculta', !(await visible('#tnav-ti-admin')));
  await abrirFila('PRO-022');
  ok('T7 técnico: ve la versión publicada, sin pestaña de historial y sin acciones', (await page.locator('.ti-ov .modal-hd .ti-e').first().textContent()).includes('Publicado') && (await page.locator('.ti-ov [data-t=historial]').count()) === 0 && (await page.locator('.ti-ov [data-a]').count()) === 0);
  await cerrarModal();

  /* ---------- T8: solicitante ---------- */
  await logout(); await login(SOL);
  ok('T8 solicitante: no ve módulos nuevos', !(await visible('#tnav-ti-procesos')) && !(await visible('#tnav-ti-admin')));
  await ir('ti-procesos');
  ok('T8 solicitante: acceso directo bloqueado y vuelve al inicio', (await toast()).includes('No tienes permiso') && (await visible('#view-ti-inicio')));

  /* ---------- T9: el inventario es un acceso aparte (no se carga dentro de la app nueva) ---------- */
  const enlace = await page.evaluate(() => { const a = document.getElementById('tnav-ti-inv'); return { href: a.getAttribute('href'), target: a.target, rel: a.rel, tag: a.tagName }; });
  ok('T9 "Inventario de equipos" abre la app existente en otra pestaña, sin cargarla aquí', enlace.href === '../index.html' && enlace.target === '_blank' && /noopener/.test(enlace.rel) && enlace.tag === 'A', enlace);
  ok('T9 la pantalla de inicio también ofrece el acceso al inventario', (await page.locator('.ti-mod:has-text("Inventario de equipos") a[href="../index.html"]').count()) === 1);

  /* ---------- T10: auditoría ---------- */
  await logout(); await login(DIR); await ir('ti-admin'); await page.click('[data-t=auditoria]'); await espera(300);
  await shot('6-auditoria');
  const aud = await page.evaluate(() => { const a = Object.keys(window.__MOCK.store).filter((k) => k.startsWith('ti_auditoria/')).map((k) => window.__MOCK.store[k]); return { n: a.length, acciones: [...new Set(a.map((x) => x.accion))], sinSecretos: a.every((x) => !/pass|token|secret|clave/i.test(JSON.stringify(x))), conUsuario: a.every((x) => x.usuario && x.fecha) }; });
  ok('T10 auditoría registra arranque, roles, catálogo, creación, edición, aprobación y publicación', ['arranque_plataforma', 'cambio_roles', 'cargar_catalogo', 'crear_proceso', 'editar_procedimiento', 'aprobar', 'publicar', 'nueva_version'].every((x) => aud.acciones.includes(x)), aud.acciones);
  ok('T10 cada evento tiene usuario y fecha, y no contiene secretos', aud.conUsuario && aud.sinSecretos);
  ok('T10 la tabla de auditoría muestra eventos', (await page.locator('.ti-table tbody tr').count()) >= 10);

  /* ---------- T11: cierre de sesión ---------- */
  await logout();
  ok('T11 al cerrar sesión no queda contenido de la sesión anterior ni ventanas abiertas', (await page.locator('.ti-ov').count()) === 0 && (await page.locator('#view-ti-procesos').innerHTML()) === '' && (await visible('#login-screen')));
  await page.close();

  /* ---------- T12: arranque con el equipo inicial en una base limpia ---------- */
  const B = await abrir(browser, errores), p2 = B.page;
  await B.login(ADMIN); await B.ir('ti-admin'); await p2.click('#ad-boot'); await p2.waitForTimeout(400);
  await B.ir('ti-admin'); await p2.waitForTimeout(300);
  const ur = () => p2.evaluate(() => { const o = {}; Object.keys(window.__MOCK.store).filter((k) => k.startsWith('usuarios_ti/')).forEach((k) => { o[k.slice(12)] = window.__MOCK.store[k].roles.join('+'); }); return o; });
  const r0 = await ur();
  ok('T12 el arranque crea a ramaya como Administrador y Director', r0[ADMIN] === 'administrador+director', r0);
  ok('T12 aparece el botón del equipo inicial con 4 pendientes', (await p2.locator('#ad-equipo').textContent()).includes('(4)'));
  await p2.click('#ad-equipo'); await p2.click('#ti-conf-ok'); await p2.waitForTimeout(500);
  const r1 = await ur();
  ok('T12 se crean los 4 registros como Responsable de proceso', ['vlopez', 'aosorio', 'soportetecnico', 'dgomez'].every((n) => r1[n + '@cafiver.com.mx'] === 'resp_proceso') && Object.keys(r1).length === 5, r1);
  ok('T12 el botón desaparece cuando ya no hay pendientes', (await p2.locator('#ad-equipo').count()) === 0);
  ok('T12 soportetec@ (Daniela) no recibe rol: es otra persona', !('soportetec@cafiver.com.mx' in r1));
  await B.logout(); await B.login('dgomez@cafiver.com.mx');
  ok('T12 dgomez (Responsable) ve Procesos y no Administración', (await B.visible('#tnav-ti-procesos')) && !(await B.visible('#tnav-ti-admin')));
  await B.ir('ti-procesos');
  ok('T12 dgomez puede crear procesos pero no cargar el catálogo', (await B.visible('#ti-nuevo')) && (await p2.locator('#ti-cat').count()) === 0);
  await B.logout(); await B.login(TEC);
  ok('T12 una cuenta sin registro en la plataforma no ve módulos nuevos pero sí el acceso al inventario', !(await B.visible('#tnav-ti-procesos')) && !(await B.visible('#tnav-ti-admin')) && (await B.visible('#tnav-ti-inv')));
  ok('T12 la cuenta sin registro ve un aviso claro en Inicio', (await p2.locator('#view-ti-inicio').textContent()).includes('aún no tiene un rol'));
  await B.logout(); await p2.close();

  /* ---------- T13: menú y marca ---------- */
  const C = await abrir(browser, errores), p3 = C.page;
  await C.login(ADMIN);
  ok('T13 la pestaña y el menú dicen CAFIVER TI (no "InventarioTech")', (await p3.title()).includes('CAFIVER TI') && (await p3.locator('.marca b').textContent()) === 'CAFIVER TI');
  await p3.evaluate(() => TI.ir('ti-admin')); await p3.click('#ad-boot'); await p3.waitForTimeout(400);
  const orden = await p3.evaluate(() => [...document.querySelectorAll('#side nav > *')].filter((e) => !e.classList.contains('hidden')).map((e) => e.id));
  ok('T13 orden del menú: Inicio, Procesos, Inventario de equipos, Administración', JSON.stringify(orden) === JSON.stringify(['tnav-ti-inicio', 'tnav-ti-procesos', 'tnav-ti-inv', 'tnav-ti-admin']), orden);
  await C.ir('ti-inicio'); await C.shot('7-inicio');
  ok('T13 Inicio muestra las tarjetas de los 3 módulos disponibles', (await p3.locator('.ti-mod').count()) === 3);
  ok('T13 Inicio no muestra módulos que no existen (mesa de ayuda, cambios, proyectos…) como tarjetas', (await p3.locator('.ti-mod:has-text("Mesa de ayuda")').count()) === 0);
  await C.ir('ti-procesos'); await C.shot('8-menu-procesos');
  await p3.setViewportSize({ width: 420, height: 800 });
  await p3.waitForTimeout(450);
  ok('T13 en pantalla angosta el menú lateral queda fuera de la vista', await p3.evaluate(() => document.getElementById('side').getBoundingClientRect().right <= 0));
  await p3.click('#burger');
  ok('T13 el botón de menú lo abre (aria-expanded)', (await p3.getAttribute('#burger', 'aria-expanded')) === 'true' && await p3.evaluate(() => document.body.classList.contains('menu-abierto')));
  await p3.close();

  /* ---------- T14: dashboard de Inicio con datos sembrados de cifras conocidas ---------- */
  const hoy = new Date(); const iso = (anios, dias) => { const d = new Date(Date.UTC(hoy.getUTCFullYear() - anios, hoy.getUTCMonth(), hoy.getUTCDate())); d.setUTCDate(d.getUTCDate() + (dias || 0)); return d.toISOString().slice(0, 10); };
  const sumarDias = (n) => { const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const semilla = {};
  const usr = (e, roles) => { semilla['usuarios_ti/' + e] = { email: e, nombre: e.split('@')[0], roles, activo: true }; };
  usr(ADMIN, ['administrador', 'director']); usr(DIR, ['director']); usr(RESP, ['resp_proceso']); usr(TEC, ['tecnico']); usr(SOL, ['solicitante']);
  const contenido = { objetivo: 'o', alcance: 'a', descripcion: '', entradas: [], resultadosEsperados: [], sistemas: [], riesgos: [], controles: [], evidencias: [], indicadores: [], tiempoObjetivo: '', documentosRelacionados: [], pasos: [{ descripcion: 'd', responsable: 'r' }] };
  const proc = (n, o) => { const id = 'PRO-00' + n; semilla['ti_procesos/' + id] = Object.assign({ codigo: id, nombre: 'Proceso ' + n, categoria: 'Servicio', responsable: RESP, creadoPor: RESP, participantes: [], periodoRevisionMeses: 12, estado: 'borrador', versionTrabajo: 1, versionPublicada: null, proximaRevision: null, documentado: false, esPlantilla: false }, o);
    semilla['ti_procesos/' + id + '/versiones/1'] = { numero: 1, estado: o.estado || 'borrador', contenido, editores: [RESP], creadoPor: RESP, aprobacion: null }; };
  proc(1, { estado: 'publicado', versionPublicada: 1, proximaRevision: sumarDias(-20), documentado: true });
  proc(2, { estado: 'pendiente_aprobacion' }); proc(3, { estado: 'borrador' }); proc(4, { estado: 'en_revision' });
  proc(5, { estado: 'publicado', versionPublicada: 1, proximaRevision: sumarDias(10), participantes: ['x@x.mx'] });
  proc(6, { estado: 'borrador', responsable: 'otro@x.mx', creadoPor: 'otro@x.mx' });
  proc(7, { estado: 'publicado', versionPublicada: 1, proximaRevision: sumarDias(200), participantes: ['x@x.mx'], documentado: true });
  const equipo = (n, e) => { semilla['equipos/EQ' + n] = Object.assign({ id: 'EQ' + n, area: 'TI', marca: 'M', modelo: 'X' }, e); };
  [1, 2, 3].forEach((n) => equipo(n, { estado: 'Baja', responsable: '', fecha: '' }));
  equipo(4, { estado: 'Bueno', responsable: 'Ana', fecha: iso(5) });        // vida vencida
  equipo(5, { estado: 'Bueno', responsable: 'Ben', fecha: iso(4, -2) });    // vida vencida
  equipo(6, { estado: 'Bueno', responsable: 'Cai', fecha: iso(3, -30) });   // próxima
  equipo(7, { estado: 'Bueno', responsable: '', fecha: iso(3, -10) });      // próxima, sin responsable
  equipo(8, { estado: 'Bueno', responsable: 'Eli', fecha: iso(1) });        // vigente
  equipo(9, { estado: 'Regular', responsable: 'Fer', fecha: iso(0, -180) });// vigente
  equipo(10, { estado: 'Regular', responsable: '', fecha: '' });            // sin fecha, sin responsable
  equipo(11, { estado: 'Malo', responsable: 'Hal', fecha: 'no-es-fecha' }); // sin fecha
  equipo(12, { estado: '', responsable: '   ', fecha: iso(2) });            // sin estado, sin responsable, vigente
  const D = await abrir(browser, errores, semilla), pd = D.page;
  const val = async (t) => (await pd.locator('.ti-kpi:has(.ti-kl:text-is("' + t + '")) .ti-kv').first().textContent()).trim();
  await D.login(ADMIN); await pd.waitForSelector('.ti-kpi', { timeout: 5000 }); await D.espera(300);
  await D.shot('9-dashboard-admin');
  const v = { reg: await val('Equipos registrados'), act: await val('Equipos activos'), resp: await val('Con responsable'), bueno: await val('En buen estado'), venc: await val('Vida útil vencida (≥ 4 años)'), prox: await val('Vida útil próxima (3–4 años)'), sinf: await val('Sin fecha de compra') };
  ok('T14 inventario: 12 registrados, 9 activos (3 bajas)', v.reg === '12' && v.act === '9', v);
  ok('T14 inventario: 67% con responsable (6 de 9) y 56% en buen estado (5 de 9)', v.resp === '67%' && v.bueno === '56%', v);
  ok('T14 inventario: vida útil 2 vencidas, 2 próximas y 2 sin fecha', v.venc === '2' && v.prox === '2' && v.sinf === '2', v);
  ok('T14 inventario: muestra de cuántos sin responsable y estado físico', (await pd.locator('.ti-kpi:has-text("Con responsable")').textContent()).includes('3 sin responsable') && (await pd.locator('.ti-kpi:has-text("En buen estado")').textContent()).includes('Regular 2 · Malo 1 · Sin estado 1'));
  ok('T14 garantías y reparaciones aparecen como "No disponible" con explicación', (await pd.locator('.ti-nd').count()) === 2 && (await pd.locator('.ti-nd:has-text("Garantías") .ti-kd').textContent()).includes('texto libre') && (await pd.locator('.ti-nd:has-text("reparación") .ti-kd').textContent()).includes('terminadas'));
  const proc7 = { reg: await val('Procesos registrados'), doc: await val('Documentados'), pen: await val('Pendientes de aprobación'), ven: await val('Revisión vencida'), prox: await val('Revisión en 30 días'), pub: await val('Publicados vigentes'), rev: await val('En revisión'), sin: await val('Dependen de una persona') };
  ok('T14 procesos: 7 registrados y 29% documentados (2 de 7)', proc7.reg === '7' && proc7.doc === '29%', proc7);
  ok('T14 procesos: 1 pendiente, 1 vencida, 1 próxima, 3 publicados, 1 en revisión y 5 dependen de una persona', proc7.pen === '1' && proc7.ven === '1' && proc7.prox === '1' && proc7.pub === '3' && proc7.rev === '1' && proc7.sin === '5', proc7);
  const atn = await pd.locator('.ti-atn-b').allTextContents();
  ok('T14 requiere atención (Administrador+Director): PRO-002 pendiente y PRO-001 vencida', atn.length === 2 && atn.some((t) => t.includes('PRO-002') && t.includes('Espera tu decisión')) && atn.some((t) => t.includes('PRO-001') && t.includes('Revisión vencida')), atn);
  ok('T14 los semáforos siempre llevan texto (no solo color)', (await pd.evaluate(() => [...document.querySelectorAll('.ti-sem')].every((e) => e.textContent.trim().length > 2))));
  const lec1 = await pd.evaluate(() => window.__MOCK.lecturas['equipos']);
  ok('T14 costo: una sola lectura del inventario (12 documentos) al abrir Inicio', lec1 === 12, lec1);
  ok('T14 muestra la antigüedad de los datos', (await pd.locator('#inv-edad').textContent()).includes('Datos de hace') && (await pd.locator('#inv-edad').textContent()).includes('12 equipos'));
  await D.ir('ti-procesos'); await D.ir('ti-inicio'); await D.espera(250);
  ok('T14 caché: volver a Inicio no vuelve a leer el inventario', (await pd.evaluate(() => window.__MOCK.lecturas['equipos'])) === 12);
  await pd.click('#inv-act'); await D.espera(300);
  ok('T14 "Actualizar" vuelve a leer (24 lecturas acumuladas)', (await pd.evaluate(() => window.__MOCK.lecturas['equipos'])) === 24);
  await pd.evaluate(() => { const r = Date.now; Date.now = () => r() + 11 * 60 * 1000; }); await D.ir('ti-procesos'); await D.ir('ti-inicio'); await D.espera(300);
  ok('T14 caché: pasados 10 minutos se vuelve a leer solo (36 lecturas)', (await pd.evaluate(() => window.__MOCK.lecturas['equipos'])) === 36, await pd.evaluate(() => window.__MOCK.lecturas['equipos']));
  // error de permisos del inventario no rompe lo demás
  await pd.evaluate(() => { window.__MOCK.failRead = (p) => (p === 'equipos' ? Object.assign(new Error('x'), { code: 'permission-denied' }) : null); });
  await pd.click('#inv-act'); await D.espera(300);
  ok('T14 error de permisos en el inventario: mensaje claro y los indicadores de procesos siguen', (await pd.locator('#view-ti-inicio').textContent()).includes('sin permiso') && (await val('Procesos registrados')) === '7');
  await pd.evaluate(() => { window.__MOCK.failRead = null; }); await pd.click('#inv-act'); await D.espera(300);
  ok('T14 se recupera al volver el permiso', (await val('Equipos registrados')) === '12');
  // navegación desde las tarjetas
  await pd.click('.ti-kpi[data-nav=revisionVencida]'); await D.espera(250);
  ok('T14 clic en "Revisión vencida" abre Procesos filtrado con exactamente ese registro', (await pd.locator('.ti-kpi.on[data-kpi=revisionVencida]').count()) === 1 && (await D.filas()) === 1 && (await pd.locator('.ti-row').textContent()).includes('PRO-001'));
  await D.ir('ti-inicio'); await D.espera(250); await pd.click('.ti-atn-b:has-text("PRO-002")'); await pd.waitForSelector('.ti-ov .modal-footer', { timeout: 4000 }).catch(() => {});
  ok('T14 clic en un elemento de "Requiere atención" abre ese proceso', (await pd.locator('.ti-ov .modal-hd h3').first().textContent()).includes('PRO-002'));
  await D.cerrarModal();
  const contraste = await pd.evaluate(() => { function lum(c) { const a = c.map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * a[0] + .7152 * a[1] + .0722 * a[2]; } function pc(c) { const m = c.match(/[\d.]+/g).map(Number); return { rgb: m.slice(0, 3), a: m[3] === undefined ? 1 : m[3] }; } function bg(el) { while (el) { const c = pc(getComputedStyle(el).backgroundColor); if (c.a > .9) return c.rgb; el = el.parentElement; } return [255, 255, 255]; } const out = {}; document.querySelectorAll('#view-ti-inicio *').forEach((el) => { if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return; const r = el.getBoundingClientRect(); if (!r.width) return; const cs = getComputedStyle(el); const L1 = lum(pc(cs.color).rgb), L2 = lum(bg(el)); const cr = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05); if (cr < 4.5) out[el.textContent.trim().slice(0, 30) + ' (' + cr.toFixed(2) + ')'] = 1; }); return Object.keys(out); });
  await D.ir('ti-inicio'); await D.espera(250);
  ok('T14 contraste de texto ≥ 4.5:1 en el dashboard', contraste.length === 0, contraste);
  await pd.focus('.ti-kpi[data-nav=publicados]'); await pd.keyboard.press('Enter'); await D.espera(250);
  ok('T14 teclado: Enter en una tarjeta abre Procesos filtrado', (await pd.locator('.ti-kpi.on[data-kpi=publicados]').count()) === 1);
  await D.logout();
  // Director: ve inventario y atención; Responsable: solo lo suyo y sin inventario; Técnico y solicitante: solo accesos
  await D.login(DIR); await D.espera(300);
  ok('T14 Director: ve inventario y 2 elementos de atención (PRO-002 y PRO-001)', (await pd.locator('#s-inv').count()) === 1 && (await pd.locator('.ti-atn-b').count()) === 2, (await pd.locator('#view-ti-inicio').textContent()).slice(0, 300));
  const lecAntes = await pd.evaluate(() => window.__MOCK.lecturas['equipos']);
  await D.logout(); await D.login(RESP); await D.espera(300);
  const atnR = await pd.locator('.ti-atn-b').allTextContents();
  ok('T14 Responsable: no ve el inventario y su atención son sus 3 procesos (PRO-001 vencida, PRO-003 borrador, PRO-004 en revisión)', (await pd.locator('#s-inv').count()) === 0 && atnR.length === 3 && atnR.some((t) => t.includes('PRO-003') && t.includes('Borrador')) && atnR.some((t) => t.includes('PRO-004')) && atnR.some((t) => t.includes('PRO-001')) && !atnR.some((t) => t.includes('PRO-006')), (await pd.locator('#view-ti-inicio').textContent()).slice(0, 300));
  ok('T14 Responsable: no se lee el inventario (ninguna lectura extra)', (await pd.evaluate(() => window.__MOCK.lecturas['equipos'])) === lecAntes, { lecAntes });
  await D.logout(); await D.login(TEC); await D.espera(300);
  ok('T14 Técnico: sin indicadores ni atención ni inventario; solo accesos', (await pd.locator('#s-inv').count()) === 0 && (await pd.locator('.ti-kpis').count()) === 0 && (await pd.locator('.ti-atn-b').count()) === 0 && (await pd.locator('#s-acc').count()) === 1, (await pd.locator('#view-ti-inicio').textContent()).slice(0, 300));
  await D.logout(); await D.login(SOL); await D.espera(300);
  ok('T14 Solicitante: solo accesos (inventario aparte), sin datos de procesos ni inventario', (await pd.locator('#s-inv').count()) === 0 && (await pd.locator('.ti-kpis').count()) === 0 && (await pd.locator('.ti-mod').count()) === 1);
  await D.logout(); await pd.close();

  /* ---------- T15: estados vacíos ---------- */
  const semilla2 = {}; semilla2['usuarios_ti/' + ADMIN] = { email: ADMIN, nombre: 'Admin', roles: ['administrador', 'director'], activo: true };
  const E = await abrir(browser, errores, semilla2), pe = E.page;
  await E.login(ADMIN); await E.espera(400);
  const txt = await pe.locator('#view-ti-inicio').textContent();
  ok('T15 sin procesos ni equipos: mensajes de estado vacío comprensibles y sin cifras inventadas', txt.includes('Aún no hay procesos registrados') && txt.includes('Aún no hay equipos registrados') && txt.includes('Nada pendiente') && (await pe.locator('.ti-kpi').count()) === 0, txt.slice(0, 200));
  ok('T15 el aviso dice que no hay metas ni tendencias', txt.includes('no existe un histórico'));
  await pe.close();

  ok('Sin errores de JavaScript en toda la sesión', errores.length === 0, errores.slice(0, 5));
  await browser.close();
  const fallas = resultados.filter((r) => !r.ok);
  console.log('\nResumen: ' + (resultados.length - fallas.length) + '/' + resultados.length + ' pruebas correctas');
  process.exit(fallas.length ? 1 : 0);
})().catch((e) => { console.error('Error en las pruebas:', e); process.exit(2); });
