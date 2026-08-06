# CIMEDI — Plan de sprints

Sprints de 2 semanas. El estado refleja lo construido en la app Base44 **CIMEDI**
(`6a735807590e7614f7fcdca7`) al 6 de agosto de 2026.

---

## Fase 0 — Núcleo de activos ✅ COMPLETADA

**Objetivo:** que la jerarquía completa se pueda capturar, ver y administrar con permisos reales.

| Entregable | Estado |
|---|---|
| 19 entidades + `User` extendido, con RLS por empresa | ✅ |
| Contexto multi-tenant con cambio de empresa en caliente | ✅ |
| Motor de permisos granulares + editor visual de matriz | ✅ |
| Locaciones → Áreas → Activos → Dispositivos (CRUD, importación y exportación CSV) | ✅ |
| Catálogos maestros desbloqueados con permisos explícitos | ✅ |
| Usuarios, roles y equipos de trabajo | ✅ |
| Semáforo de salud calculado, con razón legible | ✅ |
| Bitácora de auditoría con diff campo por campo | ✅ |
| Asistente de alta de empresa con 3 perfiles de arranque | ✅ |

## Fase 1 — Monitoreo IoT ✅ COMPLETADA

| Entregable | Estado |
|---|---|
| Visor por dispositivo: gauge, tendencia, tabla histórica, exportación CSV | ✅ |
| Selector de rango (24 h / 7 / 30 / 90 días / personalizado) | ✅ |
| Sub-variables por dispositivo (volumen + porcentaje en un mismo sensor) | ✅ |
| Detección de conexión derivada de la cadencia real de muestreo | ✅ |
| Mantenimiento predictivo básico: deriva, saltos bruscos, valores atípicos | ✅ |
| Mapa de cobertura con semáforo por locación | ✅ |
| Réplica del inventario real de Total Ground como perfil de arranque | ✅ |

## Fase 2 — Mantenimiento preventivo ✅ COMPLETADA

| Entregable | Estado |
|---|---|
| Calendario mensual y semanal filtrable por activo | ✅ |
| Vista Gantt de 6 meses con atrasos dimensionados | ✅ |
| Frecuencia (día/semana/mes/año) con recálculo automático de próxima fecha | ✅ |
| Recordatorios con tipo, canales y mensaje personalizado | ✅ |
| Cierre de ciclo: marcar realizado agenda la siguiente ejecución | ✅ |

## Fase 3 — Alertas y soporte ✅ COMPLETADA (parcial en canales)

| Entregable | Estado |
|---|---|
| Reglas de alerta con 7 operadores, alcance jerárquico y silencio anti-tormenta | ✅ |
| Bandeja con reconocimiento y resolución nominativos | ✅ |
| Evaluación manual con el mismo motor que correrá calendarizado | ✅ |
| Mesa de ayuda: folio, SLA por prioridad, historial, notas internas | ✅ |
| Salas de videollamada con clave hasheada (SHA-256) | ✅ |
| **Envío real por correo / WhatsApp / SMS / push** | ⏳ pendiente: requiere conectar proveedores |
| **Ejecución calendarizada del motor en backend** | ⏳ pendiente |

> El despacho registra hoy el estado `pendiente_integracion` por canal en lugar de fingir que el
> mensaje llegó. La bandeja funciona como canal garantizado mientras tanto.

## Fase 4 — Reportes y estado público ✅ COMPLETADA (parcial)

| Entregable | Estado |
|---|---|
| Programación de reportes (tipo, formato, frecuencia, destinatarios) | ✅ |
| Generación inmediata de informe de disponibilidad en PDF | ✅ |
| Exportación por entidad desde Configuración, auditada | ✅ |
| Página de estado de solo lectura por empresa | ✅ (requiere sesión) |
| **Envío periódico automático por correo** | ⏳ pendiente: función de backend |
| **Estado público verdaderamente anónimo** | ⏳ pendiente: el RLS exige sesión; hace falta una función que sirva el resumen ya agregado |

---

## Trabajo restante

### Sprint 5 — Integraciones de salida (2 semanas)

1. Función de backend `dispatchAlerts`: corre el motor cada N minutos y envía por los canales
   configurados. Reutiliza `alertEngine.js` sin cambios — por eso vive aislado de React.
2. Conectores de correo (transaccional), WhatsApp Business y SMS; `Alert.delivery_status` pasa a
   reflejar entregas reales con su identificador de proveedor.
3. Función `runScheduledReports`: genera PDF/Excel y los envía según `ScheduledReport.frequency`.
4. Función pública `publicStatus(slug)` con rol de servicio, para que `/estado/:slug` deje de
   requerir sesión.

**Criterio de aceptación:** un umbral rebasado genera correo y WhatsApp en menos de 5 minutos, y la
alerta muestra el acuse real del proveedor.

### Sprint 6 — Campo y movilidad (2 semanas)

1. PWA instalable con caché offline de activos, dispositivos y mantenimientos asignados.
2. Escaneo QR/NFC contra `IndustrialAsset.qr_code` → ficha del activo en una pantalla.
3. Captura de lecturas y cierre de mantenimientos sin conexión, con cola de sincronización.
4. Adjuntar fotografías a mantenimientos y tickets.

**Criterio de aceptación:** un técnico sin señal registra tres mantenimientos y, al recuperar red,
todo sube sin duplicados.

### Sprint 7 — Escala y API (2 semanas)

1. Migrar `Measurement` a almacenamiento particionado por tiempo; agregados por hora/día
   precalculados para rangos largos.
2. API REST versionada (`/api/v1`) con autenticación por token de servicio, documentada en OpenAPI.
3. Webhooks salientes por alerta y por cierre de mantenimiento.
4. Ingesta directa desde LoRaWAN/MQTT con calibración aplicada en el borde.

**Criterio de aceptación:** un tablero de 90 días sobre un sensor de cadencia de 2 minutos
(~65 mil lecturas) carga en menos de 2 segundos.

### Sprint 8 — Cumplimiento y accesibilidad (2 semanas)

1. Auditoría WCAG 2.1 AA completa: contraste, foco visible, navegación por teclado, lectores de
   pantalla. (Ya hay base: roles ARIA, `aria-label`, foco visible y objetivos táctiles.)
2. Traducción completa al inglés — el andamiaje i18n ya existe, faltan las cadenas de los módulos.
3. Retención y purga configurable de mediciones y bitácora.
4. Firma de la bitácora (hash encadenado) para evidencia ante contraloría.

---

## Riesgos abiertos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El `user_condition: admin` como vía de escape es amplio | Un propietario ve todas las empresas | Sustituir por rol de servicio auditado antes de producción multi-cliente |
| Sin ingesta real, la telemetría depende de carga manual o de la simulación | Demos convincentes, operación no | Sprint 7 (ingesta directa) es prerrequisito de la puesta en marcha |
| `Measurement` sin particionar | Degradación con años de historia y cadencias de minutos | Sprint 7; el modelo ya aísla esa decisión |
| Canales de alerta sin proveedor | La promesa de "alertas activas" queda a medias | Sprint 5, primer prioridad |
| Capacidad del tanque asumida en 40 m³ para el canal de porcentaje | Porcentajes desviados en el inventario real | Capturar la capacidad real; el valor asumido está anotado en la ficha del dispositivo |
