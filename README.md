# Integración de telemetría TOV452 — TG One

Documentación técnica de la integración entre **TG One** (plataforma de Total Ground, construida en Base44) y el sistema de telemetría real del medidor **Total View TOV452**, que vive en un servidor MySQL propio del equipo y se expone vía un endpoint PHP.

Este repo existe para que el contrato de la API quede escrito en un solo lugar — antes estaba repartido entre un pizarrón, capturas de Postman y una conversación de chat.

## Estado actual

🟢 **Conectado y en producción.** El 21/jul/2026 Boris confirmó el contrato final (ver abajo) y el equipo ya lo probó en vivo. La función `medicionesReales` está activa en TG One y alimenta la página **"Mediciones Reales"** (`/mediciones-reales`) con datos reales del medidor, sin simulación, refrescando cada 15s.

La ruta abandonada (`tovLive` + token de sesión rotativo, `backend/tovLive.entry.ts` / `frontend/useTovLive.js`) se documenta más abajo solo como historial — Boris optó por un contrato más simple (token fijo, sin login) y esa versión ya no se va a activar.

## Arquitectura (contrato vivo)

```
[Medidor TOV452] → MySQL (tgv_dev, puerto 3306, tabla TOV452_66)
                          ↓
      PHP WS (dbcommapi0099.php, puerto 3030, ruta /tgcommdev/)
                          ↓
     Función medicionesReales en Base44 (proxy server-side, solo lectura)
                          ↓
          Hook useMedicionesReales() en React (TG One → /mediciones-reales)
```

Servidor: `monitor02.redirectme.net:3030`
Endpoint confirmado: `/tgcommdev/dbcommapi0099.php` (⚠️ la ruta anterior `/tgcomm/` sin "dev" dejó de responder — fue la causa de un error 500 real durante las pruebas)

Hay además una app hermana de pruebas ("DB Data Connector", servida en `tgonepostman.site`) con una consola tipo Postman (`src/pages/DbcommQuery.jsx` + función `dbcommQuery`) que documenta el contrato completo (GET/POST/PUT/DELETE) y sirve para probar contra el servidor real sin tocar TG One. Ahí también queda registrado, con candado técnico, que POST/PUT/DELETE siguen bloqueados salvo admin + confirmación explícita.

## Contrato confirmado (21/jul/2026)

Todo viaja por `POST` con un body fijo — ya no hay flujo de login/token rotativo:

```json
{
  "servidor": "localhost",
  "base_de_datos": "tgv_dev",
  "usuario": "root",
  "password": "root",
  "action": "get",
  "token": "Tg#10982278ia123",
  "displayfields": ["Frequency"],
  "tabla": "TOV452_66",
  "condiciones": { "lectura": 8076 }
}
```

Notas del contrato:
- El campo es `action` (minúscula), **no** `Accion` como se pensaba en el diseño V2 original.
- El token es **fijo** (no rotativo, no requiere login previo) y viaja junto con las credenciales en cada llamada.
- `condiciones` acepta la clave en minúscula (`lectura`) aunque la columna real se liste como `Lectura` en las respuestas — MySQL no distingue mayúsculas/minúsculas en nombres de columna, así que ambas formas funcionan.
- Sigue sin exponerse ningún camino de escritura desde TG One: `medicionesReales` solo manda `action: 'get'`, nunca `post`/`put`/`delete`.

## Ejemplo real validado (producción, 22/jul/2026)

Request (replicando exactamente lo que hace `medicionesReales`):

```json
{
  "servidor": "localhost", "base_de_datos": "tgv_dev",
  "usuario": "root", "password": "root",
  "action": "get", "token": "Tg#10982278ia123",
  "tabla": "TOV452_66", "condiciones": { "lectura": 8375 }
}
```

Response real (lectura más reciente al momento de la prueba, `fecha: "2026-07-22 02:14:34"`):

```json
{
  "estado": "éxito",
  "codigo": 200,
  "mensaje": "1 registro(s) encontrado(s).",
  "datos": [{
    "Lectura": 8375, "TOV452_ID": "0004A30B0100D68D", "rssi": -33,
    "fecha": "2026-07-22 02:14:34",
    "Frequency": 5996, "VFase1": 1246, "VFase2": 1208, "VFase3": 1228,
    "IFase1": 0, "IFase2": 0, "IFase3": 0,
    "PF1": 1000, "PF2": 1000, "PF3": 1000,
    "TP1": 400, "TP2": 400, "TC1": 800, "TC2": 5, "kWh": 6,
    "THD_VST1": 2, "THD_VST2": 4, "THD_VST3": 4,
    "THD_IST1": 0, "THD_IST2": 0, "THD_IST3": 0
  }]
}
```

Escalado y sanity-check contra física real: `Frequency` 5996 ÷100 = **59.96 Hz** (red eléctrica real ✓), `VFase1` 1246 ÷10 = **124.6 V** (✓), `PF1` 1000 ÷1000 = **1.000** (✓ a corriente cero). Boris confirmó explícitamente la escala de `Frequency` (÷100, "2 decimales asignados en el módulo de medidores"); el resto de las escalas están verificadas empíricamente contra esta lectura real pero no confirmadas palabra por palabra por Boris — si algún valor se ve raro bajo carga real, hay que volver a validarlas con él.

