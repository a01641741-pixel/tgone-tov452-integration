# TTN — evidencia y pendientes

## Evidencia recibida
Se inspeccionó commapi.php proporcionado por Alejandro el 23/sep/2026. No se copia al repositorio
porque contiene credenciales incrustadas. Se documenta el comportamiento observado, sin afirmar que
coincida con el receptor desplegado hoy.

El código: recibe POST y decodifica el JSON; toma uplink_message.rx_metadata[0].rssi; identifica el
medidor con end_device_ids.dev_eui; recorre uplink_message.decoded_payload usando sus claves como
columnas; escribe con INSERT ... ON DUPLICATE KEY UPDATE; ante Final = "end" ejecuta
CALL TOV452_END(idTrack); imprime depuración aunque declara application/json.
Esto evidencia fragmentos de una misma transmisión y una operación de cierre.

## Confirmado por Manuel (sep/2026)
- Fecha: su PHP toma la hora de captura de TTN y la guarda convertida a la zona de Total Ground.
  TG One usa esa fecha tal cual (ver ARCHITECTURE.md → Fechas). Ya no es un pendiente.
- Las columnas formuladas de tgv_dev.tov452_66 contienen valores finales, sin factores pendientes.

## Pendiente
- JSON real TTN: al menos un mensaje con decoded_payload y el de cierre Final:end.
- PHP receptor actual DESPLEGADO (confirmar que commapi.php es la versión en uso).
- Regla para reconocer una lectura completa (fragmentos, TOV452_END, idTrack).
- Escala/unidad de kWh y unidad de los armónicos THD_*_e.
- Rutina TOV452_END (el respaldo del 17/sep está truncado y no la incluye). Esquema: ver LEGACY-API.md.
- Mapeo dev_eui → TOV452-66 → empresa; reglas de retransmisión.
- Configuración de aplicación, región/cluster y webhook TTN, sin pegar secretos.

## Receptor futuro
Vivirá en el VPS TG ONE CLOUD, no en Base44. Requisitos: autenticación del webhook, validación y lista
permitida de campos, SQL parametrizado, manejo de paquetes parciales, deduplicación por identidad real,
measuredAt/receivedAt, respuestas JSON sin trazas ni credenciales, usuario MySQL de permisos mínimos.
No trasladar la concatenación SQL ni credenciales incrustadas del receptor anterior.
No se creó ni se simuló un receptor TTN en esta fase.
