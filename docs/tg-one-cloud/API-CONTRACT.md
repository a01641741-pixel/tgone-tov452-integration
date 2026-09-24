# Contrato propuesto TG ONE CLOUD v1

Este contrato define lo que construiremos. Los endpoints externos aún NO existen ni han sido comprobados.
Base: secreto TG_ONE_CLOUD_API_BASE_URL, solo origen HTTPS público, sin /api/v1, consulta, fragmento ni
credenciales en la URL. Se rechazan localhost y rangos privados (10/8, 172.16/12, 192.168/16, 169.254/16).
Credencial de lectura: TG_ONE_CLOUD_API_TOKEN, enviada como Bearer. La API debe exigirla.
El navegador nunca recibe esta credencial ni se conecta a MySQL. Timeout 8 s. Redirecciones rechazadas.
En el servidor, MySQL se consulta con un usuario local de permisos mínimos (solo SELECT).

## GET /api/v1/health
- status: ok | degraded | error
- version: cadena (máx. 80)
- database.status: ok | error (ausente = desconocido)
- ttn.status: no_configurado | configurado | recibiendo
- ttn.lastUplinkAt: ISO 8601 con zona, o null. Uplink global; no se atribuye a un dispositivo.
Shadow y TG API solo se activan si health responde `status: ok` en el momento de confirmar.

## GET /api/v1/devices/{deviceKey}/latest
Respuesta: { measurement: lectura | null }.
deviceKey: letras, números, guion o guion bajo, 1–100. Un deviceKey pertenece a un único dispositivo;
el backend de TG One resuelve antes su empresa y permisos.

## GET /api/v1/devices/{deviceKey}/measurements
Parámetros: limit=300, from y to opcionales (ISO con zona).
Respuesta: { measurements: lectura[], nextCursor?: cadena | null }. Máximo 300, orden ascendente por measuredAt.

## Lectura
Obligatorios:
- deviceKey: debe coincidir exactamente con el equipo solicitado.
- readingId: cadena no vacía o número finito; identidad estable para deduplicar.
- measuredAt: instante de medición real con zona explícita. Debe representar exactamente la hora
  guardada en la base, p. ej. `2026-09-24T07:34:46-06:00` para `2026-09-24 07:34:46`. No desplazar:
  si se envía en UTC (`Z`), debe ser el mismo instante. TG One muestra los dígitos en America/Mexico_City.
receivedAt: llegada a Cloud, ISO con zona o null.
Valores (número o null) en unidades físicas finales, SIN factores pendientes de aplicar:
frequency (Hz); v1/v2/v3 (V); i1/i2/i3 (A); pf1/pf2/pf3; thdV1..3 y thdI1..3 (%); kWh; rssi (dBm).
metrics: [{key, value, unit}] hasta 100, para potencias, armónicos, temperatura, humedad, nivel,
presión, caudal, batería, estados digitales y canales adicionales.
Ausente = null; cero real = 0; negativos se conservan. Nunca se reescala en TG One.
Pendiente de Manuel antes de fijar: unidad/escala de kWh y regla de "lectura completa" (LEGACY-API.md).

## Errores
401/403 credencial o permisos; 404 equipo no registrado; 429 límites; 503 no disponible.
Sin claves, SQL, trazas ni datos de conexión. Sin datos: measurement:null o measurements:[].
Un error no autoriza sustituir datos de otra fuente en silencio.

## Comparación shadow
Se compara solo si: mismo equipo (deviceKey), una lectura legacy y una de TG API, y el MISMO instante
de medición (legacy se interpreta en America/Mexico_City). Tolerancia 1e-6 en la unidad de cada variable.
Resultados: coincide, diferencia, incompleto (una fuente omite variables), no_comparable (otro instante
u otro equipo), pendiente (falta una lectura). Se registran en ComparacionFuente solo coincide,
diferencia e incompleto, una vez por par de lecturas. Nunca se registra con datos ausentes o simulados.

## Futuro, no implementado
/status y /metrics por dispositivo; paginación navegable; agregaciones para históricos extensos.