Nota sobre la lectura `#8076` mencionada por Boris en chat: al consultarla hoy, la API regresa `Frequency: 1000` (no `10000`). Es un registro viejo de prueba — no bloquea nada de lo de arriba, pero si Boris insiste en que debería ser `10000` habría que revisarlo directamente con él del lado de la base de datos (fuera del alcance de este repo).

## Estructura de este repo

**Contrato vivo (usar esto):**
- `backend/medicionesReales.entry.ts` — función server-side (Deno, Base44) activa en TG One. Solo lectura: nunca manda `action` distinto de `'get'`.
- `frontend/useMedicionesReales.js` — hook de React que consume `medicionesReales`, hace polling cada 15s, y escala los campos crudos a unidades reales (voltaje, corriente, factor de potencia, THD por fase, frecuencia).

**Historial (abandonado, no activar):**
- `backend/tovLive.entry.ts` — intento V2 con token de sesión rotativo y flujo de login. Se dejó `DISABLED = true` a propósito y ya no se va a completar: Boris optó por el contrato más simple de arriba.
- `backend/TovSesion.entity.jsonc` — esquema de caché de sesión para el intento V2. Sigue existiendo como entidad en Base44 pero sin uso activo.
- `frontend/useTovLive.js` — hook que consumía la función anterior; reemplazado por `useMedicionesReales.js`.

### V1 — GET con body (descontinuado, contexto histórico)
El diseño original exigía **método GET con un body JSON crudo**, lo cual viola la especificación de `fetch()` (ningún cliente moderno puede replicarlo) y además el endpoint decidía la operación según el verbo HTTP (`GET`=lectura, `POST`/`PUT`=inserción, `DELETE`=borrado) — un riesgo real, ya que cualquier cliente que adivinara el verbo podía escribir o borrar sin token verificado. Durante esas pruebas se borró por accidente un registro de prueba en `tgv_dev.TOV452_66`. Por eso se descartó, y por lo que ninguna escritura real se expone desde TG One hasta la fecha.

## Campos de la tabla `TOV452_66` (confirmados por inspección de una lectura real en producción)

| Campo | Significado | Escala aplicada |
|---|---|---|
| `Lectura` | Consecutivo de la medición | — |
| `fecha` | Timestamp de la lectura | — |
| `TOV452_ID` | Identificador físico del medidor | — |
| `VFase1/2/3` | Voltaje por fase | ÷10 |
| `IFase1/2/3` | Corriente por fase | ÷10 |
| `PF1/2/3` | Factor de potencia por fase | ÷1000 |
| `Frequency` | Frecuencia | ÷100 (✅ confirmado por Boris) |
| `THD_VST1/2/3` | THD de voltaje, total por fase | ÷10 |
| `THD_IST1/2/3` | THD de corriente, total por fase | ÷10 |
| `THD_V{h}{fase}` / `THD_I{h}{fase}` | THD por armónico individual (ej. `THD_V13` = fase 1, armónico 3) | sin usar en el dashboard, disponibles si se necesita detalle fino |
| `kWh` | Energía acumulada | sin escala |
| `rssi` | Señal del dispositivo (dBm) | sin escala |
| `TP1/TP2/TC1/TC2` | Relación de transformadores de potencial/corriente (calibración del medidor, no telemetría en vivo) | sin usar en el dashboard |

## Checklist (actualizado)

1. [x] Boris confirma el contrato final (`action` + token fijo + ruta `/tgcommdev/`)
2. [x] Se probó un ciclo completo contra el servidor real y se documentó arriba
3. [x] El código está subido y activo como función `medicionesReales` en Base44
4. [x] La página "Mediciones Reales" muestra el panel completo (frecuencia, voltaje/corriente/PF/THD por fase, kWh, rssi) con datos reales
5. [x] Se creó el registro `Dispositivo` "Total View TOV452" (`tabla_bd_externa = "TOV452_66"`) y se reconectó la página **"Consulta en tiempo real"** (panel "Monitoreo eléctrico") de `useTovLive` (abandonado, siempre deshabilitado) a `useMedicionesReales` (activo) — antes mostraba "datos de ejemplo" aunque la conexión real ya funcionaba en otro lado
6. [ ] Confirmar con Boris si las escalas de voltaje/corriente/PF/THD (verificadas empíricamente, no palabra por palabra) aplican igual bajo carga real, antes de una demo con inversionistas

### Verificación previa a revisión (22/jul/2026)

Antes de entregar se corrió, sobre el código ya desplegado: `npm run lint` (limpio en los archivos tocados) y `npm run build` (compila sin errores). `useTovLive.js` queda sin ninguna página que lo importe — es código muerto, no rompe nada, se deja documentado como historial.

## Nota de seguridad

El endpoint real sigue sin distinguir lectura de escritura por intención, solo por verbo HTTP, y ya hubo un incidente real de borrado accidental. Por eso:
- `medicionesReales` (usada por TG One) nunca manda nada distinto de `action: 'get'` — no hay forma de escribir desde ahí.
- La consola de pruebas (`dbcommQuery`, en la app "DB Data Connector") bloquea cualquier payload con la clave `campos` (la que dispara un INSERT/UPDATE reales) salvo que quien la ejecute tenga rol `admin` **y** mande `confirmarEscritura: true` explícitamente.
- `PUT`/`DELETE` contra el servidor real siguen sin exponerse desde ninguna de las dos apps.
