# TG One Cloud — preparación de la transición

Estado (24/sep/2026): infraestructura externa pendiente. No existe VPS, dominio, receptor TTN ni base
de datos propia. TOV452-66 opera en legacy; HYDRION conserva su integración independiente.

## Flujos
Actual: TOV452 → LoRa → TTN → receptor Apache/PHP (Manuel) → MySQL tgv_dev → medicionesReales → TG One.
Futuro: medidores → TTN → API TG ONE CLOUD → MySQL TG One → telemetryGateway → TG One.
Legacy intermedio acordado: medicionesReales → API /tgcommdev/ (action:get) → MySQL con usuario local
de solo lectura (ver LEGACY-API.md). tovLive sigue deshabilitada y no se usa.

## Capas
UI → TelemetriaProvider → useMedicionesReales → telemetrySession → telemetryRequest.
- legacy: función medicionesReales (mismo payload y sondeo de 15 s).
- tg_api: telemetryGateway autenticado → URL de secretos → HTTPS API.
- shadow: legacy productiva; comparación contra TG API en segundo plano (solo con API en línea).
La UI consume el modelo normalizado; no conoce la estructura física de ninguna fuente.

## Modelo normalizado (base44/functions/telemetryGateway/model.js, reexportado en src/lib/telemetryModel.js)
deviceId, deviceCode, source, readingId, measuredAt, receivedAt, frequency, v1..v3, i1..i3, pf1..pf3,
thdV1..thdV3, thdI1..thdI3, kWh, rssi, metrics[{key,value,unit}] + alias transitorios fecha/lectura/dispositivoId.
- Perfiles legacy: `tov452_crudo` (activo; divisores fijos) y `tov452_valores_finales` (columnas finales
  de Manuel sin factores; verificado con 7 524 filas reales; preparado, no activado). Ver LEGACY-API.md.
- Ausente = null; cero real y negativos se conservan. normalizeApi nunca reescala.

## Fechas
El receptor de Manuel guarda la hora de captura de TTN ya convertida a la zona de Total Ground, sin
zona explícita en el texto. Reglas (MEASUREMENT_TIMEZONE = America/Mexico_City):
- Mostrar: los dígitos guardados, sin desplazarlos (legacy conserva el texto; para TG API `fecha` es la
  hora de pared en esa zona). `selloCompleto(texto)` formatea sin pasar por la zona del navegador.
- Calcular: antigüedad ("hace X min"), filtros de historial en el servidor (UTC) y comparaciones
  shadow usan `measurementInstant`, no la zona del navegador ni la del servidor.
- `parseFecha` devuelve el instante real (zona de medición) y ejes, tooltips y sellos usan
  `formatoMedicion`/`horaMedicion`: se corrigió el salto de 1 h en cambios de horario (probado en 5 zonas).

## Datos y permisos
Dispositivo: telemetria_fuente (legacy por omisión), telemetria_device_key, telemetria_migracion.
El formulario CRUD de Dispositivos ya no reenvía esos campos (evita revertir cambios sin auditoría).
InfraestructuraConfig: solo metadatos (estado, versión, latencia, última comprobación). Sin secretos.
ComparacionFuente: comparaciones reales; lectura admin; creación/edición/borrado solo por el servidor.
LecturaHistorica y tabla_bd_externa se conservan (legacy encapsulado, no eliminado).

## Seguridad
- medicionesReales: exige sesión, empresa del dispositivo, tabla registrada, campos y filtro permitidos;
  no reenvía errores internos del PHP. Credenciales legacy siguen en el código hasta activar el
  interruptor de secretos (LEGACY-API.md) y rotarlas.
- telemetryGateway: lista cerrada de acciones, rol admin donde corresponde, parámetros validados,
  revisión esperada, auditoría previa obligatoria para cambios. URL Cloud solo HTTPS pública.
- TG AI: sin shell, SSH, SQL ni comandos libres; propone cambios y solo un botón los confirma.

## Auditoría
Se audita toda llamada al gateway salvo lecturas de dispositivo marcadas `origen:'sondeo'`
(sondeo automático cada 15 s y comparación shadow en segundo plano). Omitir el origen no evita la
auditoría. Cambios de fuente: registro previo obligatorio + registro de cierre.

## Límites
La comprobación de revisión no es una transacción atómica. Comparar lecturas no autoriza por sí sola
apagar legacy (ver MIGRATION.md).
