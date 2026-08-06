# CIMEDI — Plataforma de gestión de activos industriales e IoT

Base de trabajo de **CIMEDI** (Centro Inteligente de Medición Digital): plataforma SaaS
multi-empresa de gestión de activos industriales, monitoreo IoT y mantenimiento preventivo.

Es una **reconstrucción original**: no se copió código ni recursos del sistema de referencia. Se
replicó su funcionalidad y se resolvieron sus limitaciones conocidas con implementación propia.

> Este directorio es independiente de la integración TOV452 documentada en la raíz del repositorio.
> No comparte código ni afecta a `backend/` ni a `frontend/`.

## Dónde vive

| Qué | Dónde |
|---|---|
| Aplicación | Base44 · app **CIMEDI** (`6a735807590e7614f7fcdca7`) |
| Sitio público | `/` — portada institucional y módulos smart-city (preexistente, intacta) |
| Consola operativa | `/app` — 17 módulos, multi-empresa, con permisos |
| Estado público | `/estado/:slug` |

## Documentos

| Archivo | Contenido |
|---|---|
| [`01-modelo-datos.md`](01-modelo-datos.md) | ERD, 19 entidades, reglas de RLS y estrategia de series de tiempo |
| [`02-wireframes.md`](02-wireframes.md) | Wireframes por módulo |
| [`03-roles-permisos.md`](03-roles-permisos.md) | Acciones, roles base y matriz completa |
| [`04-plan-sprints.md`](04-plan-sprints.md) | Fases entregadas, trabajo restante y riesgos abiertos |
| [`05-inventario-referencia.md`](05-inventario-referencia.md) | Inventario real levantado y cómo quedó modelado |

## Módulos

**Operación** — Inicio (KPIs, mapa con semáforo, favoritos) · Monitoreo (gauge, tendencia,
diagnóstico predictivo, CSV) · Alertas (reglas + bandeja)

**Infraestructura** — Locaciones · Áreas · Activos · Dispositivos

**Mantenimiento** — Calendario (mes / semana / Gantt) · Reportes programados

**Servicio** — Mesa de ayuda (tickets con SLA) · Soporte (videollamadas)

**Administración** — Usuarios · Roles y permisos · Equipos · Catálogos · Auditoría · Configuración

## Diferenciadores frente al sistema de referencia

| Limitación del referente | Cómo se resolvió |
|---|---|
| "Catálogos requiere permisos adicionales", sin decir cuál ni cómo obtenerlo | Módulo normal bajo la misma matriz de permisos; si falta acceso, la pantalla dice **qué** permiso falta y **quién** puede darlo |
| Permisos como caja negra | Editor visual de matriz: 17 módulos × 5 acciones, celda por celda |
| Gráficas pasivas | Motor de alertas con 7 operadores, severidad, silencio anti-tormenta y despacho multicanal |
| Estado del activo capturado a mano | Semáforo **calculado** desde alertas, umbrales, dispositivos sin señal y mantenimientos vencidos — siempre con la razón en texto |
| Un dispositivo = una magnitud | Sub-variables por dispositivo (volumen + porcentaje en un mismo sensor) |
| Umbral fijo de "sin señal" | Tolerancia derivada de la cadencia real de cada sensor |
| Sin rastro de cambios | Bitácora append-only con diff campo por campo |
| Captura uno por uno | Importación y exportación CSV con plantilla, vista previa y errores por línea |
| Solo salas de videollamada | Mesa de ayuda con folio, SLA por prioridad, historial y notas internas |

## Decisiones de diseño que conviene conocer

- **El aislamiento por empresa no depende de la UI.** Lo impone el RLS del backend contra la
  empresa activa del perfil. La matriz de permisos decide qué puede hacer alguien *dentro* de su
  organización; el RLS decide *cuál* organización.
- **Los huecos se muestran, no se rellenan.** Los campos que el sistema de origen dejó vacíos se
  marcan `sin capturar` en ámbar. Un dato faltante es información.
- **Nada finge haber pasado.** Mientras no haya proveedor conectado, las alertas registran
  `pendiente_integracion` por canal en lugar de reportar un envío que no ocurrió.
- **Los supuestos se declaran.** La capacidad del tanque asumida para derivar el porcentaje está
  anotada en la ficha del dispositivo y en la observación de su mantenimiento.
- **CIMEDI no maneja contraseñas.** La identidad es del proveedor de autenticación; las claves de
  las salas de soporte se guardan solo como hash SHA-256.

## Estado

Fases 0 a 4 entregadas y compilando. Pendiente de conectar: envío real de notificaciones,
ejecución calendarizada del motor de alertas, envío automático de reportes y estado público
anónimo — todo detallado en el [plan de sprints](04-plan-sprints.md).
