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
  ok('T1 el menú dice "Inicio" y muestra el rol', (await page.locator('#tnav-ti-inicio').textContent()).includes('Inicio') && (await page.locator('#cur-rol').textContent()).includes('Gerente de TI'));

  /* ---------- T1b: roles desde la interfaz ---------- */
  await ir('ti-admin'); await espera(200);
  await shot('0-admin-usuarios');
  const asignar = async (email, rol) => { await page.click('[data-ed="' + email + '"]'); await page.check('.ti-ov .u-rol[value=' + rol + ']'); await page.click('#u-ok'); await espera(250); };
  await asignar(DIR, 'director'); await asignar(RESP, 'resp_proceso'); await asignar(TEC, 'tecnico'); await asignar(SOL, 'solicitante');
  const usuarios = await page.evaluate(() => Object.keys(window.__MOCK.store).filter((k) => k.startsWith('usuarios_ti/')).length);
  ok('T1b se registraron 5 usuarios con rol', usuarios === 5, usuarios);
  await page.click('[data-ed="' + ADMIN + '"]'); await page.uncheck('.ti-ov .u-rol[value=gerente]'); await page.check('.ti-ov .u-rol[value=tecnico]'); await page.click('#u-ok'); await espera(150);
  ok('T1b no se puede dejar sin Gerente o Administrador', (await page.locator('#u-e2').textContent()).includes('al menos un Gerente'));
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
  ok('T12 el arranque crea a ramaya como Gerente de TI', r0[ADMIN] === 'gerente', r0);
  ok('T12 aparece el botón del equipo inicial con 4 pendientes', (await p2.locator('#ad-equipo').textContent()).includes('(4)'));
  await p2.click('#ad-equipo'); await p2.click('#ti-conf-ok'); await p2.waitForTimeout(500);
  const r1 = await ur();
  ok('T12 se crean los 4 registros como Consultor de TI', ['vlopez', 'aosorio', 'soportetecnico', 'dgomez'].every((n) => r1[n + '@cafiver.com.mx'] === 'consultor') && Object.keys(r1).length === 5, r1);
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
  ok('T13 orden del menú: Inicio, Procesos, Mesa de ayuda, Gestión de cambios, Proveedores y contratos, Proyectos, Inventario de equipos, Administración', JSON.stringify(orden) === JSON.stringify(['tnav-ti-inicio', 'tnav-ti-procesos', 'tnav-ti-tickets', 'tnav-ti-cambios', 'tnav-ti-proveedores', 'tnav-ti-proy', 'tnav-ti-inv', 'tnav-ti-admin']), orden);
  await C.ir('ti-inicio'); await C.shot('7-inicio');
  ok('T13 Inicio muestra las tarjetas de los 7 módulos disponibles', (await p3.locator('.ti-mod').count()) === 7);
  ok('T13 Inicio no muestra módulos que no existen (contratos, respaldos) como tarjetas', (await p3.locator('.ti-mod h2').allTextContents()).filter((t) => /respaldos|inteligencia|sap/i.test(t)).length === 0);
  ok('T13 Proyectos es un enlace a GanttTracker en otra pestaña (sin tocar su código)', (await p3.getAttribute('#tnav-ti-proy', 'href')) === 'https://nubecafiver.github.io/gantttracker/' && (await p3.getAttribute('#tnav-ti-proy', 'target')) === '_blank' && (await p3.getAttribute('#tnav-ti-proy', 'rel')).includes('noopener'));
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
  usr(ADMIN, ['gerente']); usr(DIR, ['director']); usr(RESP, ['resp_proceso']); usr(TEC, ['tecnico']); usr(SOL, ['solicitante']);
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
  const lecEq = () => pd.evaluate(() => window.__MOCK.lecturas['equipos'] || 0);
  await D.login(ADMIN); await pd.waitForSelector('.ti-kpi', { timeout: 5000 }); await D.espera(300);
  ok('T14 costo: al abrir Inicio NO se lee el inventario (0 lecturas de equipos)', (await lecEq()) === 0, await lecEq());
  ok('T14 sin resumen guardado: mensaje claro y botón para calcularlo', (await pd.locator('#view-ti-inicio').textContent()).includes('Todavía no se ha calculado') && (await pd.locator('#inv-act').count()) === 1);
  await D.visible('#inv-act'); await pd.click('#inv-act'); await pd.waitForSelector('#ti-conf-ok');
  ok('T14 pide confirmación explicando el costo (una lectura por equipo)', (await pd.locator('.ti-ov').textContent()).includes('una lectura por equipo'));
  await pd.click('#ti-conf-no'); await D.espera(150);
  ok('T14 cancelar la confirmación no lee nada', (await lecEq()) === 0);
  await pd.click('#inv-act'); await pd.click('#ti-conf-ok'); await pd.waitForSelector('.ti-kpi:has-text("Equipos registrados")', { timeout: 5000 }); await D.espera(300);
  ok('T14 al confirmar se leen los 12 equipos una sola vez', (await lecEq()) === 12, await lecEq());
  await D.shot('9-dashboard-admin');
  const v = { reg: await val('Equipos registrados'), act: await val('Equipos activos'), resp: await val('Con responsable'), bueno: await val('En buen estado'), venc: await val('Vida útil vencida (≥ 4 años)'), prox: await val('Vida útil próxima (3–4 años)'), sinf: await val('Sin fecha de compra') };
  ok('T14 inventario: 12 registrados, 9 activos (3 bajas)', v.reg === '12' && v.act === '9', v);
  ok('T14 inventario: 67% con responsable (6 de 9) y 56% en buen estado (5 de 9)', v.resp === '67%' && v.bueno === '56%', v);
  ok('T14 inventario: vida útil 2 vencidas, 2 próximas y 2 sin fecha', v.venc === '2' && v.prox === '2' && v.sinf === '2', v);
  ok('T14 inventario: muestra de cuántos sin responsable y estado físico', (await pd.locator('.ti-kpi:has-text("Con responsable")').textContent()).includes('3 sin responsable') && (await pd.locator('.ti-kpi:has-text("En buen estado")').textContent()).includes('Regular 2 · Malo 1 · Sin estado 1'));
  ok('T14 garantías y reparaciones aparecen como "No disponible" con explicación', (await pd.locator('.ti-nd').count()) === 2 && (await pd.locator('.ti-nd:has-text("Garantías") .ti-kd').textContent()).includes('texto libre') && (await pd.locator('.ti-nd:has-text("reparación") .ti-kd').textContent()).includes('terminadas'));
  const guardado = await pd.evaluate(() => window.__MOCK.store['ti_resumenes/inventario']);
  ok('T14 el resumen quedó guardado con quién, cuándo y cuántos equipos', guardado && guardado.calculadoPor === ADMIN && guardado.equiposLeidos === 12 && guardado.datos.total === 12 && guardado.calculadoMs > 0, guardado && Object.keys(guardado));
  ok('T14 muestra la antigüedad y quién calculó el resumen', (await pd.locator('#inv-edad').textContent()).includes('hace menos de 1 minuto') && (await pd.locator('#inv-edad').textContent()).includes('12 equipos leídos'));
  ok('T14 la actualización quedó en la auditoría', await pd.evaluate(() => Object.keys(window.__MOCK.store).some((k) => k.startsWith('ti_auditoria/') && window.__MOCK.store[k].accion === 'actualizar_resumen_inventario')));
  const proc7 = { reg: await val('Procesos registrados'), doc: await val('Documentados'), pen: await val('Pendientes de aprobación'), ven: await val('Revisión vencida'), prox: await val('Revisión en 30 días'), pub: await val('Publicados vigentes'), rev: await val('En revisión'), sin: await val('Dependen de una persona') };
  ok('T14 procesos: 7 registrados y 29% documentados (2 de 7)', proc7.reg === '7' && proc7.doc === '29%', proc7);
  ok('T14 procesos: 1 pendiente, 1 vencida, 1 próxima, 3 publicados, 1 en revisión y 5 dependen de una persona', proc7.pen === '1' && proc7.ven === '1' && proc7.prox === '1' && proc7.pub === '3' && proc7.rev === '1' && proc7.sin === '5', proc7);
  const atn = await pd.locator('.ti-atn-b').allTextContents();
  ok('T14 requiere atención (Administrador+Director): PRO-002 pendiente y PRO-001 vencida', atn.length === 2 && atn.some((t) => t.includes('PRO-002') && t.includes('Espera tu decisión')) && atn.some((t) => t.includes('PRO-001') && t.includes('Revisión vencida')), atn);
  ok('T14 los semáforos siempre llevan texto (no solo color)', (await pd.evaluate(() => [...document.querySelectorAll('.ti-sem')].every((e) => e.textContent.trim().length > 2))));
  await D.ir('ti-procesos'); await D.ir('ti-inicio'); await D.espera(250);
  ok('T14 costo: volver a Inicio no lee el inventario ni otra vez el resumen visible', (await lecEq()) === 12);
  await pd.evaluate(() => { const r = Date.now; Date.now = () => r() + 45 * 86400000; }); await D.ir('ti-procesos'); await D.ir('ti-inicio'); await D.espera(250);
  ok('T14 un resumen de más de 30 días avisa que puede estar desactualizado, sin leer nada solo', (await pd.locator('#inv-edad').textContent()).includes('Puede estar desactualizado') && (await lecEq()) === 12);
  await pd.evaluate(() => { window.__MOCK.failRead = (p) => (p === 'equipos' ? Object.assign(new Error('x'), { code: 'permission-denied' }) : null); });
  await pd.click('#inv-act'); await pd.click('#ti-conf-ok'); await D.espera(300);
  ok('T14 error de permisos al leer el inventario: mensaje claro y los indicadores de procesos siguen', (await pd.locator('#view-ti-inicio').textContent()).includes('sin permiso') && (await val('Procesos registrados')) === '7');
  await pd.evaluate(() => { window.__MOCK.failRead = null; }); await pd.click('#inv-act'); await pd.click('#ti-conf-ok'); await D.espera(400);
  ok('T14 se recupera y vuelve a calcular (24 lecturas acumuladas, solo a pedido)', (await lecEq()) === 24 && (await val('Equipos registrados')) === '12', await lecEq());
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
  ok('T14 Director: ve el resumen guardado del inventario SIN leer los equipos (lecturas de equipos no aumentan)', (await pd.locator('#s-inv').count()) === 1 && (await val('Equipos registrados')) === '12' && (await lecEq()) === 24, await lecEq());
  ok('T14 Director: ve inventario y 2 elementos de atención (PRO-002 y PRO-001)', (await pd.locator('#s-inv').count()) === 1 && (await pd.locator('.ti-atn-b').count()) === 2, (await pd.locator('#view-ti-inicio').textContent()).slice(0, 300));
  const lecAntes = await lecEq();
  await D.logout(); await D.login(RESP); await D.espera(300);
  const atnR = await pd.locator('.ti-atn-b').allTextContents();
  ok('T14 Responsable: no ve el inventario y su atención son sus 3 procesos (PRO-001 vencida, PRO-003 borrador, PRO-004 en revisión)', (await pd.locator('#s-inv').count()) === 0 && atnR.length === 3 && atnR.some((t) => t.includes('PRO-003') && t.includes('Borrador')) && atnR.some((t) => t.includes('PRO-004')) && atnR.some((t) => t.includes('PRO-001')) && !atnR.some((t) => t.includes('PRO-006')), (await pd.locator('#view-ti-inicio').textContent()).slice(0, 300));
  ok('T14 Responsable: no se lee el inventario (ninguna lectura extra)', (await lecEq()) === lecAntes, { lecAntes });
  await D.logout(); await D.login(TEC); await D.espera(300);
  ok('T14 Técnico: sin indicadores ni atención ni inventario; solo accesos', (await pd.locator('#s-inv').count()) === 0 && (await pd.locator('.ti-kpis').count()) === 0 && (await pd.locator('.ti-atn-b').count()) === 0 && (await pd.locator('#s-acc').count()) === 1, (await pd.locator('#view-ti-inicio').textContent()).slice(0, 300));
  await D.logout(); await D.login(SOL); await D.espera(300);
  ok('T14 Solicitante: accesos a Mesa de ayuda e inventario, sin datos de procesos ni inventario', (await pd.locator('#s-inv').count()) === 0 && (await pd.locator('.ti-mod').count()) === 3 && (await pd.locator('.ti-mod:has-text("Mesa de ayuda")').count()) === 1 && !(await pd.locator('#view-ti-inicio').textContent()).includes('Procesos registrados'));
  await D.logout(); await pd.close();

  /* ---------- T15: estados vacíos ---------- */
  const semilla2 = {}; semilla2['usuarios_ti/' + ADMIN] = { email: ADMIN, nombre: 'Admin', roles: ['gerente'], activo: true };
  const E = await abrir(browser, errores, semilla2), pe = E.page;
  await E.login(ADMIN); await E.espera(400);
  const txt = await pe.locator('#view-ti-inicio').textContent();
  ok('T15 sin procesos ni equipos: mensajes de estado vacío comprensibles y sin cifras inventadas', txt.includes('Aún no hay procesos registrados') && txt.includes('Todavía no se ha calculado el resumen del inventario') && txt.includes('Nada pendiente') && (await pe.locator('.ti-kpi').count()) === 0, txt.slice(0, 200));
  ok('T15 el aviso dice que no hay metas ni tendencias', txt.includes('no existe un histórico'));
  await pe.close();

  /* ---------- T16: Mesa de ayuda ---------- */
  const ahoraT = Date.now(), DIA = 86400000;
  const sem3 = {};
  [[ADMIN, ['gerente']], [DIR, ['director']], [RESP, ['resp_proceso']], [TEC, ['tecnico']], [SOL, ['solicitante']]].forEach(([e, r]) => { sem3['usuarios_ti/' + e] = { email: e, nombre: e.split('@')[0], roles: r, activo: true }; });
  sem3['equipos/EQ-001'] = { id: 'EQ-001', af: 'AF-77', tipo: 'Laptop', marca: 'Dell', modelo: 'Latitude', responsable: 'Ana', estado: 'Bueno' };
  const tkSemilla = (id, extra) => Object.assign({ codigo: id, titulo: 'Impresora sin tinta', descripcion: 'd', tipo: 'incidente', categoria: 'impresoras', impacto: 'bajo', urgencia: 'media', prioridad: 'baja', estado: 'nuevo', solicitanteEmail: RESP, responsable: null, evidencias: [], esperas: [], escaladoNivel: 0, reaperturas: 0, primeraRespuestaMs: null, resueltoMs: null, cerradoMs: null, creadoMs: ahoraT - 1000 }, extra || {});
  sem3['ti_tickets/TCK-0050'] = tkSemilla('TCK-0050');
  sem3['ti_tickets/TCK-0060'] = tkSemilla('TCK-0060', { titulo: '=HYPERLINK("http://x")', categoria: 'sap', impacto: 'alto', urgencia: 'alta', prioridad: 'critica', creadoMs: ahoraT - 3 * DIA });
  const K = await abrir(browser, errores, sem3), pk = K.page;
  const habil = async (id) => (await K.accion(id).count()) === 1 && (await K.accion(id).getAttribute('aria-disabled')) === null;
  await K.login(SOL); await K.ir('ti-tickets'); await K.espera(250);
  ok('T16 el solicitante ve "Mesa de ayuda" en el menú y no ve Procesos ni Administración', (await K.visible('#tnav-ti-tickets')) && !(await K.visible('#tnav-ti-procesos')) && !(await K.visible('#tnav-ti-admin')));
  ok('T16 el solicitante no ve tickets ajenos (0 filas) ni tarjetas de gestión ni exportar', (await K.filas()) === 0 && (await pk.locator('#view-ti-tickets .ti-kpi').count()) === 0 && (await pk.locator('#tk-csv').count()) === 0);
  await pk.click('#tk-nuevo'); await pk.click('#n-ok'); await K.espera(150);
  ok('T16 formulario vacío: marca los campos obligatorios', (await pk.locator('.ti-ov .ti-err:not(:empty)').count()) >= 5);
  await pk.fill('#n-tit', '<img src=x onerror="window.__xss=1"> No abre SAP'); await pk.fill('#n-desc', 'Marca error al iniciar sesión.');
  await pk.selectOption('#n-cat', 'sap'); await pk.selectOption('#n-imp', 'alto'); await pk.selectOption('#n-urg', 'alta');
  ok('T16 la prioridad se calcula con la matriz (alto × alta = Crítica)', (await pk.locator('#n-prio').textContent()).trim() === 'Crítica');
  await pk.selectOption('#n-urg', 'baja'); ok('T16 alto × baja = Media', (await pk.locator('#n-prio').textContent()).trim() === 'Media');
  await pk.selectOption('#n-urg', 'alta');
  await pk.click('#n-addev'); await pk.fill('.ti-ov [data-dk=titulo]', 'Captura'); await pk.fill('.ti-ov [data-dk=url]', 'http://inseguro.com/x'); await pk.click('#n-ok'); await K.espera(150);
  ok('T16 evidencia con http:// se rechaza (solo https)', (await pk.locator('.ti-ov [data-e="ev0.url"]').textContent()).includes('https'));
  await pk.fill('.ti-ov [data-dk=url]', 'https://drive.google.com/captura');
  const lecEq0 = await pk.evaluate(() => window.__MOCK.lecturas['equipos'] || 0);
  await pk.fill('#n-act', 'AF-77'); await pk.click('#n-chk'); await K.espera(200);
  ok('T16 verifica el equipo por número de activo fijo y muestra qué es (sin copiarlo)', (await pk.locator('#n-act-i').textContent()).includes('Dell') && (await pk.locator('#n-act-i').textContent()).includes('EQ-001'), await pk.locator('#n-act-i').textContent());
  ok('T16 verificar un equipo cuesta pocas lecturas (no se lee el inventario completo)', ((await pk.evaluate(() => window.__MOCK.lecturas['equipos'] || 0)) - lecEq0) <= 1);
  await pk.click('#n-ok'); await pk.waitForSelector('.ti-ov .modal-footer', { timeout: 4000 }).catch(() => {}); await K.espera(250);
  const nuevoTk = await pk.evaluate(() => window.__MOCK.store['ti_tickets/TCK-0001']);
  ok('T16 el ticket se creó como TCK-0001: nuevo, crítico, del solicitante, sin responsable', nuevoTk && nuevoTk.estado === 'nuevo' && nuevoTk.prioridad === 'critica' && nuevoTk.solicitanteEmail === SOL && nuevoTk.responsable === null, nuevoTk);
  ok('T16 el ticket guarda solo el ID del equipo, no sus datos', nuevoTk.activoId === 'EQ-001' && !JSON.stringify(nuevoTk).includes('Dell') && !JSON.stringify(nuevoTk).includes('Latitude'));
  ok('T16 XSS: el título se muestra como texto', (await pk.evaluate(() => window.__xss)) === undefined && (await pk.locator('.ti-ov .modal-hd h3').textContent()).includes('<img'));
  const hist0 = await pk.evaluate(() => Object.keys(window.__MOCK.store).filter((k) => k.startsWith('ti_tickets/TCK-0001/historial/')).length);
  ok('T16 creación registrada en historial y auditoría', hist0 === 1 && (await pk.evaluate(() => Object.values(window.__MOCK.store).some((x) => x && x.accion === 'crear_ticket' && x.registroId === 'TCK-0001'))));
  ok('T16 el solicitante solo puede cancelar su ticket nuevo; no ve acciones de TI', JSON.stringify(await pk.locator('.ti-ov [data-a]').evaluateAll((e) => e.map((x) => x.dataset.a))) === JSON.stringify(['cancelar']));
  ok('T16 el solicitante no ve la pestaña Historial', (await pk.locator('.ti-ov [data-t=historial]').count()) === 0);
  await K.cerrarModal();
  ok('T16 el solicitante ve exactamente su ticket (no el de RESP)', (await K.filas()) === 1);
  await K.logout();

  // Director: asigna
  await K.login(DIR); await K.ir('ti-tickets'); await K.espera(250);
  ok('T16 el Director ve los 3 tickets y las tarjetas de gestión', (await K.filas()) === 3 && (await pk.locator('#view-ti-tickets .ti-kpi').count()) === 5);
  ok('T16 sin SLA configurado: insignia "SLA no configurado" y tarjetas de vencimiento sin cifra', (await pk.locator('.ti-row').first().textContent()).includes('SLA no configurado') && (await pk.locator('[data-kpi=vencidos] .ti-kv').textContent()) === '—');
  await K.abrirFila('TCK-0001');
  ok('T16 el Director puede asignar y cambiar prioridad, pero no tomar ni atender', await habil('asignar') && await habil('cambiar_prioridad') && !(await habil('tomar')) && (await K.accion('iniciar_atencion').count()) === 0);
  ok('T16 el Director no puede cancelar tickets ajenos', !(await habil('cancelar_ti')));
  await K.accion('asignar').click(); await pk.click('#ac-ok'); await K.espera(120);
  ok('T16 asignar exige elegir responsable', (await pk.locator('#ac-e').textContent()).length > 0);
  const opciones = await pk.locator('#ac-responsable option').allTextContents();
  ok('T16 solo se pueden asignar personas con rol Técnico o Administrador', opciones.some((o) => o.includes(TEC)) && opciones.some((o) => o.includes(ADMIN)) && !opciones.some((o) => o.includes(SOL)) && !opciones.some((o) => o.includes(RESP)), opciones);
  await pk.selectOption('#ac-responsable', TEC); await pk.click('#ac-ok'); await K.espera(300);
  ok('T16 ticket asignado al técnico', (await pk.evaluate(() => window.__MOCK.store['ti_tickets/TCK-0001'])).responsable === TEC && (await pk.locator('.ti-ov .modal-hd .ti-te').textContent()).includes('Asignado'));
  await K.cerrarModal(); await K.logout();

  // Técnico: atiende
  await K.login(TEC); await K.ir('ti-tickets'); await K.espera(250);
  await K.abrirFila('TCK-0001');
  ok('T16 el técnico asignado puede iniciar atención', await K.accion('iniciar_atencion').count() === 1 && (await K.accion('iniciar_atencion').getAttribute('aria-disabled')) === null);
  await K.cerrarModal(); await K.abrirFila('TCK-0050');
  ok('T16 el técnico puede tomar un ticket sin responsable, pero no asignar', await habil('tomar') && !(await habil('asignar')));
  await K.cerrarModal(); await K.abrirFila('TCK-0001');
  await K.accion('iniciar_atencion').click(); await K.espera(300);
  ok('T16 en atención y se registra la primera respuesta', (await pk.evaluate(() => window.__MOCK.store['ti_tickets/TCK-0001'])).estado === 'en_atencion' && (await pk.evaluate(() => window.__MOCK.store['ti_tickets/TCK-0001'])).primeraRespuestaMs > 0);
  await K.accion('esperar_usuario').click(); await pk.click('#ac-ok'); await K.espera(120);
  ok('T16 esperar al usuario exige motivo', (await pk.locator('#ac-e').textContent()).length > 0);
  await pk.fill('#ac-motivo', 'Necesito una captura del error'); await pk.click('#ac-ok'); await K.espera(300);
  const enEspera = await pk.evaluate(() => window.__MOCK.store['ti_tickets/TCK-0001']);
  ok('T16 en espera del usuario con la pausa abierta', enEspera.estado === 'espera_usuario' && enEspera.esperas.length === 1 && enEspera.esperas[0].hasta === null);
  // nota interna
  await pk.click('.ti-ov [data-t=conv]'); await pk.fill('#tk-com', 'Posible bloqueo de la cuenta; revisar con seguridad.'); await pk.check('#tk-int'); await pk.click('#tk-enviar'); await K.espera(300);
  await pk.fill('#tk-com', 'Hola, ya estoy revisando tu caso.'); await pk.click('#tk-enviar'); await K.espera(300);
  ok('T16 la conversación muestra la nota interna marcada y el mensaje público', (await pk.locator('.ti-msg').count()) === 2 && (await pk.locator('.ti-msg.int').count()) === 1);
  await K.cerrarModal(); await K.logout();

  // Solicitante responde
  await K.login(SOL); await K.ir('ti-tickets'); await K.espera(250); await K.abrirFila('TCK-0001');
  await pk.click('.ti-ov [data-t=conv]'); await K.espera(150);
  ok('T16 el solicitante NO ve la nota interna (solo el mensaje público)', (await pk.locator('.ti-msg').count()) === 1 && !(await pk.locator('.ti-ov').textContent()).includes('bloqueo de la cuenta'));
  ok('T16 el solicitante puede "Responder y reanudar"', await K.accion('responder').count() === 1);
  await K.accion('responder').click(); await pk.fill('#ac-motivo', 'Adjunto la captura en el enlace.'); await pk.click('#ac-ok'); await K.espera(300);
  const resp1 = await pk.evaluate(() => window.__MOCK.store['ti_tickets/TCK-0001']);
  ok('T16 la respuesta reanuda la atención, cierra la pausa y queda como mensaje', resp1.estado === 'en_atencion' && resp1.esperas[0].hasta > 0 && (await pk.locator('.ti-msg').count()) === 2);
  await K.cerrarModal(); await K.logout();

  // Técnico resuelve
  await K.login(TEC); await K.ir('ti-tickets'); await K.espera(250); await K.abrirFila('TCK-0001');
  await K.accion('resolver').click(); await pk.fill('#ac-diagnostico', 'Cuenta bloqueada por intentos fallidos.'); await pk.click('#ac-ok'); await K.espera(120);
  ok('T16 resolver exige diagnóstico y solución', (await pk.locator('#ac-e').textContent()).length > 0);
  await pk.fill('#ac-solucion', 'Se desbloqueó la cuenta y se restableció la contraseña.'); await pk.click('#ac-ok'); await K.espera(300);
  ok('T16 ticket resuelto con diagnóstico, solución y fecha', (await pk.evaluate(() => window.__MOCK.store['ti_tickets/TCK-0001'])).estado === 'resuelto' && (await pk.evaluate(() => window.__MOCK.store['ti_tickets/TCK-0001'])).solucion.includes('desbloqueó'));
  await K.cerrarModal(); await K.logout();

  // Solicitante confirma
  await K.login(SOL); await K.ir('ti-tickets'); await K.espera(250); await K.abrirFila('TCK-0001');
  ok('T16 el solicitante ve "Confirmar" y "No quedó resuelto"', await K.accion('confirmar').count() === 1 && await K.accion('reabrir').count() === 1);
  await K.accion('confirmar').click(); await K.espera(300);
  const cerrado = await pk.evaluate(() => window.__MOCK.store['ti_tickets/TCK-0001']);
  ok('T16 ticket cerrado con confirmación del solicitante', cerrado.estado === 'cerrado' && cerrado.confirmacion && cerrado.confirmacion.por === SOL);
  ok('T16 aún dentro de la ventana de reapertura: puede reabrir', await K.accion('reabrir').count() === 1 && (await K.accion('reabrir').getAttribute('aria-disabled')) === null);
  await pk.evaluate(() => { const t = window.__MOCK.store['ti_tickets/TCK-0001']; t.cerradoMs = Date.now() - 9 * 86400000; t.resueltoMs = t.cerradoMs; });
  await K.cerrarModal(); await K.logout(); await K.login(SOL); await K.ir('ti-tickets'); await K.espera(250); await K.abrirFila('TCK-0001');
  ok('T16 pasada la ventana (5 días) la reapertura se deshabilita con explicación', (await K.accion('reabrir').getAttribute('aria-disabled')) === 'true' && (await K.accion('reabrir').getAttribute('data-why')).includes('5 días'));
  await K.cerrarModal(); await K.logout();

  // Auditoría y trazabilidad del flujo
  const traza = await pk.evaluate(() => ({ hist: Object.keys(window.__MOCK.store).filter((k) => k.startsWith('ti_tickets/TCK-0001/historial/')).map((k) => window.__MOCK.store[k].accion), aud: Object.values(window.__MOCK.store).filter((x) => x && x.tipoRegistro === 'ticket' && x.registroId === 'TCK-0001').map((x) => x.accion) }));
  ok('T16 el historial del ticket registra todo el flujo', ['crear', 'asignar', 'iniciar_atencion', 'esperar_usuario', 'responder', 'resolver', 'confirmar'].every((a) => traza.hist.includes(a)), traza.hist);
  ok('T16 la auditoría registra cada acción del ticket', ['crear_ticket', 'ticket_asignar', 'ticket_iniciar_atencion', 'ticket_resolver', 'ticket_confirmar'].every((a) => traza.aud.includes(a)), traza.aud);

  // Administrador: configura y ve el SLA
  await K.login(ADMIN); await K.ir('ti-admin'); await K.espera(250);
  await pk.click('[data-t=tickets]'); await K.espera(300);
  ok('T16 el administrador ve la configuración con 10 categorías iniciales y sin SLA', (await pk.locator('[data-cn]').count()) === 10 && (await pk.locator('[data-sla]').evaluateAll((e) => e.every((x) => x.value === ''))));
  await pk.fill('[data-sla="sap|critica|respuestaH"]', '4'); await pk.fill('[data-sla="sap|critica|resolucionH"]', '2'); await pk.click('#cf-guardar'); await K.espera(150);
  ok('T16 respuesta mayor que resolución se rechaza', (await pk.locator('#cf-sla-e').textContent()).includes('no puede tardar más'));
  await pk.fill('[data-sla="sap|critica|respuestaH"]', '1'); await pk.fill('[data-sla="sap|critica|resolucionH"]', '8');
  await pk.fill('#cf-nueva', 'Telefonía'); await pk.click('#cf-addcat'); await K.espera(150);
  await pk.fill('[data-sla="sap|critica|respuestaH"]', '1'); await pk.fill('[data-sla="sap|critica|resolucionH"]', '8'); await pk.click('#cf-guardar'); await K.espera(300);
  const cfgG = await pk.evaluate(() => window.__MOCK.store['ti_config/tickets']);
  ok('T16 la configuración se guarda: SLA SAP crítica 1 h / 8 h, categoría nueva y sin horario', cfgG && cfgG.sla['sap|critica'].respuestaH === 1 && cfgG.sla['sap|critica'].resolucionH === 8 && cfgG.categorias.length === 11 && cfgG.categorias.some((c) => c.id === 'telefonia') && cfgG.horario === null, cfgG);
  ok('T16 el cambio de configuración queda en la auditoría', await pk.evaluate(() => Object.values(window.__MOCK.store).some((x) => x && x.accion === 'configurar_mesa_ayuda')));
  await K.ir('ti-tickets'); await K.espera(300); await K.shot('9-mesa-ayuda-lista');
  const fila60 = await pk.locator('.ti-row:has-text("TCK-0060")').textContent();
  ok('T16 con SLA configurado, el ticket crítico de SAP de hace 3 días aparece "Vencido" (con texto)', fila60.includes('Vencido'), fila60);
  ok('T16 la tarjeta "SLA vencido" cuenta 1 y filtra exactamente ese ticket', (await pk.locator('[data-kpi=vencidos] .ti-kv').textContent()) === '1' && (await (async () => { await pk.click('[data-kpi=vencidos]'); await K.espera(120); return K.filas(); })()) === 1);
  await pk.click('#tk-lim'); await K.espera(100);
  ok('T16 los tickets de otras categorías sin SLA quedan "Sin plazo"/"no configurado", no vencidos', !(await pk.locator('.ti-row:has-text("TCK-0050")').textContent()).includes('Vencido'));
  await K.abrirFila('TCK-0060');
  ok('T16 el administrador puede cancelar un ticket ajeno (con motivo) y también tomarlo', await habil('cancelar_ti') && await habil('tomar'));
  await K.shot('10-mesa-ayuda-detalle');
  await K.cerrarModal();
  // CSV
  const [desc] = await Promise.all([pk.waitForEvent('download', { timeout: 4000 }), pk.click('#tk-csv')]);
  const csv = fs.readFileSync(await desc.path(), 'utf8');
  ok('T16 el CSV tiene encabezados en español y neutraliza fórmulas (=HYPERLINK…)', csv.includes('Folio') && csv.includes("\"'=HYPERLINK") && !csv.includes('"=HYPERLINK'), csv.slice(0, 200));
  // Dashboard
  await K.ir('ti-inicio'); await K.espera(300);
  const tIni = await pk.locator('#s-tk').locator('xpath=ancestor::section').textContent();
  ok('T16 Inicio: sección Mesa de ayuda con cifras reales (3 tickets en la ventana; 2 abiertos)', tIni.includes('Tickets abiertos') && (await pk.locator('[data-tnav=abiertos] .ti-kv').textContent()) === '2', tIni.slice(0, 300));
  ok('T16 Inicio: con menos de 5 resueltos, tiempo medio y cumplimiento dicen "No disponible" (sin porcentaje)', tIni.includes('Tiempo medio de resolución') && (tIni.match(/No disponible/g) || []).length >= 2 && !/%/.test(tIni.replace(/Cumplimiento de SLA[^%]*$/, '')) , tIni.slice(0, 500));
  await pk.click('[data-tnav=criticos]'); await K.espera(200);
  ok('T16 clic en "Críticos abiertos" lleva a Mesa de ayuda filtrada', (await pk.locator('.ti-kpi.on[data-kpi=criticos]').count()) === 1 && (await K.filas()) === 1);
  await K.logout();
  await K.page.close();

  /* ---------- T17: Gerente de TI y Consultores ---------- */
  const CONS_A = RESP, CONS_B = TEC, GER = ADMIN;
  const sem4 = {};
  [[GER, ['gerente']], [CONS_A, ['consultor']], [CONS_B, ['consultor']], [SOL, ['solicitante']]].forEach(([e, r]) => { sem4['usuarios_ti/' + e] = { email: e, nombre: e.split('@')[0], roles: r, activo: true }; });
  sem4['ti_tickets/TCK-0101'] = tkSemilla('TCK-0101', { estado: 'asignado', responsable: CONS_A, solicitanteEmail: SOL });
  sem4['ti_tickets/TCK-0102'] = tkSemilla('TCK-0102', { estado: 'asignado', responsable: CONS_B, solicitanteEmail: SOL });
  sem4['ti_tickets/TCK-0103'] = tkSemilla('TCK-0103', { estado: 'nuevo', responsable: null, solicitanteEmail: SOL });
  sem4['ti_tickets/TCK-0104'] = tkSemilla('TCK-0104', { estado: 'en_atencion', responsable: CONS_B, solicitanteEmail: CONS_B });
  const G = await abrir(browser, errores, sem4), pg = G.page;
  const habilG = async (id) => (await G.accion(id).count()) === 1 && (await G.accion(id).getAttribute('aria-disabled')) === null;
  await G.login(CONS_A); await G.ir('ti-tickets'); await G.espera(300);
  const codsA = await pg.locator('#view-ti-tickets .ti-row .ti-code').allTextContents();
  ok('T17 el consultor ve sus asignados y los nuevos sin responsable, y no los de otro consultor', JSON.stringify(codsA.sort()) === JSON.stringify(['TCK-0101', 'TCK-0103']), codsA);
  ok('T17 el consultor no ve tarjetas de gestión global', (await pg.locator('#view-ti-tickets .ti-kpi').count()) === 0);
  ok('T17 el consultor no ve Administración ni puede abrirla', !(await G.visible('#tnav-ti-admin')) && (await G.visible('#tnav-ti-procesos')));
  await G.ir('ti-admin'); await G.espera(150);
  ok('T17 abrir Administración por la fuerza lo regresa a Inicio', (await pg.locator('#view-ti-admin').isVisible()) === false);
  await G.ir('ti-tickets'); await G.espera(200);
  await G.abrirFila('TCK-0101');
  ok('T17 puede iniciar atención en lo asignado a él, pero no asignar ni cancelar', await habilG('iniciar_atencion') && !(await habilG('asignar')) && !(await habilG('cancelar_ti')));
  await G.cerrarModal(); await G.abrirFila('TCK-0103');
  ok('T17 puede tomar un ticket sin responsable', await habilG('tomar'));
  await G.accion('tomar').click(); await G.espera(300);
  ok('T17 al tomarlo queda asignado a él', (await pg.evaluate(() => window.__MOCK.store['ti_tickets/TCK-0103'])).responsable === CONS_A);
  await G.cerrarModal(); await G.espera(200);
  ok('T17 un ticket que otro consultor ya tomó deja de aparecerle (solo los de él)', (await pg.locator('#view-ti-tickets .ti-row').count()) === 2);
  await G.logout();
  await G.login(GER); await G.ir('ti-tickets'); await G.espera(300);
  ok('T17 el Gerente ve todos los tickets y las tarjetas de gestión', (await pg.locator('#view-ti-tickets .ti-row').count()) === 4 && (await pg.locator('#view-ti-tickets .ti-kpi').count()) === 5);
  await G.abrirFila('TCK-0102');
  ok('T17 el Gerente puede reasignar, cambiar prioridad y cancelar un ticket de un consultor', await habilG('asignar') && await habilG('cambiar_prioridad') && await habilG('cancelar_ti'));
  await G.accion('asignar').click(); const asg = await pg.locator('#ac-responsable option').allTextContents();
  ok('T17 se puede asignar a los consultores y al Gerente, no al solicitante', asg.some((o) => o.includes(CONS_A)) && asg.some((o) => o.includes(CONS_B)) && asg.some((o) => o.includes(GER)) && !asg.some((o) => o.includes(SOL)), asg);
  await pg.selectOption('#ac-responsable', CONS_A); await pg.click('#ac-ok'); await G.espera(300);
  ok('T17 el Gerente reasignó el ticket a otro consultor', (await pg.evaluate(() => window.__MOCK.store['ti_tickets/TCK-0102'])).responsable === CONS_A);
  await G.cerrarModal();
  ok('T17 el Gerente ve Administración y la pestaña de Mesa de ayuda', (await G.visible('#tnav-ti-admin')));
  await G.ir('ti-admin'); await G.espera(200);
  ok('T17 Administración muestra los roles Gerente y Consultor', (await pg.locator('.ti-tabs [data-t=roles]').count()) === 1 && (await (async () => { await pg.click('[data-t=roles]'); return (await pg.locator('#view-ti-admin .ti-table').textContent()).includes('Consultor de TI') && (await pg.locator('#view-ti-admin .ti-table').textContent()).includes('Gerente de TI'); })()));
  await G.logout(); await G.page.close();

  /* ---------- T18: Gestión de cambios ---------- */
  const sem5 = {};
  [[ADMIN, ['gerente']], [RESP, ['consultor']], [TEC, ['consultor']], [SOL, ['solicitante']]].forEach(([e, r]) => { sem5['usuarios_ti/' + e] = { email: e, nombre: e.split('@')[0], roles: r, activo: true }; });
  const H5 = new Date(2030, 0, 10, 20, 0).getTime();
  sem5['ti_cambios/CHG-0050'] = { codigo: 'CHG-0050', titulo: 'Cambio ajeno', tipo: 'normal', sistema: 'ERP', activoIds: '', estado: 'aprobado', solicitanteEmail: TEC, responsableImpl: TEC, riesgo: 'medio', inicioMs: H5, finMs: H5 + 3 * 3600000, evidencias: [], creadoMs: ahoraT - 1000, aprobacion: { por: ADMIN, fecha: ahoraT, excepcion: false } };
  const Q = await abrir(browser, errores, sem5), pq = Q.page;
  const habilQ = async (id) => (await Q.accion(id).count()) === 1 && (await Q.accion(id).getAttribute('aria-disabled')) === null;
  await Q.login(RESP);
  ok('T18 el consultor ve "Gestión de cambios" y el solicitante no', (await Q.visible('#tnav-ti-cambios')));
  await Q.ir('ti-cambios'); await Q.espera(250);
  ok('T18 el consultor no ve el cambio de otro consultor ni tarjetas de gestión', (await Q.filas()) === 0 && (await pq.locator('#view-ti-cambios .ti-kpi').count()) === 0);
  await pq.click('#cm-nuevo'); await pq.fill('#c-tit', '<b onmouseover="window.__xss=1">Actualizar firmware</b>'); await pq.click('#c-save'); await Q.espera(400);
  const chg1 = await pq.evaluate(() => window.__MOCK.store['ti_cambios/CHG-0001']);
  ok('T18 un borrador solo exige el título: se crea CHG-0001 en borrador', chg1 && chg1.estado === 'borrador' && chg1.solicitanteEmail === RESP, chg1);
  ok('T18 XSS: el título se ve como texto', (await pq.evaluate(() => window.__xss)) === undefined && (await pq.locator('.ti-ov .modal-hd h3').textContent()).includes('<b'));
  await Q.accion('enviar').click(); await Q.espera(400);
  ok('T18 enviar un borrador incompleto abre el editor con los campos faltantes marcados', (await pq.locator('.ti-ov [data-e=planReversa]').textContent()).length > 0 && (await pq.locator('.ti-ov [data-e=impacto]').textContent()).length > 0);
  await pq.fill('#c-desc', 'Actualizar el firmware de los switches.'); await pq.fill('#c-just', 'Corrige una vulnerabilidad.'); await pq.fill('#c-sis', 'Red'); await pq.fill('#c-act', 'SW-01, SW-02');
  await pq.selectOption('#c-imp', 'alto'); await pq.selectOption('#c-prob', 'media');
  ok('T18 el riesgo se calcula (alto × media = Alto)', (await pq.locator('#c-ries').textContent()).includes('alto'));
  await pq.fill('#c-ini', '2030-01-10T20:00'); await pq.fill('#c-fin', '2030-01-10T22:00'); await pq.fill('#c-pi', '1. Respaldar. 2. Actualizar.'); await pq.fill('#c-pp', 'Ping y consola.');
  await pq.click('#c-addev'); await pq.fill('.ti-ov [data-dk=titulo]', 'Cambio'); await pq.fill('.ti-ov [data-dk=url]', 'http://x.com'); await pq.click('#c-save'); await Q.espera(120);
  ok('T18 evidencia con http:// se rechaza', (await pq.locator('.ti-ov [data-e="ev0.url"]').textContent()).includes('https'));
  await pq.fill('.ti-ov [data-dk=url]', 'https://drive.google.com/x'); await pq.fill('#c-pr', 'Restaurar el respaldo de la configuración.'); await pq.click('#c-save'); await pq.waitForSelector('.ti-ov .modal-footer', { timeout: 3000 }).catch(() => {}); await Q.espera(300);
  const chg2 = await pq.evaluate(() => window.__MOCK.store['ti_cambios/CHG-0001']);
  ok('T18 se guarda completo con riesgo alto y ventana', chg2.riesgo === 'alto' && chg2.finMs > chg2.inicioMs && chg2.planReversa.length > 0 && chg2.activoIds === 'SW-01, SW-02', chg2);
  await Q.accion('enviar').click(); await Q.espera(400);
  ok('T18 enviado a aprobación', (await pq.evaluate(() => window.__MOCK.store['ti_cambios/CHG-0001'])).estado === 'pendiente_aprobacion');
  ok('T18 el consultor no puede aprobar su propio cambio', !(await habilQ('aprobar')) && (await habilQ('cancelar')));
  await Q.cerrarModal(); await Q.logout();

  await Q.login(ADMIN); await Q.ir('ti-cambios'); await Q.espera(300);
  ok('T18 el Gerente ve todos los cambios y 5 tarjetas', (await Q.filas()) === 2 && (await pq.locator('#view-ti-cambios .ti-kpi').count()) === 5);
  ok('T18 tarjeta "Pendientes de aprobación" = 1 y filtra', (await pq.locator('[data-kpi=pendientesAprobacion] .ti-kv').textContent()) === '1');
  await Q.abrirFila('CHG-0001');
  ok('T18 el Gerente puede aprobar, rechazar y devolver', await habilQ('aprobar') && await habilQ('rechazar') && await habilQ('devolver'));
  await Q.accion('rechazar').click(); await pq.click('#ac-ok'); await Q.espera(100);
  ok('T18 rechazar exige motivo', (await pq.locator('#ac-e').textContent()).length > 0); await pq.click('#ac-c');
  await Q.accion('aprobar').click(); await Q.espera(400);
  const ap = await pq.evaluate(() => window.__MOCK.store['ti_cambios/CHG-0001']);
  ok('T18 aprobado por el Gerente (sin excepción)', ap.estado === 'aprobado' && ap.aprobacion.por === ADMIN && ap.aprobacion.excepcion === false);
  await Q.cerrarModal(); await Q.logout();

  await Q.login(RESP); await Q.ir('ti-cambios'); await Q.espera(300); await Q.abrirFila('CHG-0001');
  ok('T18 el consultor asignado puede iniciar la implementación', await habilQ('iniciar'));
  await Q.accion('iniciar').click(); await Q.espera(300);
  await Q.accion('finalizar_ok').click(); await pq.click('#ac-ok'); await Q.espera(100);
  ok('T18 finalizar exige el resultado', (await pq.locator('#ac-e').textContent()).length > 0);
  await pq.fill('#ac-resultado', 'Actualizado sin incidentes.'); await pq.click('#ac-ok'); await Q.espera(400);
  ok('T18 implementado con resultado y sin falla', (await pq.evaluate(() => window.__MOCK.store['ti_cambios/CHG-0001'])).estado === 'implementado' && (await pq.evaluate(() => window.__MOCK.store['ti_cambios/CHG-0001'])).fallo === false);
  ok('T18 el consultor no puede cerrar con revisión (solo el Gerente)', !(await habilQ('cerrar')));
  await Q.cerrarModal(); await Q.logout();

  await Q.login(ADMIN); await Q.ir('ti-cambios'); await Q.espera(300); await Q.abrirFila('CHG-0001');
  await Q.accion('cerrar').click(); await pq.fill('#ac-revision', 'Todo bien.'); await pq.click('#ac-ok'); await Q.espera(400);
  ok('T18 cerrado con revisión posterior', (await pq.evaluate(() => window.__MOCK.store['ti_cambios/CHG-0001'])).estado === 'cerrado');
  const histC = await pq.evaluate(() => ({ h: Object.keys(window.__MOCK.store).filter((k) => k.startsWith('ti_cambios/CHG-0001/historial/')).map((k) => window.__MOCK.store[k].accion), a: Object.values(window.__MOCK.store).filter((x) => x && x.tipoRegistro === 'cambio' && x.registroId === 'CHG-0001').map((x) => x.accion) }));
  ok('T18 historial y auditoría registran todo el flujo', ['crear', 'enviar', 'aprobar', 'iniciar', 'finalizar_ok', 'cerrar'].every((x) => histC.h.includes(x)) && ['crear_cambio', 'cambio_enviar', 'cambio_aprobar', 'cambio_cerrar'].every((x) => histC.a.includes(x)), histC);
  await Q.cerrarModal();
  // emergencia propia + conflicto
  await pq.click('#cm-nuevo'); await pq.fill('#c-tit', 'Parche urgente ERP'); await pq.selectOption('#c-tipo', 'emergencia'); await pq.fill('#c-desc', 'd'); await pq.fill('#c-just', 'j'); await pq.fill('#c-sis', 'erp');
  await pq.selectOption('#c-imp', 'medio'); await pq.selectOption('#c-prob', 'baja'); await pq.fill('#c-ini', '2030-01-10T21:00'); await pq.fill('#c-fin', '2030-01-10T23:00'); await pq.fill('#c-pi', 'p'); await pq.fill('#c-pp', 't'); await pq.fill('#c-pr', 'r');
  await pq.click('#c-save'); await pq.waitForSelector('.ti-ov .modal-footer', { timeout: 3000 }).catch(() => {}); await Q.espera(300);
  await Q.accion('enviar').click(); await Q.espera(400);
  ok('T18 muestra el choque de ventanas con el cambio de ERP aprobado', (await pq.locator('.ti-ov .ti-note.warn').textContent()).includes('CHG-0050'));
  ok('T18 una emergencia propia puede aprobarla el Gerente, con motivo', await habilQ('aprobar'));
  await Q.accion('aprobar').click(); await pq.click('#ti-conf-ok'); await Q.espera(100); await pq.click('#ac-ok'); await Q.espera(100);
  ok('T18 pide motivo de la aprobación propia', (await pq.locator('#ac-e').textContent()).length > 0);
  await pq.click('#ac-ok'); await Q.espera(50);
  await pq.fill('#ac-motivo', 'Servicio caído.'); await pq.click('#ac-ok'); await Q.espera(400);
  const em = await pq.evaluate(() => window.__MOCK.store['ti_cambios/CHG-0002']);
  ok('T18 aprobada con marca de excepción', em && em.estado === 'aprobado' && em.aprobacion.excepcion === true, em);
  await Q.cerrarModal(); await Q.ir('ti-inicio'); await Q.espera(300);
  const cmIni = await pq.locator('#s-cm').locator('xpath=ancestor::section').textContent();
  ok('T18 Inicio: sección de cambios con cifras reales y tasa de éxito "No disponible" (muestra < 5)', cmIni.includes('Cambios abiertos') && cmIni.includes('Tasa de éxito') && cmIni.includes('No disponible') && (await pq.locator('[data-cnav=emergencias] .ti-kv').textContent()) === '1', cmIni.slice(0, 300));
  await Q.logout();
  await Q.login(SOL); ok('T18 el solicitante no ve Gestión de cambios', !(await Q.visible('#tnav-ti-cambios')));
  await Q.logout(); await Q.page.close();

  /* ---------- T19: Proveedores y contratos ---------- */
  const sem6 = {};
  [[ADMIN, ['gerente']], [RESP, ['consultor']], [TEC, ['consultor']], [SOL, ['solicitante']]].forEach(([e, r]) => { sem6['usuarios_ti/' + e] = { email: e, nombre: e.split('@')[0], roles: r, activo: true }; });
  const isoHoy = (d) => { const x = new Date(Date.now() + d * 86400000); return x.toISOString().slice(0, 10); };
  sem6['ti_proveedores/PRV-050'] = { codigo: 'PRV-050', nombre: 'Proveedor ajeno', categoria: 'nube', estado: 'activo', contactos: [], creadoPor: TEC, responsable: TEC };
  const cSem = (id, extra) => Object.assign({ codigo: id, titulo: 'Contrato ' + id, tipo: 'soporte', proveedorId: 'PRV-050', objeto: 'o', inicio: isoHoy(-300), fin: isoHoy(400), monto: 1000, moneda: 'MXN', periodicidad: 'mensual', responsable: TEC, estado: 'vigente', creadoPor: TEC, documentos: [{ titulo: 'PDF', url: 'https://d.com/x' }] }, extra || {});
  sem6['ti_contratos/CTR-0050'] = cSem('CTR-0050', { fin: isoHoy(30) });
  sem6['ti_contratos/CTR-0051'] = cSem('CTR-0051', { fin: isoHoy(-5), documentos: [], monto: 100, moneda: 'USD', periodicidad: 'anual' });
  sem6['ti_contratos/CTR-0052'] = cSem('CTR-0052', { fin: isoHoy(500) });
  const V = await abrir(browser, errores, sem6), pv = V.page;
  const habilV = async (id) => (await V.accion(id).count()) === 1 && (await V.accion(id).getAttribute('aria-disabled')) === null;
  await V.login(RESP); await V.ir('ti-proveedores'); await V.espera(300);
  ok('T19 el consultor ve el menú de Proveedores y contratos y no ve contratos ajenos', (await V.visible('#tnav-ti-proveedores')) && (await V.filas()) === 0 && (await pv.locator('#view-ti-proveedores .ti-kpi').count()) === 0);
  await pv.click('[data-tab=proveedores]'); await pv.click('#pv-nuevo'); await pv.fill('#v-nom', '<i onmouseover="window.__xss=1">Dell México</i>'); await pv.fill('#v-rfc', 'xx'); await pv.click('#v-ok'); await V.espera(100);
  ok('T19 valida RFC y exige nombre del contacto', (await pv.locator('.ti-ov [data-e=rfc]').textContent()).length > 0);
  await pv.fill('#v-rfc', 'DME850101AB1'); await pv.fill('#v-web', 'http://dell.com'); await pv.click('#v-ok'); await V.espera(100);
  ok('T19 el sitio web debe ser https', (await pv.locator('.ti-ov [data-e=sitioWeb]').textContent()).includes('https'));
  await pv.fill('#v-web', 'https://dell.com.mx'); await pv.click('#v-addct'); await pv.fill('.ti-ov [data-ck=nombre]', 'Ana Ventas'); await pv.fill('.ti-ov [data-ck=correo]', 'ana@dell.com'); await pv.click('#v-ok'); await V.espera(400);
  const prv1 = await pv.evaluate(() => window.__MOCK.store['ti_proveedores/PRV-001']);
  ok('T19 se creó PRV-001 con su contacto, a nombre del consultor', prv1 && prv1.creadoPor === RESP && prv1.contactos.length === 1 && prv1.estado === 'activo', prv1);
  ok('T19 XSS: el nombre del proveedor se muestra como texto', (await pv.evaluate(() => window.__xss)) === undefined && (await pv.locator('.ti-row:has-text("PRV-001")').textContent()).includes('<i'));
  await pv.click('[data-tab=contratos]'); await pv.click('#pc-nuevo'); await pv.fill('#k-tit', 'Soporte Dell 2027'); await pv.selectOption('#k-prov', 'PRV-001'); await pv.click('#k-save'); await pv.waitForSelector('.ti-ov .modal-footer', { timeout: 3000 }).catch(() => {}); await V.espera(300);
  const ctr1 = await pv.evaluate(() => window.__MOCK.store['ti_contratos/CTR-0001']);
  ok('T19 un borrador solo exige título, tipo y proveedor (CTR-0001)', ctr1 && ctr1.estado === 'borrador' && ctr1.proveedorId === 'PRV-001', ctr1);
  await V.accion('enviar').click(); await V.espera(400);
  ok('T19 enviar incompleto abre el editor con campos marcados', (await pv.locator('.ti-ov [data-e=objeto]').textContent()).length > 0 && (await pv.locator('.ti-ov [data-e=monto]').textContent()).length > 0);
  await pv.fill('#k-obj', 'Soporte técnico de equipos.'); await pv.fill('#k-ini', isoHoy(0)); await pv.fill('#k-fin', isoHoy(-1)); await pv.fill('#k-monto', '1200.50'); await pv.click('#k-save'); await V.espera(120);
  ok('T19 el fin no puede ser anterior al inicio', (await pv.locator('.ti-ov [data-e=fin]').textContent()).includes('anterior'));
  await pv.fill('#k-fin', isoHoy(60)); await pv.click('#k-adddoc'); await pv.fill('.ti-ov [data-dk=titulo]', 'Contrato'); await pv.fill('.ti-ov [data-dk=url]', 'https://drive.google.com/c'); await pv.selectOption('#k-per', 'mensual');
  await pv.click('#k-save'); await pv.waitForSelector('.ti-ov .modal-footer', { timeout: 3000 }).catch(() => {}); await V.espera(300);
  await V.accion('enviar').click(); await V.espera(400);
  ok('T19 enviado a aprobación', (await pv.evaluate(() => window.__MOCK.store['ti_contratos/CTR-0001'])).estado === 'pendiente_aprobacion');
  ok('T19 el creador no puede aprobar su contrato pero sí cancelarlo', !(await habilV('aprobar')) && (await habilV('cancelar')));
  await V.cerrarModal(); await V.logout();

  await V.login(ADMIN); await V.ir('ti-proveedores'); await V.espera(300);
  const mk = async (c) => pv.locator('[data-kpi=' + c + '] .ti-kv').textContent();
  ok('T19 el Gerente ve 5 tarjetas con cifras exactas: 2 vigentes del seed + uno 52 por vencer', (await pv.locator('#view-ti-proveedores .ti-kpi').count()) === 5 && (await mk('vigentes')) === '3' && (await mk('porVencer')) === '1' && (await mk('vencidos')) === '1' && (await mk('sinDocumento')) === '1' && (await mk('pendientesAprobacion')) === '1', [await mk('vigentes'), await mk('porVencer'), await mk('vencidos'), await mk('sinDocumento'), await mk('pendientesAprobacion')]);
  const nota = await pv.locator('#view-ti-proveedores .ti-note').first().textContent();
  ok('T19 monto anual por moneda sin convertir (MXN 24,000 = 2 contratos mensuales de 1,000 × 12; USD 100)', nota.includes('24,000.00') && nota.includes('USD') && nota.includes('100'), nota);
  await pv.click('[data-kpi=vencidos]'); await V.espera(150);
  ok('T19 la tarjeta "Vencidos" filtra exactamente CTR-0051', (await V.filas()) === 1 && (await pv.locator('.ti-row').textContent()).includes('CTR-0051') && (await pv.locator('.ti-row').textContent()).includes('Vencido hace 5 d'));
  await pv.click('#pc-lim'); await V.espera(100);
  await V.abrirFila('CTR-0001'); ok('T19 el Gerente puede aprobar y rechazar', await habilV('aprobar') && await habilV('rechazar'));
  await V.accion('aprobar').click(); await V.espera(400);
  const apC = await pv.evaluate(() => window.__MOCK.store['ti_contratos/CTR-0001']);
  ok('T19 aprobado: vigente con aprobación del Gerente', apC.estado === 'vigente' && apC.aprobacion.por === ADMIN);
  ok('T19 un contrato vigente se puede renovar o dar por terminado (con motivo)', await habilV('renovar') && await habilV('terminar'));
  await V.accion('renovar').click(); await V.espera(250);
  ok('T19 renovar abre un borrador nuevo ligado al anterior con inicio al día siguiente del fin', (await pv.inputValue('#k-tit')).includes('(renovación)') && (await pv.inputValue('#k-ini')) === isoHoy(61));
  await pv.fill('#k-fin', isoHoy(425)); await pv.fill('#k-obj', 'Renovación'); await pv.fill('#k-monto', '1300'); await pv.click('#k-adddoc'); await pv.fill('.ti-ov [data-dk=titulo]', 'Contrato 2'); await pv.fill('.ti-ov [data-dk=url]', 'https://drive.google.com/c2');
  await pv.click('#k-save'); await pv.waitForSelector('.ti-ov .modal-footer', { timeout: 3000 }).catch(() => {}); await V.espera(300);
  const ren = await pv.evaluate(() => window.__MOCK.store['ti_contratos/CTR-0002']);
  ok('T19 la renovación es CTR-0002 en borrador, ligada a CTR-0001', ren && ren.estado === 'borrador' && ren.renovacionDe === 'CTR-0001', ren);
  await V.accion('enviar').click(); await V.espera(400);
  ok('T19 el Gerente creó la renovación: no puede aprobar su propio contrato', !(await habilV('aprobar')));
  await V.cerrarModal();
  // exportar
  const [descV] = await Promise.all([pv.waitForEvent('download', { timeout: 4000 }), pv.click('#pc-csv')]);
  const csvV = fs.readFileSync(await descV.path(), 'utf8');
  ok('T19 el CSV tiene encabezados en español, los contratos y la vigencia calculada', csvV.includes('Folio') && csvV.includes('CTR-0051') && csvV.includes('vencido'), csvV.slice(0, 150));
  // configuración
  await V.ir('ti-admin'); await V.espera(200); await pv.click('[data-t=proveedores]'); await V.espera(250);
  await pv.fill('#pv-aviso', '0'); await pv.click('#pv-guardar'); await V.espera(100);
  ok('T19 la ventana de aviso exige un valor válido', (await pv.locator('#pv-aviso-e').textContent()).length > 0);
  await pv.fill('#pv-aviso', '20'); await pv.click('#pv-guardar'); await V.espera(300);
  ok('T19 la ventana se guarda y queda en la auditoría', (await pv.evaluate(() => window.__MOCK.store['ti_config/proveedores'].avisoVencimientoDias)) === 20 && await pv.evaluate(() => Object.values(window.__MOCK.store).some((x) => x && x.accion === 'configurar_proveedores')));
  await V.logout(); await V.login(ADMIN); await V.ir('ti-proveedores'); await V.espera(300);
  ok('T19 con aviso de 20 días, el contrato que vence en 30 deja de estar "por vencer"', (await mk('porVencer')) === '0', await mk('porVencer'));
  await V.ir('ti-inicio'); await V.espera(300);
  const ctIni = await pv.locator('#s-ct').locator('xpath=ancestor::section').textContent();
  ok('T19 Inicio: sección de contratos con montos por moneda', ctIni.includes('Contratos vigentes') && ctIni.includes('Monto anual vigente') && ctIni.includes('USD'), ctIni.slice(0, 250));
  await V.logout(); await V.login(TEC); await V.ir('ti-proveedores'); await V.espera(300);
  const codsT = await pv.locator('#view-ti-proveedores .ti-row .ti-code').allTextContents();
  ok('T19 el otro consultor ve solo los suyos (CTR-0050, 0051 y 0052) y no los de otro', JSON.stringify(codsT.sort()) === JSON.stringify(['CTR-0050', 'CTR-0051', 'CTR-0052']), codsT);
  await V.logout(); await V.login(SOL); ok('T19 el solicitante no ve Proveedores y contratos', !(await V.visible('#tnav-ti-proveedores')));
  await V.logout(); await V.page.close();

  ok('Sin errores de JavaScript en toda la sesión', errores.length === 0, errores.slice(0, 5));
  await browser.close();
  const fallas = resultados.filter((r) => !r.ok);
  console.log('\nResumen: ' + (resultados.length - fallas.length) + '/' + resultados.length + ' pruebas correctas');
  process.exit(fallas.length ? 1 : 0);
})().catch((e) => { console.error('Error en las pruebas:', e); process.exit(2); });
