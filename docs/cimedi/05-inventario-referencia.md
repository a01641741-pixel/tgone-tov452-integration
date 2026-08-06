# CIMEDI — Inventario de referencia (cuenta Total Ground)

Levantamiento del inventario existente en el sistema de referencia y cómo quedó modelado en CIMEDI.
Se replica **tal cual fue capturado**, incluidos los registros incompletos, para poder validar la
migración campo por campo antes de completar nada.

Implementado en `src/lib/cimedi/seedReference.js`; es el perfil de arranque por omisión del
asistente de alta de empresa.

## Locaciones (3)

| Nombre | Abreviatura | Municipio | Colonia | Áreas |
|---|---|---|---|---|
| Zona incendios | Incendios centro | Zapopan | El Colli Urbano 1a. Sección | 0 |
| Vesubio 1 | — | — | — | 1 |
| Vesubio 3 | — | — | — | 0 |

Vesubio 1 y Vesubio 3 no tienen jerarquía geográfica capturada en el origen. En CIMEDI se muestran
con la marca ámbar **`sin capturar`** en lugar de un valor inventado, y la nota queda en el campo
`notes` del registro. Sin `lat`/`lng` tampoco aparecen en el mapa — otro hueco visible a propósito.

## Áreas (1)

| Área | Locación | Descripción | Activos |
|---|---|---|---|
| Vesubio 1 | Vesubio 1 | (vacía en el origen) | 2 |

## Activos industriales (2)

| Código | Tipo | Descripción | Dispositivo |
|---|---|---|---|
| ZAP-PS1-DI1 | UDI | Unidad de almacenamiento inteligente Plaza del Sol 1 | ZAP-PS1-DI1-LLU-01 |
| ZAP-PS1-DM1 | UDM | (vacía en el origen) | ZAP-PS1-DM1-NIV-01 |

`UDI` y `UDM` se cargaron como entradas del catálogo `tipo_activo` conservando su clave original.
`UDI` se documenta como "Unidad de almacenamiento inteligente" porque así lo describe el activo;
`UDM` se dejó **sin expandir** — el origen no publica su significado y no se inventó uno.

Ninguno de los dos activos tiene grupos asignados en el origen; se replicó el arreglo vacío.

## Dispositivos (2)

### ZAP-PS1-DI1-LLU-01 — Sensor de lluvia

| Campo | Valor |
|---|---|
| EUI | `0004A30B0103EE4D` |
| MAC | `0004A30B0103EE4D` |
| Calibración | ajuste cero = 0 · multiplicador = 1 |
| Magnitud | precipitación (`rain`), mm |
| Cadencia observada | ~1 hora (11:05:46, 10:05:45, 09:05:44 …) |
| `sample_interval_seconds` | 3600 |

Serie generada: 168 puntos (7 días). El patrón **no** es una senoide: la mayoría de las horas
marca 0 mm con episodios de lluvia de 2 a 5 horas, que es lo que produce un pluviómetro real.

### ZAP-PS1-DM1-NIV-01 — Medidor de Nivel

| Campo | Valor |
|---|---|
| EUI | `0004A30B0104E265` |
| MAC | `0004A30B0104E265` |
| Calibración | ajuste cero = 0 · multiplicador = 1 |
| Magnitud | Almacenamiento |
| Sub-variables | **Volumen** (m³, primaria) y **Porcentaje** (%) |
| Último valor observado | 31.2 m³ |
| Rango en la última hora | ~31.1 – 32.0 m³ |
| Cadencia observada | ~2 min (12:07:43, 12:05:43, 12:03:41, 12:01:40, 11:59:39) |
| `sample_interval_seconds` | 120 |

Serie generada: 12 horas a 2 minutos (~360 puntos × 2 canales), como paseo aleatorio acotado al
rango observado con una bajada lenta por consumo. El último punto se fija exactamente en 31.2 m³.

## Cambios de diseño que provocó este inventario

Dos hallazgos del levantamiento modificaron el modelo de datos, no solo los datos de ejemplo:

**1. Un dispositivo puede emitir varias magnitudes.** El medidor de nivel expone Porcentaje y
Volumen a la vez. `Device.measurement_type` (un solo valor) no alcanzaba, así que se agregó
`Device.channels[]` —cada canal con su unidad, decimales, umbrales y escala de gauge— y
`Measurement.channel` para separar las series. El canal marcado `primary` alimenta el gauge y el
semáforo; el visor de monitoreo muestra un selector de sub-variable cuando hay más de uno.

**2. La cadencia de muestreo varía en dos órdenes de magnitud.** Un sensor cada hora y otro cada 2
minutos no pueden compartir el mismo umbral de "sin señal": 60 minutos de silencio son normales
para el primero y una caída evidente para el segundo. Se agregó `sample_interval_seconds` y la
tolerancia se deriva de él —tres intervalos perdidos— salvo que se fije explícitamente.

## Supuesto declarado: capacidad del depósito

El canal de **Porcentaje** requiere conocer la capacidad total del tanque, y el sistema de
referencia no la publica. Se asumió **40 m³**, lo que deja el volumen observado de 31.2 m³ en
~78 %.

Es un supuesto, no un dato:

- Está anotado en el campo `notes` del dispositivo, visible en la ficha.
- La constante `TANK_CAPACITY_M3` está en un solo lugar del código.
- El plan de mantenimiento "Verificación de calibración ZAP-PS1-DM1" lleva en sus observaciones la
  instrucción de capturar la capacidad real en esa visita.

Al corregir la capacidad, el canal de porcentaje se recalcula sin tocar nada más.

## Qué **no** se copió

Los valores históricos reales de las mediciones viven en el sistema de referencia y no se
extrajeron. Las series de CIMEDI son sintéticas, marcadas con `source: 'simulado'` y
`batch_id: 'inventario-referencia'`, precisamente para poder distinguirlas —y borrarlas de un
filtro— cuando entre la telemetría real por la ingesta del Sprint 7.
