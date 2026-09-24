# Migración por dispositivo y reversión

## Estado
TOV452-66 en legacy. Ningún dispositivo está en shadow ni en tg_api. HYDRION sigue independiente.
Mientras no exista una API real configurada y comprobada, shadow y TG API están BLOQUEADOS en el
servidor, en el panel y en TG AI, que muestran «API no configurada».

## Modos
- legacy: única fuente productiva (infraestructura actual).
- shadow: legacy sigue siendo productiva; se compara contra TG API sin usar su lectura.
- tg_api: TG ONE CLOUD es la fuente productiva.

## Dónde configurar la URL
Editor de Base44 → TG One → Settings → Secrets (secretos del servidor):
- TG_ONE_CLOUD_API_BASE_URL: origen HTTPS del VPS, sin /api/v1 (p. ej. https://api.dominio.mx).
- TG_ONE_CLOUD_API_TOKEN: credencial de lectura de la API.
Nunca en variables VITE_, formularios ni campos de Dispositivo. Después: Infraestructura TG One →
Probar conexión.

## Activar shadow para TOV452-66 (cuando exista la API)
1. Configurar los secretos y comprobar «Servidor en línea» con Probar conexión.
2. Sistema → Infraestructura TG One (solo administradores).
3. Dispositivo TOV452-66; identificador independiente TOV452-66; nuevo modo Shadow.
4. Revisar cambio → Confirmar cambio. También desde TG AI: «activa shadow para TOV452-66» →
   botón Confirmar cambio.
El servidor revalida rol, dispositivo, modo actual, revisión y que la API responda en línea.
Se guardan fuente=legacy y migracion=shadow. La comparación de fondo depende de una sesión de
administrador abierta; el panel permite «Comparar fuentes» e «Historial de comparaciones».

## Activar TG API más adelante
Con shadow validado: nuevo modo TG API. El servidor exige health en línea y una lectura válida del
mismo equipo con no más de 30 min de antigüedad ni más de 1 min en el futuro.

## Volver a legacy (reversión inmediata)
Panel → TOV452-66 → Legacy → Revisar cambio → Confirmar cambio; o TG AI: «regresa TOV452-66 a legacy».
No depende de la nube. Exige tabla_bd_externa conservada. Otras pestañas deben recargarse.
Si la API falla con un equipo en tg_api, TG One muestra el error o «API no configurada»; no sustituye
datos en silencio: la reversión es explícita.

## Antes de retirar legacy
Comparaciones alineadas durante una ventana prolongada, sin diferencias ni incompletas sin explicar;
duplicados/paquetes parciales resueltos; históricos completos; respaldos recuperables; permisos y
pruebas de caída reales. Una coincidencia puntual no autoriza apagar la infraestructura anterior.
