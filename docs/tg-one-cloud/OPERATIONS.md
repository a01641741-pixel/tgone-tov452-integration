# Operación y diagnóstico

## Acceso
Sistema → Infraestructura TG One (solo administradores; el servidor vuelve a verificar el rol).
Muestra: plataforma TG One, TG ONE CLOUD (estado, URL configurada o no, credencial configurada o no
—nunca su valor—, latencia, última comprobación, versión, base de datos según la API), TTN y último
uplink confirmado, conteos legacy/TG API/shadow/con falla, diagnóstico por dispositivo, comparación
de fuentes e historial de comparaciones. Sin API: «API no configurada» y no se intenta conexión.

## Diagnóstico por dispositivo (lenguaje llano)
Plataforma, fuente productiva, adaptador («Conexión correcta» / «No se reciben datos» / error),
última medición («hace 5 min · fecha guardada»), última consulta correcta, TG ONE CLOUD, último
contacto (sin dato: no se deduce de la hora de consulta) y último error. Sin trazas técnicas.

## TG AI: acciones controladas
telemetryGateway acepta exclusivamente: consultar_estado_infraestructura, consultar_estado_dispositivo,
consultar_ultima_medicion, consultar_historial, comparar_fuentes, consultar_comparaciones,
consultar_salud_api, consultar_ultimo_uplink_ttn, diagnosticar, probar_conexion_api,
cambiar_fuente_dispositivo, activar_shadow, volver_a_legacy.

Consultas (solo lectura, auditadas con origen tg_ai): «¿Cuál es el voltaje actual del TOV452-66?»,
«¿En qué fuente está TOV452-66?», «Compara las fuentes», «Historial de comparaciones», «¿Cuál fue el
último uplink TTN?». Sin dato responde que no hay medición; si la fuente falla, da la última lectura
archivada con su fecha y aclara que puede estar atrasada. Distingue medición, consulta, uplink y conexión.

Cambios de fuente, en dos pasos:
1. Una orden explícita («pasa TOV452-66 a la nueva API») genera una propuesta: «Actualmente está en
   legacy. ¿Confirmas cambiar TOV452-66 a TG API?», con una tarjeta y el botón Confirmar cambio.
   Solo para administradores; sin API configurada no se propone shadow ni TG API.
2. Solo el botón ejecuta. El servidor revalida administrador, dispositivo y empresa, destino,
   modo actual, revisión del registro y requisitos de la fuente; registra Auditoría.
Una pregunta informativa nunca propone ni ejecuta cambios («¿qué pasa con…?», «¿se puede pasar…?»,
«¿cuál es la fuente activa?», «fuente de alimentación»…). Decir «sí» por texto o voz no confirma.
Sin shell, SSH, SQL arbitrario, acceso directo a MySQL ni ejecución libre de texto.

## Qué está activo en Base44 (verificado el 24/sep/2026)
- Entidades: los archivos base44/entities/*.jsonc se registran en la app. Comprobado:
  ComparacionFuente responde (0 registros) y una entidad inexistente de control da error.
- Funciones backend: el código está en el sandbox (commits automáticos). No se pudo comprobar si ya
  atienden en producción: la API de plataforma rechaza el token MCP y el cortafuegos bloqueó la prueba
  HTTP. Tratarlas como potencialmente activas.
- Frontend publicado: requiere Publicar; no verificado por la misma razón.
- Datos: TOV452-66 sin cambios (legacy); HYDRION sin cambios por este trabajo.

## Verificación automatizada
npm run test:tgcloud   (gateway, fase 2, sesión, medicionesReales, fechas en 5 zonas horarias)
npm run lint · npm run check:funciones · npm run build · npm run test:hydrion · npm run test:frescura
Las pruebas usan red y entidades simuladas: nunca escriben en producción ni contactan al servidor legacy.
Banco visual del botón de confirmación: Playwright sobre el componente real (oscuro, claro, 390 px).

## Hallazgos de seguridad heredados
Credenciales legacy siguen incrustadas en medicionesReales, guardarLecturaHistorica, archivarTelemetria
y pruebaCrud, y en el historial de git: activar secretos (LEGACY-API.md) y rotarlas. El transporte al PHP
es HTTP hasta que exista HTTPS. commapi.php tiene riesgos documentados en TTN.md.

## Datos simulados
Math.random solo en demos archivadas del menú (con aviso «Datos de ejemplo»), un hook sin uso, anchos
de esqueletos, retrasos visuales y claves de formularios. Dashboard, ficha, mediciones, consulta en vivo
y TG AI no sustituyen una lectura ausente por datos aleatorios.
