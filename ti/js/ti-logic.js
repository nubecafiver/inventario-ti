/* CAFIVER TI — Lógica pura de procesos y procedimientos.
   Sin Firebase ni DOM: se usa en el navegador (window.TI_LOGIC) y en las pruebas de Node (module.exports). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TI_LOGIC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ===== Roles y permisos ===== */
  var ROLES = {
    gerente:       'Gerente de TI',
    consultor:     'Consultor de TI',
    director:      'Director de TI',
    administrador: 'Administrador de la plataforma',
    resp_proceso:  'Responsable de proceso',
    tecnico:       'Técnico de TI',
    solicitante:   'Solicitante'
  };
  var PERMISOS_POR_ROL = {
    director:      ['procesos.ver', 'procesos.aprobar', 'procesos.publicar', 'auditoria.ver', 'inventario.resumen', 'tickets.crear', 'tickets.ver_propios', 'tickets.ver_todos', 'tickets.asignar'],
    administrador: ['procesos.ver', 'procesos.crear', 'procesos.editar_todos', 'procesos.publicar', 'procesos.catalogo', 'usuarios.admin', 'auditoria.ver', 'inventario.resumen', 'tickets.crear', 'tickets.ver_propios', 'tickets.ver_todos', 'tickets.asignar', 'tickets.atender', 'tickets.configurar'],
    resp_proceso:  ['procesos.ver', 'procesos.crear', 'procesos.editar_propios', 'tickets.crear', 'tickets.ver_propios'],
    tecnico:       ['procesos.ver_publicados', 'tickets.crear', 'tickets.ver_propios', 'tickets.ver_todos', 'tickets.atender'],
    solicitante:   ['tickets.crear', 'tickets.ver_propios']
  };
  /* Gerente de TI = todo lo del Administrador y del Director (unión calculada, no copiada). Consultor = Responsable de proceso
     + atender tickets (solo los asignados a él o los que nadie ha tomado). Los roles anteriores se conservan. */
  PERMISOS_POR_ROL.gerente = PERMISOS_POR_ROL.administrador.concat(PERMISOS_POR_ROL.director.filter(function (p) { return PERMISOS_POR_ROL.administrador.indexOf(p) < 0; }));
  PERMISOS_POR_ROL.consultor = PERMISOS_POR_ROL.resp_proceso.concat(['tickets.atender']);
  function permisos(roles) {
    var set = {};
    (roles || []).forEach(function (r) { (PERMISOS_POR_ROL[r] || []).forEach(function (p) { set[p] = true; }); });
    return set;
  }
  function tiene(user, permiso) { return !!(user && permisos(user.roles)[permiso]); }

  /* ===== Estados ===== */
  var ESTADOS = ['borrador', 'en_revision', 'pendiente_aprobacion', 'aprobado', 'publicado', 'en_revision_periodica', 'obsoleto'];
  var ESTADO_LABEL = {
    borrador: 'Borrador', en_revision: 'En revisión', pendiente_aprobacion: 'Pendiente de aprobación',
    aprobado: 'Aprobado', publicado: 'Publicado', en_revision_periodica: 'En revisión periódica',
    obsoleto: 'Obsoleto', reemplazada: 'Reemplazada'
  };
  function vigente(estado) { return estado === 'publicado' || estado === 'en_revision_periodica'; }

  /* ===== Visibilidad y edición ===== */
  function esPropietario(user, proceso) {
    if (!user || !proceso) return false;
    var e = user.email;
    return proceso.responsable === e || proceso.creadoPor === e || (proceso.participantes || []).indexOf(e) >= 0;
  }
  function puedeVer(user, proceso) {
    if (tiene(user, 'procesos.ver')) return true;
    if (tiene(user, 'procesos.ver_publicados')) return typeof proceso.versionPublicada === 'number' && proceso.versionPublicada > 0;
    return false;
  }
  function esEditor(user, proceso) {
    return tiene(user, 'procesos.editar_todos') || (tiene(user, 'procesos.editar_propios') && esPropietario(user, proceso));
  }

  /* ===== Contenido de una versión ===== */
  var CAMPOS_PASO = ['descripcion', 'responsable', 'sistema', 'entrada', 'resultado', 'evidencia', 'tiempo', 'excepciones'];
  function pasoVacio() { var p = {}; CAMPOS_PASO.forEach(function (c) { p[c] = ''; }); return p; }
  function contenidoVacio() {
    return {
      objetivo: '', alcance: '', descripcion: '', entradas: [], resultadosEsperados: [], sistemas: [],
      riesgos: [], controles: [], evidencias: [], indicadores: [], tiempoObjetivo: '',
      documentosRelacionados: [], pasos: []
    };
  }
  function lineas(texto) {
    return String(texto || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function urlSegura(u) {
    try { var x = new URL(String(u).trim()); return x.protocol === 'https:'; } catch (e) { return false; }
  }
  /* Errores de un borrador que se guarda (laxo) o se envía a revisión (estricto). */
  function validarContenido(c, estricto) {
    var e = {};
    (c.pasos || []).forEach(function (p, i) {
      if (!String(p.descripcion || '').trim()) e['paso' + i + '.descripcion'] = 'Escribe qué se hace en este paso.';
      if (!String(p.responsable || '').trim()) e['paso' + i + '.responsable'] = 'Indica quién lo hace.';
    });
    (c.documentosRelacionados || []).forEach(function (d, i) {
      if (!String(d.titulo || '').trim()) e['doc' + i + '.titulo'] = 'Escribe un título.';
      if (!urlSegura(d.url)) e['doc' + i + '.url'] = 'Usa un enlace https:// válido.';
    });
    if (estricto) {
      if (!String(c.objetivo || '').trim()) e.objetivo = 'El objetivo es obligatorio para enviar a revisión.';
      if (!String(c.alcance || '').trim()) e.alcance = 'El alcance es obligatorio para enviar a revisión.';
      if (!(c.pasos || []).length) e.pasos = 'Agrega al menos una actividad.';
    }
    return e;
  }
  /* "Documentado" = versión vigente con objetivo, alcance, responsable del proceso y ≥1 actividad. */
  function esDocumentado(proceso, contenido) {
    return !!(proceso && proceso.responsable && contenido &&
      String(contenido.objetivo || '').trim() && String(contenido.alcance || '').trim() &&
      (contenido.pasos || []).length > 0);
  }

  /* ===== Fechas ===== */
  function hoyISO(d) { return (d || new Date()).toISOString().slice(0, 10); }
  function sumarMeses(iso, n) {
    var p = iso.split('-').map(Number), y = p[0], m = p[1] - 1 + n, dia = p[2];
    var f = new Date(Date.UTC(y, m, 1)), ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
    f.setUTCDate(Math.min(dia, ultimo));
    return f.toISOString().slice(0, 10);
  }
  function sumarDias(iso, n) {
    var f = new Date(iso + 'T00:00:00Z'); f.setUTCDate(f.getUTCDate() + n); return f.toISOString().slice(0, 10);
  }

  /* ===== Acciones (máquina de estados) ===== */
  /* Cada acción actúa sobre la versión de trabajo. 'perm' es el permiso de rol; 'editor' exige ser editor del proceso. */
  var ACCIONES = {
    enviar_revision:      { label: 'Enviar a revisión',        desde: ['borrador'],                                   hacia: 'en_revision',           editor: true },
    solicitar_aprobacion: { label: 'Solicitar aprobación',     desde: ['en_revision'],                                hacia: 'pendiente_aprobacion',  editor: true },
    devolver:             { label: 'Devolver a borrador',      desde: ['en_revision'],                                hacia: 'borrador',              editor: true },
    aprobar:              { label: 'Aprobar',                  desde: ['pendiente_aprobacion'],                       hacia: 'aprobado',              perm: 'procesos.aprobar', segregacion: true },
    rechazar:             { label: 'Rechazar (con motivo)',    desde: ['pendiente_aprobacion'],                       hacia: 'borrador',              perm: 'procesos.aprobar', motivo: true },
    publicar:             { label: 'Publicar',                 desde: ['aprobado'],                                   hacia: 'publicado',             perm: 'procesos.publicar' },
    iniciar_revision:     { label: 'Iniciar revisión periódica', desde: ['publicado'],                                hacia: 'en_revision_periodica', editor: true, soloVigente: true },
    ratificar:            { label: 'Ratificar vigencia',       desde: ['en_revision_periodica'],                      hacia: 'publicado',             perm: 'procesos.publicar', soloVigente: true },
    nueva_version:        { label: 'Crear nueva versión',      desde: ['publicado', 'en_revision_periodica'],         hacia: 'borrador',              editor: true, soloVigente: true, crea: true },
    marcar_obsoleto:      { label: 'Marcar obsoleto (con motivo)', desde: ['aprobado', 'publicado', 'en_revision_periodica', 'borrador'], hacia: 'obsoleto', perm: 'procesos.publicar', motivo: true }
  };

  /* ctx: {user:{email,roles}, proceso, version}. Devuelve [{id,label,ok,motivo,requiereMotivo}] solo con las acciones
     que existen para el estado actual; las que el usuario no puede ejecutar vienen con ok:false y la razón. */
  function accionesDisponibles(ctx) {
    var u = ctx.user, p = ctx.proceso, v = ctx.version, out = [];
    if (!p || !v || v.numero !== p.versionTrabajo) return out;
    Object.keys(ACCIONES).forEach(function (id) {
      var a = ACCIONES[id];
      if (a.desde.indexOf(v.estado) < 0) return;
      if (a.soloVigente && p.versionPublicada !== v.numero) return;
      var ok = true, motivo = '';
      if (a.editor && !esEditor(u, p)) { ok = false; motivo = 'Solo quien edita este proceso puede hacerlo.'; }
      if (a.perm && !tiene(u, a.perm)) { ok = false; motivo = a.perm === 'procesos.aprobar' ? 'Solo el Director de TI puede aprobar o rechazar.' : 'Tu rol no tiene permiso para esta acción.'; }
      if (ok && a.segregacion && (v.editores || []).indexOf(u.email) >= 0) { ok = false; motivo = 'Segregación de funciones: quien editó la versión no puede aprobarla.'; }
      out.push({ id: id, label: a.label, ok: ok, motivo: motivo, requiereMotivo: !!a.motivo });
    });
    return out;
  }

  /* Calcula los cambios que produce una acción. No toca ninguna base de datos: devuelve qué escribir.
     Lanza Error si la acción no es válida para el estado dado (revalidación dentro de la transacción). */
  function aplicarAccion(ctx, accionId, opciones) {
    opciones = opciones || {};
    var disp = accionesDisponibles(ctx).filter(function (x) { return x.id === accionId; })[0];
    if (!disp) throw new Error('La acción "' + accionId + '" no es válida para el estado actual.');
    if (!disp.ok) throw new Error(disp.motivo);
    var a = ACCIONES[accionId], p = ctx.proceso, v = ctx.version, u = ctx.user, hoy = opciones.hoy || hoyISO();
    if (a.motivo && !String(opciones.motivo || '').trim()) throw new Error('El motivo es obligatorio.');
    if (accionId === 'enviar_revision') {
      var err = validarContenido(v.contenido, true);
      if (Object.keys(err).length) { var e2 = new Error('El borrador está incompleto.'); e2.detalle = err; throw e2; }
    }
    var cambios = {
      version: { estado: a.hacia },
      proceso: { estado: a.hacia },
      nuevaVersion: null,
      versionAnterior: null,
      motivo: opciones.motivo || ''
    };
    if (accionId === 'aprobar') cambios.version.aprobacion = { por: u.email, fecha: hoy, comentario: opciones.comentario || '' };
    if (accionId === 'rechazar' || accionId === 'devolver') { cambios.version.aprobacion = null; if (accionId === 'rechazar') cambios.version.motivoRechazo = opciones.motivo; }
    if (accionId === 'publicar') {
      cambios.version.publicadoPor = u.email; cambios.version.publicadoEn = hoy;
      cambios.proceso.versionPublicada = v.numero;
      cambios.proceso.proximaRevision = sumarMeses(hoy, p.periodoRevisionMeses || 12);
      cambios.proceso.documentado = esDocumentado(p, v.contenido);
      if (p.versionPublicada && p.versionPublicada !== v.numero) cambios.versionAnterior = { numero: p.versionPublicada, estado: 'reemplazada' };
    }
    if (accionId === 'ratificar') cambios.proceso.proximaRevision = sumarMeses(hoy, p.periodoRevisionMeses || 12);
    if (accionId === 'marcar_obsoleto') { cambios.version.motivoObsolescencia = opciones.motivo; cambios.proceso.versionPublicada = null; cambios.proceso.proximaRevision = null; cambios.proceso.documentado = false; }
    if (a.crea) {
      var nuevo = v.numero + 1;
      cambios.version = {};      /* la versión actual no cambia: se conserva tal cual */
      cambios.proceso = { estado: 'borrador', versionTrabajo: nuevo };
      cambios.nuevaVersion = { numero: nuevo, estado: 'borrador', contenido: JSON.parse(JSON.stringify(v.contenido)), editores: [u.email], creadoPor: u.email, basadaEn: v.numero };
    }
    return cambios;
  }

  /* ===== Indicadores (fórmulas documentadas en docs/PLATAFORMA.md) ===== */
  var MIN_MUESTRA = 5, VENTANA_DIAS = 30;
  function indicadores(procesos, hoy, ventana) {
    hoy = hoy || hoyISO(); ventana = ventana || VENTANA_DIAS;
    var limite = sumarDias(hoy, ventana);
    var activos = procesos.filter(function (p) { return p.estado !== 'obsoleto'; });
    function vig(p) { return vigente(p.estado) || (typeof p.versionPublicada === 'number' && p.versionPublicada > 0); }
    var documentados = activos.filter(function (p) { return vig(p) && p.documentado === true; }).length;
    var n = activos.length;
    return {
      registrados: n,
      documentados: documentados,
      porcentajeDocumentados: n >= MIN_MUESTRA ? Math.round(documentados / n * 100) : null,   // null = muestra insuficiente
      muestraMinima: MIN_MUESTRA,
      enRevision: procesos.filter(function (p) { return p.estado === 'en_revision'; }).length,
      pendientesAprobacion: procesos.filter(function (p) { return p.estado === 'pendiente_aprobacion'; }).length,
      publicados: procesos.filter(vig).length,
      proximosRevision: procesos.filter(function (p) { return vig(p) && p.proximaRevision && p.proximaRevision >= hoy && p.proximaRevision <= limite; }).length,
      revisionVencida: procesos.filter(function (p) { return vig(p) && p.proximaRevision && p.proximaRevision < hoy; }).length,
      sinRespaldo: activos.filter(function (p) { return !(p.participantes || []).length; }).length
    };
  }
  /* ===== Indicadores del inventario (solo lectura de `equipos`; no se modifica el inventario) =====
     Campos usados: estado (Bueno/Regular/Malo/Baja), responsable (texto), fecha (de compra, AAAA-MM-DD).
     Base de todos los cálculos salvo "dados de baja": equipos ACTIVOS = estado distinto de "Baja".
     Vida útil: misma regla que la app de inventario (VIDA_UTIL = 4 años): vencida ≥ 4, próxima ≥ 3 y < 4, vigente < 3.
     Equipos sin fecha de compra válida se cuentan aparte ("sinFecha"); nunca se mezclan con los demás.
     Los porcentajes solo se calculan con ≥ MIN_MUESTRA equipos activos; con menos son null. */
  var VIDA_UTIL_ANIOS = 4;
  function aniosDesde(fecha, hoy) {
    if (fecha == null || String(fecha).trim() === '') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha).trim()); if (!m) return null;
    var d = Date.UTC(+m[1], +m[2] - 1, +m[3]), h = Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10));
    if (isNaN(d) || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return null;
    return (h - d) / (1000 * 60 * 60 * 24 * 365.25);
  }
  function indicadoresInventario(equipos, hoy) {
    hoy = hoy || hoyISO();
    var r = { total: 0, activos: 0, dadosDeBaja: 0, conResponsable: 0, sinResponsable: 0,
      bueno: 0, regular: 0, malo: 0, sinEstado: 0, vidaVencida: 0, vidaProxima: 0, vidaVigente: 0, sinFecha: 0,
      pctConResponsable: null, pctBueno: null, muestraMinima: MIN_MUESTRA, vidaUtilAnios: VIDA_UTIL_ANIOS };
    (equipos || []).forEach(function (e) {
      r.total++;
      var estado = String((e && e.estado) || '').trim();
      if (estado === 'Baja') { r.dadosDeBaja++; return; }
      r.activos++;
      if (String((e && e.responsable) || '').trim()) r.conResponsable++; else r.sinResponsable++;
      if (estado === 'Bueno') r.bueno++; else if (estado === 'Regular') r.regular++; else if (estado === 'Malo') r.malo++; else r.sinEstado++;
      var a = aniosDesde(e && e.fecha, hoy);
      if (a === null) r.sinFecha++; else if (a >= VIDA_UTIL_ANIOS) r.vidaVencida++; else if (a >= VIDA_UTIL_ANIOS - 1) r.vidaProxima++; else r.vidaVigente++;
    });
    if (r.activos >= MIN_MUESTRA) { r.pctConResponsable = Math.round(r.conResponsable / r.activos * 100); r.pctBueno = Math.round(r.bueno / r.activos * 100); }
    return r;
  }


  /* =====================================================================================================
     MESA DE AYUDA (tickets). Lógica pura: prioridad, estados, acciones, SLA y indicadores.
     Los tiempos son milisegundos (Date.now()). Los cálculos de horario laboral usan la hora local del equipo.
     Los SLA NO vienen definidos: el administrador los configura; sin configuración, el SLA es "no configurado".
     ===================================================================================================== */
  var TIPOS_TICKET = { incidente: 'Incidente', solicitud: 'Solicitud de servicio' };
  var ESTADOS_TICKET = ['nuevo', 'asignado', 'en_atencion', 'espera_usuario', 'espera_tercero', 'resuelto', 'cerrado', 'cancelado'];
  var TICKET_ESTADO_LABEL = { nuevo: 'Nuevo', asignado: 'Asignado', en_atencion: 'En atención', espera_usuario: 'En espera del usuario', espera_tercero: 'En espera de un tercero', resuelto: 'Resuelto', cerrado: 'Cerrado', cancelado: 'Cancelado' };
  var TICKET_ABIERTOS = ['nuevo', 'asignado', 'en_atencion', 'espera_usuario', 'espera_tercero'];
  var PRIORIDADES = ['critica', 'alta', 'media', 'baja'];
  var PRIORIDAD_LABEL = { critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja' };
  var IMPACTOS = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' };
  var URGENCIAS = { alta: 'Alta', media: 'Media', baja: 'Baja' };
  /* Matriz impacto × urgencia (convención ITIL, no un compromiso de CAFIVER). */
  var MATRIZ_PRIORIDAD = { alto: { alta: 'critica', media: 'alta', baja: 'media' }, medio: { alta: 'alta', media: 'media', baja: 'baja' }, bajo: { alta: 'media', media: 'baja', baja: 'baja' } };
  function prioridadDe(impacto, urgencia) { return (MATRIZ_PRIORIDAD[impacto] || {})[urgencia] || null; }
  var CATEGORIAS_TICKET_INICIALES = [['sap', 'SAP'], ['computadoras', 'Computadoras'], ['impresoras', 'Impresoras'], ['redes', 'Redes'], ['google-cloud', 'Google Cloud'], ['aplicaciones', 'Aplicaciones'], ['accesos', 'Accesos'], ['correo', 'Correo y colaboración'], ['seguridad', 'Seguridad'], ['general', 'Solicitudes generales']];
  /* Configuración inicial: categorías sugeridas (editables), SIN SLA y SIN horario. Parámetros editables, no plazos oficiales. */
  function configTicketsPorDefecto() {
    return { categorias: CATEGORIAS_TICKET_INICIALES.map(function (c) { return { id: c[0], nombre: c[1], activa: true }; }), sla: {}, horario: null, ventanaReaperturaDias: 5, alertaPct: 25 };
  }
  function normalizarConfigTickets(c) {
    var d = configTicketsPorDefecto(); c = c || {};
    return { categorias: Array.isArray(c.categorias) && c.categorias.length ? c.categorias : d.categorias, sla: c.sla || {}, horario: c.horario && Array.isArray(c.horario.dias) ? c.horario : null,
      ventanaReaperturaDias: typeof c.ventanaReaperturaDias === 'number' ? c.ventanaReaperturaDias : d.ventanaReaperturaDias, alertaPct: typeof c.alertaPct === 'number' ? c.alertaPct : d.alertaPct };
  }
  function slugCategoria(nombre) { return String(nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }
  function nombreCategoria(cfg, id) { var c = (cfg.categorias || []).filter(function (x) { return x.id === id; })[0]; return c ? c.nombre : (id || '—'); }
  function puedeVerTicket(user, t) {
    if (tiene(user, 'tickets.ver_todos')) return true;
    if (tiene(user, 'tickets.ver_propios') && t.solicitanteEmail === user.email) return true;
    /* Quien atiende sin ver todo (Consultor): los que tiene asignados y los nuevos sin responsable. */
    return tiene(user, 'tickets.atender') && (t.responsable === user.email || (!t.responsable && t.estado === 'nuevo'));
  }
  function esTI(user) { return tiene(user, 'tickets.ver_todos') || tiene(user, 'tickets.atender') || tiene(user, 'tickets.asignar'); }

  /* ----- Tiempo laboral ----- */
  function hmAMin(s) { var p = String(s || '').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function horarioValido(h) { return !!(h && Array.isArray(h.dias) && h.dias.length && hmAMin(h.fin) > hmAMin(h.inicio)); }
  /* Milisegundos de servicio entre dos instantes. Sin horario (null): tiempo natural 24×7. */
  function msLaborales(desde, hasta, horario) {
    if (!(hasta > desde)) return 0;
    if (!horario) return hasta - desde;
    if (!horarioValido(horario)) return 0;
    var ini = hmAMin(horario.inicio), fin = hmAMin(horario.fin), total = 0, d = new Date(desde);
    d.setHours(0, 0, 0, 0);
    for (var n = 0; d.getTime() < hasta && n < 4000; n++) {
      if (horario.dias.indexOf(d.getDay()) >= 0) {
        var a = new Date(d); a.setHours(Math.floor(ini / 60), ini % 60, 0, 0);
        var b = new Date(d); b.setHours(Math.floor(fin / 60), fin % 60, 0, 0);
        var x = Math.max(a.getTime(), desde), y = Math.min(b.getTime(), hasta);
        if (y > x) total += y - x;
      }
      d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0);
    }
    return total;
  }
  /* Tiempo de servicio transcurrido descontando los periodos "en espera" (del usuario o de un tercero). */
  function msEfectivos(creadoMs, finMs, esperas, horario, ahoraMs) {
    var total = msLaborales(creadoMs, finMs, horario);
    (esperas || []).forEach(function (e) {
      var d = Math.max(e.desde, creadoMs), h = Math.min(e.hasta == null ? ahoraMs : e.hasta, finMs);
      if (h > d) total -= msLaborales(d, h, horario);
    });
    return Math.max(0, total);
  }
  /* Instante en que se cumple el objetivo (horas de servicio efectivas), descontando las esperas. */
  function fechaObjetivoMs(t, horas, horario, ahoraMs) {
    var meta = horas * 3600000, lo = t.creadoMs, hi = t.creadoMs + meta * 25 + 120 * 86400000;
    for (var i = 0; i < 64 && lo < hi; i++) {
      var mid = Math.floor((lo + hi) / 2);
      if (msEfectivos(t.creadoMs, mid, t.esperas, horario, ahoraMs) >= meta) hi = mid; else lo = mid + 1;
    }
    return hi;
  }
  function slaDe(cfg, t) {
    var s = ((cfg && cfg.sla) || {})[t.categoria + '|' + t.prioridad];
    if (!s) return null;
    var r = +s.respuestaH > 0 ? +s.respuestaH : 0, x = +s.resolucionH > 0 ? +s.resolucionH : 0;
    return (r || x) ? { respuestaH: r, resolucionH: x } : null;
  }
  /* Estado del SLA de un ticket. Estados: cumplido, incumplido, en_curso, por_vencer, vencido, na (sin SLA). */
  function estadoSLA(t, cfg, ahoraMs) {
    var sla = slaDe(cfg, t), out = { configurado: !!sla, respuesta: { estado: 'na' }, resolucion: { estado: 'na' }, pausado: false };
    if (!sla || t.estado === 'cancelado' || !t.creadoMs) return out;
    var horario = horarioValido(cfg.horario) ? cfg.horario : null, alerta = (typeof cfg.alertaPct === 'number' ? cfg.alertaPct : 25) / 100;
    var abierto = TICKET_ABIERTOS.indexOf(t.estado) >= 0;
    out.pausado = abierto && (t.esperas || []).some(function (e) { return e.hasta == null; });
    function clasificar(restante, meta) { return restante < 0 ? 'vencido' : (restante <= meta * alerta ? 'por_vencer' : 'en_curso'); }
    if (sla.respuestaH) {
      var m1 = sla.respuestaH * 3600000;
      if (t.primeraRespuestaMs) { var e1 = msLaborales(t.creadoMs, t.primeraRespuestaMs, horario); out.respuesta = { estado: e1 <= m1 ? 'cumplido' : 'incumplido', transcurridoMs: e1, metaMs: m1 }; }
      else if (abierto) { var r1 = m1 - msLaborales(t.creadoMs, ahoraMs, horario); out.respuesta = { estado: clasificar(r1, m1), restanteMs: r1, metaMs: m1, objetivoMs: fechaObjetivoMs({ creadoMs: t.creadoMs, esperas: [] }, sla.respuestaH, horario, ahoraMs) }; }
    }
    if (sla.resolucionH) {
      var m2 = sla.resolucionH * 3600000;
      if (t.resueltoMs && (t.estado === 'resuelto' || t.estado === 'cerrado')) { var e2 = msEfectivos(t.creadoMs, t.resueltoMs, t.esperas, horario, t.resueltoMs); out.resolucion = { estado: e2 <= m2 ? 'cumplido' : 'incumplido', transcurridoMs: e2, metaMs: m2 }; }
      else if (abierto) {
        var r2 = m2 - msEfectivos(t.creadoMs, ahoraMs, t.esperas, horario, ahoraMs);
        out.resolucion = { estado: clasificar(r2, m2), restanteMs: r2, metaMs: m2 };
        if (!out.pausado) out.resolucion.objetivoMs = fechaObjetivoMs(t, sla.resolucionH, horario, ahoraMs);
      }
    }
    return out;
  }

  /* ----- Acciones sobre un ticket (máquina de estados) ----- */
  function esSolicitante(u, t) { return !!u && t.solicitanteEmail === u.email; }
  function atiende(u, t) { return tiene(u, 'tickets.atender') && (tiene(u, 'tickets.configurar') || t.responsable === u.email); }
  var NEGAR_ATENDER = 'Solo quien tiene asignado el ticket (o el administrador) puede hacerlo.';
  /* audiencia: 'ti' (equipo de TI) o 'solicitante'. regla(u,t,cfg,ahora) devuelve null si se puede, o el motivo. */
  var ACCIONES_TICKET = {
    tomar:             { label: 'Tomar el ticket', audiencia: 'ti', desde: ['nuevo'], regla: function (u, t) { return !tiene(u, 'tickets.atender') ? 'Solo el equipo técnico puede atender tickets.' : (t.responsable ? 'El ticket ya tiene responsable.' : null); } },
    asignar:           { label: 'Asignar / reasignar', audiencia: 'ti', desde: ['nuevo', 'asignado', 'en_atencion', 'espera_usuario', 'espera_tercero'], requiere: ['responsable'], regla: function (u) { return tiene(u, 'tickets.asignar') ? null : 'Solo el Director o el Administrador asignan tickets.'; } },
    iniciar_atencion:  { label: 'Iniciar atención', audiencia: 'ti', desde: ['asignado'], regla: function (u, t) { return atiende(u, t) ? null : NEGAR_ATENDER; } },
    esperar_usuario:   { label: 'En espera del usuario', audiencia: 'ti', desde: ['en_atencion'], requiere: ['motivo'], regla: function (u, t) { return atiende(u, t) ? null : NEGAR_ATENDER; } },
    esperar_tercero:   { label: 'En espera de un tercero', audiencia: 'ti', desde: ['en_atencion'], requiere: ['motivo'], regla: function (u, t) { return atiende(u, t) ? null : NEGAR_ATENDER; } },
    reanudar:          { label: 'Reanudar atención', audiencia: 'ti', desde: ['espera_usuario', 'espera_tercero'], regla: function (u, t) { return atiende(u, t) ? null : NEGAR_ATENDER; } },
    resolver:          { label: 'Marcar como resuelto', audiencia: 'ti', desde: ['en_atencion'], requiere: ['diagnostico', 'solucion'], regla: function (u, t) { return atiende(u, t) ? null : NEGAR_ATENDER; } },
    cerrar:            { label: 'Cerrar sin confirmación', audiencia: 'ti', desde: ['resuelto'], requiere: ['motivo'], regla: function (u, t) { return atiende(u, t) ? null : NEGAR_ATENDER; } },
    escalar:           { label: 'Escalar', audiencia: 'ti', desde: ['asignado', 'en_atencion', 'espera_usuario', 'espera_tercero'], requiere: ['responsable', 'motivo'], regla: function (u, t) { return atiende(u, t) ? null : NEGAR_ATENDER; } },
    cambiar_prioridad: { label: 'Cambiar prioridad', audiencia: 'ti', desde: ['nuevo', 'asignado', 'en_atencion', 'espera_usuario', 'espera_tercero'], requiere: ['impacto', 'urgencia', 'motivo'], regla: function (u, t) { return (atiende(u, t) || tiene(u, 'tickets.asignar')) ? null : NEGAR_ATENDER; } },
    cancelar_ti:       { label: 'Cancelar ticket', audiencia: 'ti', desde: ['nuevo', 'asignado', 'en_atencion', 'espera_usuario', 'espera_tercero'], requiere: ['motivo'], regla: function (u) { return tiene(u, 'tickets.configurar') ? null : 'Solo el Administrador puede cancelar tickets ajenos.'; } },
    reabrir_ti:        { label: 'Reabrir', audiencia: 'ti', desde: ['resuelto', 'cerrado'], requiere: ['motivo'], regla: function (u, t, cfg, ahora) { return !atiende(u, t) ? NEGAR_ATENDER : ventanaReapertura(t, cfg, ahora); } },
    responder:         { label: 'Responder y reanudar', audiencia: 'solicitante', desde: ['espera_usuario'], requiere: ['motivo'], regla: function (u, t) { return esSolicitante(u, t) ? null : 'Solo quien creó el ticket puede responder.'; } },
    confirmar:         { label: 'Confirmar solución y cerrar', audiencia: 'solicitante', desde: ['resuelto'], regla: function (u, t) { return esSolicitante(u, t) ? null : 'Solo quien creó el ticket puede confirmar.'; } },
    reabrir:           { label: 'No quedó resuelto: reabrir', audiencia: 'solicitante', desde: ['resuelto', 'cerrado'], requiere: ['motivo'], regla: function (u, t, cfg, ahora) { return !esSolicitante(u, t) ? 'Solo quien creó el ticket puede reabrirlo.' : ventanaReapertura(t, cfg, ahora); } },
    cancelar:          { label: 'Cancelar mi solicitud', audiencia: 'solicitante', desde: ['nuevo'], requiere: ['motivo'], regla: function (u, t) { return esSolicitante(u, t) ? null : 'Solo quien creó el ticket puede cancelarlo.'; } }
  };
  function ventanaReapertura(t, cfg, ahora) {
    var dias = (cfg && typeof cfg.ventanaReaperturaDias === 'number') ? cfg.ventanaReaperturaDias : 5, ref = t.cerradoMs || t.resueltoMs;
    if (!ref) return null;
    return (ahora - ref) <= dias * 86400000 ? null : 'Ya pasaron más de ' + dias + ' días desde la resolución: crea un ticket nuevo.';
  }
  function accionesTicketDisponibles(ctx) {
    var u = ctx.user, t = ctx.ticket, cfg = normalizarConfigTickets(ctx.config), ahora = ctx.ahora || Date.now(), out = [];
    var ti = esTI(u), sol = esSolicitante(u, t);
    Object.keys(ACCIONES_TICKET).forEach(function (id) {
      var a = ACCIONES_TICKET[id];
      if (a.desde.indexOf(t.estado) < 0) return;
      if (a.audiencia === 'ti' && !ti) return;
      if (a.audiencia === 'solicitante' && !sol) return;
      var motivo = a.regla(u, t, cfg, ahora);
      out.push({ id: id, label: a.label, ok: !motivo, motivo: motivo || '', requiere: a.requiere || [] });
    });
    return out;
  }
  function texto(x) { return String(x == null ? '' : x).trim(); }
  /* Devuelve qué cambia (campos del ticket, entrada de historial y comentario opcional). Lanza Error si no es válida. */
  function aplicarAccionTicket(ctx, id, datos) {
    datos = datos || {};
    var u = ctx.user, t = ctx.ticket, cfg = normalizarConfigTickets(ctx.config), ahora = ctx.ahora || Date.now();
    var disp = accionesTicketDisponibles(ctx).filter(function (x) { return x.id === id; })[0];
    if (!disp) throw new Error('La acción no es válida para el estado actual del ticket.');
    if (!disp.ok) throw new Error(disp.motivo);
    var a = ACCIONES_TICKET[id], faltan = [];
    (a.requiere || []).forEach(function (k) { if (!texto(datos[k])) faltan.push(k); });
    if (faltan.length) { var e = new Error('Faltan datos obligatorios: ' + faltan.join(', ') + '.'); e.faltan = faltan; throw e; }
    var c = {}, detalle = a.label, esperas = (t.esperas || []).map(function (x) { return { desde: x.desde, hasta: x.hasta, tipo: x.tipo }; }), comentario = null;
    function cerrarEspera() { esperas.forEach(function (x) { if (x.hasta == null) x.hasta = ahora; }); }
    function marcarRespuesta() { if (!t.primeraRespuestaMs) c.primeraRespuestaMs = ahora; }
    switch (id) {
      case 'tomar': c.responsable = u.email; c.estado = 'asignado'; detalle = 'Tomado por ' + u.email; break;
      case 'asignar': c.responsable = texto(datos.responsable); if (t.estado === 'nuevo') c.estado = 'asignado'; detalle = (t.responsable ? 'Reasignado' : 'Asignado') + ' a ' + c.responsable; break;
      case 'iniciar_atencion': c.estado = 'en_atencion'; marcarRespuesta(); detalle = 'Atención iniciada'; break;
      case 'esperar_usuario': c.estado = 'espera_usuario'; esperas.push({ desde: ahora, hasta: null, tipo: 'usuario' }); c.esperas = esperas; marcarRespuesta(); detalle = 'En espera del usuario'; break;
      case 'esperar_tercero': c.estado = 'espera_tercero'; esperas.push({ desde: ahora, hasta: null, tipo: 'tercero' }); c.esperas = esperas; marcarRespuesta(); detalle = 'En espera de un tercero'; break;
      case 'reanudar': c.estado = 'en_atencion'; cerrarEspera(); c.esperas = esperas; detalle = 'Atención reanudada'; break;
      case 'resolver': c.estado = 'resuelto'; c.resueltoMs = ahora; c.diagnostico = texto(datos.diagnostico); c.solucion = texto(datos.solucion); marcarRespuesta(); detalle = 'Marcado como resuelto'; break;
      case 'cerrar': c.estado = 'cerrado'; c.cerradoMs = ahora; detalle = 'Cerrado por TI sin confirmación del solicitante'; break;
      case 'escalar': c.responsable = texto(datos.responsable); c.escaladoNivel = (t.escaladoNivel || 0) + 1; c.escaladoA = c.responsable; c.escaladoMotivo = texto(datos.motivo); detalle = 'Escalado (nivel ' + c.escaladoNivel + ') a ' + c.responsable; break;
      case 'cambiar_prioridad': {
        var pr = prioridadDe(texto(datos.impacto), texto(datos.urgencia));
        if (!pr) throw new Error('Impacto o urgencia no válidos.');
        c.impacto = texto(datos.impacto); c.urgencia = texto(datos.urgencia); c.prioridad = pr; detalle = 'Prioridad ' + PRIORIDAD_LABEL[t.prioridad] + ' → ' + PRIORIDAD_LABEL[pr]; break;
      }
      case 'cancelar': case 'cancelar_ti': c.estado = 'cancelado'; cerrarEspera(); c.esperas = esperas; detalle = 'Ticket cancelado'; break;
      case 'responder': c.estado = 'en_atencion'; cerrarEspera(); c.esperas = esperas; comentario = { texto: texto(datos.motivo), interno: false }; detalle = 'El solicitante respondió'; break;
      case 'confirmar': c.estado = 'cerrado'; c.cerradoMs = ahora; c.confirmacion = { por: u.email, fecha: ahora, ok: true }; detalle = 'Solución confirmada por el solicitante'; break;
      case 'reabrir': case 'reabrir_ti': c.estado = 'en_atencion'; c.resueltoMs = null; c.cerradoMs = null; c.confirmacion = null; c.reaperturas = (t.reaperturas || 0) + 1; detalle = 'Ticket reabierto (' + c.reaperturas + ')'; break;
      default: throw new Error('Acción desconocida.');
    }
    return { cambios: c, historial: { accion: id, detalle: detalle, motivo: texto(datos.motivo) }, comentario: comentario };
  }
  function validarTicketNuevo(d, cfg) {
    var e = {};
    if (!texto(d.titulo)) e.titulo = 'Escribe un título breve.'; else if (texto(d.titulo).length > 200) e.titulo = 'Máximo 200 caracteres.';
    if (!texto(d.descripcion)) e.descripcion = 'Describe qué ocurre o qué necesitas.'; else if (texto(d.descripcion).length > 5000) e.descripcion = 'Máximo 5,000 caracteres.';
    if (!TIPOS_TICKET[d.tipo]) e.tipo = 'Elige el tipo.';
    var cat = ((cfg && cfg.categorias) || []).filter(function (x) { return x.id === d.categoria && x.activa !== false; })[0];
    if (!cat) e.categoria = 'Elige una categoría.';
    if (!IMPACTOS[d.impacto]) e.impacto = 'Elige el impacto.';
    if (!URGENCIAS[d.urgencia]) e.urgencia = 'Elige la urgencia.';
    (d.evidencias || []).forEach(function (x, i) { if (!texto(x.titulo)) e['ev' + i + '.titulo'] = 'Escribe un título.'; if (!urlSegura(x.url)) e['ev' + i + '.url'] = 'Usa un enlace https:// válido.'; });
    if (texto(d.activoId) && !/^[A-Za-z0-9_-]{3,40}$/.test(texto(d.activoId))) e.activoId = 'El ID del equipo solo lleva letras, números y guiones.';
    return e;
  }

  /* ----- Indicadores de la mesa de ayuda ----- */
  var VENTANA_TICKETS_DIAS = 90;
  function clasificarTicket(t, cfg, ahora) {
    var abierto = TICKET_ABIERTOS.indexOf(t.estado) >= 0, s = estadoSLA(t, cfg, ahora);
    return { abierto: abierto, critico: abierto && t.prioridad === 'critica', sinAsignar: abierto && !t.responsable,
      vencido: abierto && (s.respuesta.estado === 'vencido' || s.resolucion.estado === 'vencido'),
      porVencer: abierto && !(s.respuesta.estado === 'vencido' || s.resolucion.estado === 'vencido') && (s.respuesta.estado === 'por_vencer' || s.resolucion.estado === 'por_vencer'), sla: s };
  }
  function indicadoresTickets(tickets, config, ahora) {
    var cfg = normalizarConfigTickets(config); ahora = ahora || Date.now();
    var r = { abiertos: 0, criticos: 0, sinAsignar: 0, vencidos: 0, porVencer: 0, porResponsable: {}, resueltosEnPeriodo: 0, tiempoMedioResolucionHoras: null, cumplimientoSLA: null, evaluablesSLA: 0, cumplidosSLA: 0, muestraMinima: MIN_MUESTRA, ventanaDias: VENTANA_TICKETS_DIAS, slaConfigurado: Object.keys(cfg.sla || {}).length > 0 };
    var desde = ahora - VENTANA_TICKETS_DIAS * 86400000, tiempos = [];
    (tickets || []).forEach(function (t) {
      var k = clasificarTicket(t, cfg, ahora);
      if (k.abierto) { r.abiertos++; var quien = t.responsable || '(sin asignar)'; r.porResponsable[quien] = (r.porResponsable[quien] || 0) + 1; }
      if (k.critico) r.criticos++; if (k.sinAsignar) r.sinAsignar++; if (k.vencido) r.vencidos++; if (k.porVencer) r.porVencer++;
      if ((t.estado === 'resuelto' || t.estado === 'cerrado') && t.resueltoMs && t.creadoMs && t.resueltoMs >= desde) {
        r.resueltosEnPeriodo++;
        var espera = 0; (t.esperas || []).forEach(function (e) { var h = e.hasta == null ? t.resueltoMs : Math.min(e.hasta, t.resueltoMs); if (h > e.desde) espera += h - e.desde; });
        tiempos.push(Math.max(0, t.resueltoMs - t.creadoMs - espera));
        if (k.sla.configurado && k.sla.resolucion.estado !== 'na') { r.evaluablesSLA++; if (k.sla.resolucion.estado === 'cumplido') r.cumplidosSLA++; }
      }
    });
    if (tiempos.length >= MIN_MUESTRA) r.tiempoMedioResolucionHoras = Math.round(tiempos.reduce(function (a, b) { return a + b; }, 0) / tiempos.length / 3600000 * 10) / 10;
    if (r.evaluablesSLA >= MIN_MUESTRA) r.cumplimientoSLA = Math.round(r.cumplidosSLA / r.evaluablesSLA * 100);
    return r;
  }
  function filtroTickets(clave, config, ahora) {
    var cfg = normalizarConfigTickets(config); ahora = ahora || Date.now();
    var f = {
      abiertos: function (t) { return TICKET_ABIERTOS.indexOf(t.estado) >= 0; },
      criticos: function (t) { return clasificarTicket(t, cfg, ahora).critico; },
      sinAsignar: function (t) { return clasificarTicket(t, cfg, ahora).sinAsignar; },
      vencidos: function (t) { return clasificarTicket(t, cfg, ahora).vencido; },
      porVencer: function (t) { return clasificarTicket(t, cfg, ahora).porVencer; }
    };
    return f[clave] || null;
  }

  /* Filtro de la tabla correspondiente a cada tarjeta, para "navegar hasta los registros que la componen". */
  function filtroIndicador(clave, hoy, ventana) {
    hoy = hoy || hoyISO(); var limite = sumarDias(hoy, ventana || VENTANA_DIAS);
    function vig(p) { return vigente(p.estado) || (typeof p.versionPublicada === 'number' && p.versionPublicada > 0); }
    var f = {
      registrados: function (p) { return p.estado !== 'obsoleto'; },
      documentados: function (p) { return p.estado !== 'obsoleto' && vig(p) && p.documentado === true; },
      enRevision: function (p) { return p.estado === 'en_revision'; },
      pendientesAprobacion: function (p) { return p.estado === 'pendiente_aprobacion'; },
      publicados: vig,
      proximosRevision: function (p) { return vig(p) && p.proximaRevision && p.proximaRevision >= hoy && p.proximaRevision <= limite; },
      revisionVencida: function (p) { return vig(p) && p.proximaRevision && p.proximaRevision < hoy; },
      sinRespaldo: function (p) { return p.estado !== 'obsoleto' && !(p.participantes || []).length; }
    };
    return f[clave] || null;
  }

  /* ===== Catálogo inicial: solo nombres y categoría. No se inventa ningún procedimiento. ===== */
  var CATEGORIAS = ['Accesos', 'Servicio', 'Cambios', 'SAP', 'Activos', 'Proveedores', 'Proyectos', 'Continuidad', 'Infraestructura', 'Seguridad', 'Datos', 'Documentación', 'Personal', 'Otra'];
  var CATALOGO_INICIAL = [
    ['Administración de usuarios y accesos', 'Accesos'], ['Gestión de incidentes', 'Servicio'], ['Gestión de solicitudes', 'Servicio'],
    ['Gestión de problemas recurrentes', 'Servicio'], ['Gestión de cambios', 'Cambios'], ['Gestión de transportes SAP', 'SAP'],
    ['Administración de activos', 'Activos'], ['Administración de licencias', 'Activos'], ['Gestión de proveedores', 'Proveedores'],
    ['Administración de contratos', 'Proveedores'], ['Gestión de proyectos', 'Proyectos'], ['Gestión de respaldos', 'Continuidad'],
    ['Continuidad operativa', 'Continuidad'], ['Gestión de servidores', 'Infraestructura'], ['Administración de Google Cloud', 'Infraestructura'],
    ['Seguridad informática', 'Seguridad'], ['Administración de bases de datos', 'Datos'], ['Gestión de versiones de software', 'Cambios'],
    ['Documentación técnica', 'Documentación'], ['Altas y bajas de personal de TI', 'Personal'], ['Gestión de servicios tecnológicos', 'Servicio']
  ];

  return {
    ROLES: ROLES, PERMISOS_POR_ROL: PERMISOS_POR_ROL, permisos: permisos, tiene: tiene,
    ESTADOS: ESTADOS, ESTADO_LABEL: ESTADO_LABEL, vigente: vigente,
    esPropietario: esPropietario, puedeVer: puedeVer, esEditor: esEditor,
    CAMPOS_PASO: CAMPOS_PASO, pasoVacio: pasoVacio, contenidoVacio: contenidoVacio, lineas: lineas, urlSegura: urlSegura,
    validarContenido: validarContenido, esDocumentado: esDocumentado,
    hoyISO: hoyISO, sumarMeses: sumarMeses, sumarDias: sumarDias,
    ACCIONES: ACCIONES, accionesDisponibles: accionesDisponibles, aplicarAccion: aplicarAccion,
    indicadores: indicadores, indicadoresInventario: indicadoresInventario, filtroIndicador: filtroIndicador,
    TIPOS_TICKET: TIPOS_TICKET, ESTADOS_TICKET: ESTADOS_TICKET, TICKET_ESTADO_LABEL: TICKET_ESTADO_LABEL, TICKET_ABIERTOS: TICKET_ABIERTOS, PRIORIDADES: PRIORIDADES, PRIORIDAD_LABEL: PRIORIDAD_LABEL,
    IMPACTOS: IMPACTOS, URGENCIAS: URGENCIAS, MATRIZ_PRIORIDAD: MATRIZ_PRIORIDAD, prioridadDe: prioridadDe, CATEGORIAS_TICKET_INICIALES: CATEGORIAS_TICKET_INICIALES,
    configTicketsPorDefecto: configTicketsPorDefecto, normalizarConfigTickets: normalizarConfigTickets, slugCategoria: slugCategoria, nombreCategoria: nombreCategoria,
    puedeVerTicket: puedeVerTicket, esTI: esTI, horarioValido: horarioValido, msLaborales: msLaborales, msEfectivos: msEfectivos, fechaObjetivoMs: fechaObjetivoMs, slaDe: slaDe, estadoSLA: estadoSLA,
    ACCIONES_TICKET: ACCIONES_TICKET, accionesTicketDisponibles: accionesTicketDisponibles, aplicarAccionTicket: aplicarAccionTicket, validarTicketNuevo: validarTicketNuevo,
    clasificarTicket: clasificarTicket, indicadoresTickets: indicadoresTickets, filtroTickets: filtroTickets, VENTANA_TICKETS_DIAS: VENTANA_TICKETS_DIAS, MIN_MUESTRA: MIN_MUESTRA, VENTANA_DIAS: VENTANA_DIAS,
    CATEGORIAS: CATEGORIAS, CATALOGO_INICIAL: CATALOGO_INICIAL
  };
});
