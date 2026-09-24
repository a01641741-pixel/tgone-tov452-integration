# API legacy /tgcommdev/ y valores finales de tgv_dev.tov452_66

Estado al 24/sep/2026. Producción sigue leyendo `TOV452_66` con el perfil `tov452_crudo`
(columnas enteras + divisores, validado con la lectura #8375 del 22/jul/2026). No se cambió.

## Arquitectura acordada con Manuel

```
TG One (navegador) ──HTTPS──▶ función medicionesReales (Base44, servidor)
                                   │ POST action:"get"
                                   ▼
                       API PHP /tgcommdev/dbcommapi0099.php (servidor de Manuel)
                                   │ usuario LOCAL de MySQL, solo lectura
                                   ▼
                              MySQL tgv_dev.tov452_66
```

- El navegador nunca recibe URL, token ni credenciales de MySQL; tampoco se conecta a MySQL.
- La función ya exige sesión, verifica la empresa del dispositivo y solo acepta tablas registradas,
  campos de una lista permitida y filtro `lectura`.

## Interruptor preparado (apagado)

`medicionesReales` lee estos secretos del servidor (Base44 → Settings → Secrets). Sin ellos,
el comportamiento es idéntico al actual.

| Secreto | Efecto |
| --- | --- |
| `TG_LEGACY_CREDENCIALES_EN_SERVIDOR` = `si` | Deja de enviar `servidor`, `usuario` y `password` de MySQL. Envía `base_de_datos`, `tabla`, `action`, `displayfields`, `condiciones` y `token`. |
| `TG_LEGACY_API_TOKEN` | Token que envía la función en el campo `token` (sustituye al del código). |
| `TG_LEGACY_API_URL` | URL HTTPS del mismo PHP. Se ignora si no es `https:` o si trae usuario, consulta o fragmento. |

Activar solo cuando Manuel confirme que su PHP: usa el usuario local e ignora credenciales del cuerpo;
valida el token; está disponible por HTTPS; y responde con el mismo formato (`datos`/`data`/`resultado`).
Reversión: borrar `TG_LEGACY_CREDENCIALES_EN_SERVIDOR` (vuelve al comportamiento actual).

## Valores finales: reglas ya implementadas

Perfil `tov452_valores_finales` en `base44/functions/telemetryGateway/model.js`:
- No aplica ningún factor: el valor guardado es el que se muestra.
- Conserva negativos (p. ej. potencia exportada, factor de potencia capacitivo).
- Distingue cero real (`0`) de dato ausente (`null`): una columna vacía o ilegible nunca se vuelve 0.
- Potencias y armónicos entran como `metrics` con unidad explícita; no se inventan unidades.
- Mientras sus `columnas` estén vacías, el perfil **no puede usarse** y lo dice (prueba incluida).

## Bloqueado: el respaldo SQL y la lista de campos no llegaron

Los adjuntos mencionados no estaban disponibles en la sesión (se buscó en el repositorio, el sandbox
y Google Drive). Por eso no se asignó ninguna columna. Pendiente de verificar contra el SQL:

| Magnitud | Candidatos | Duda |
| --- | --- | --- |
| Frecuencia | `Frequency_e` / `Frecuency` | ¿Cuál es el valor final en Hz? ¿`Frecuency` es otra columna o un error de escritura? No se tratan como equivalentes. |
| Potencia | `Fase_W` / columna con "Potencia" | ¿Activa, aparente o reactiva? ¿Por fase o total? ¿W o kW? ¿Signo? |
| Armónicos | `Armonico_e` | ¿THD de voltaje o de corriente? ¿Qué fase? ¿% o armónico individual (orden)? |
| Voltajes, corrientes, FP, THD | nombres `_e` por confirmar | Nombre exacto de cada columna final. |

## Preguntas para Manuel

1. Reenviar el respaldo SQL (estructura de `tov452_66`, columnas formuladas y sus expresiones).
2. ¿`tov452_66` y `TOV452_66` son la misma tabla? En MySQL sobre Linux los nombres distinguen mayúsculas.
   Hoy el dispositivo apunta a `TOV452_66`; cambiarlo sin confirmar podría cortar las lecturas.
3. Escala y unidad de `kWh`: ¿kWh o Wh? ¿acumulado o por intervalo? ¿qué pasa en un reinicio del medidor?
4. ¿Cómo se reconoce una lectura completa? (fragmentos de uplink, `Final = "end"`, `TOV452_END`, `idTrack`).
5. Contrato del PHP con usuario local (ver "Interruptor preparado").

## Fechas (confirmado)

El PHP de Manuel toma la hora de captura de TTN y la guarda ya convertida a la zona de Total Ground.
TG One la muestra con los mismos dígitos guardados y solo la interpreta en `America/Mexico_City`
para calcular antigüedad, filtros y comparaciones. Ver ARCHITECTURE.md → Fechas.

## Cómo activar valores finales cuando llegue el SQL

1. Llenar `LEGACY_PROFILES.tov452_valores_finales.columnas` (y `metricas`) con columnas verificadas; divisor 1.
2. Agregar esas columnas a `CAMPOS_PERMITIDOS` de `medicionesReales` y a `CAMPOS_COMPLETOS` de `useMedicionesReales`.
3. Seleccionar el perfil para el dispositivo (hoy es un parámetro de `normalizeLegacy`; se cablea en ese paso).
4. `npm run test:tgcloud`, comparar una lectura contra la base y documentar la evidencia aquí.
