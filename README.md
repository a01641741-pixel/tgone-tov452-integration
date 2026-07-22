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
- `backend/medicionesReales.entry.ts` — función server-side (Deno, Base44) activa en TG One. Solo lectura: nunca manda `action` distinto de `'get'`. Soporta `incluirHistorial: true` para sembrar varias lecturas reales recientes en paralelo (ver ítem 22 del checklist).
- `frontend/useMedicionesReales.js` — hook de React que consume `medicionesReales`, hace polling cada 15s, escala los campos crudos a unidades reales (voltaje, corriente, factor de potencia, THD por fase, frecuencia), y siembra `history` con lecturas reales en la primera carga.
- `backend/pruebaCrud.entry.ts` — función server-side que ejercita el contrato de escritura completo (`post`/`put`/`delete`) contra la tabla `prueba` que Boris creó para pruebas. Valida cada campo contra el esquema real de la tabla antes de escribir.
- `frontend/PruebaRegistros.jsx` — pantalla de paginación + CRUD (ruta `/prueba-registros`, solo admin) que consume `pruebaCrud`.

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
| `IFase1/2/3` | Corriente por fase | ÷1000 (✅ corregido y confirmado por Manuel Vega, Total Ground, 22/jul/2026 — antes se usaba ÷10 por error) |
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
6. [x] Se sacó "Consulta en tiempo real" del grupo "Archivo (uso futuro)" del menú lateral (estaba escondida y etiquetada "(legado)" desde que se escribió, cuando todavía no había conexión real) y se movió a la navegación principal, junto a "Mediciones Reales"
7. [x] Se reorganizó el menú lateral para separar sin ambigüedad lo real de lo simulado: grupo **"Telemetría en vivo (real)"** arriba (Mediciones Reales + Consulta en tiempo real), grupo **"Demos de producto (simulado)"** hasta abajo y colapsado — mismas pantallas de antes, ningún dato se perdió, solo se re-etiquetaron y reordenaron para que cualquiera entienda de un vistazo qué es real y qué es mockup
8. [ ] Confirmar con Boris si las escalas de voltaje/corriente/PF/THD (verificadas empíricamente, no palabra por palabra) aplican igual bajo carga real, antes de una demo con inversionistas
9. [x] Rediseño visual del sidebar: el grupo "Telemetría en vivo (real)" ahora tiene una tarjeta con borde/tinte verde y un punto pulsante en el encabezado; el grupo "Demos de producto (simulado)" tiene borde punteado y se ve atenuado; cada item real muestra una píldora "EN VIVO" (en vez de un puntito), cada item demo muestra una etiqueta "SIM"; los íconos ahora viven en chips redondeados para más peso visual. Cero cambios de datos o rutas, solo estilo — verificado con build/lint, no con navegador (no hay acceso a uno en este entorno), así que vale la pena un vistazo rápido en persona antes de la demo.
10. [x] Archivado (no borrado) el video de introducción que se pedía originalmente al inicio de la app: `App.jsx` ahora tiene `const SHOW_INTRO_VIDEO = false;` — `VideoSplash.jsx` sigue intacto, se reactiva cambiando esa constante a `true`. No confundir con la página `/presentacion` (video de marketing, aparte, sigue accesible normalmente).
11. [x] El módulo "Infraestructura" (Locaciones/Áreas/Activos/Dispositivos) solo tenía data de ejemplo genérica (Monterrey, compresores, bombas — nada real). Se creó la cadena real: Locación "Total Ground — Zapopan" → Área "Monitoreo Eléctrico" → Activo "Tablero Eléctrico Principal (TOV452)" → vinculado al `Dispositivo` "Total View TOV452". Los 5 activos genéricos se marcaron `estado: "Dado de baja"` (badge gris neutro, ya soportado por `StatusBadge.jsx` — no dispara notificaciones ni alertas) para que se lean como archivados sin borrar nada. Se probó primero marcar los dispositivos/locaciones de ejemplo como "Inactivo"/"Inactiva", pero esos estados SÍ disparan alertas críticas falsas (`notificationUtils.js`, badge rojo en el sidebar) — se revirtió esa parte para no crear ruido nuevo. También se corrigió el cálculo de "Activos sin Dispositivo" (`Home.jsx`, `ActivosIndustriales.jsx`) para que un activo dado de baja no aparezca como advertencia de "sin monitoreo".
12. [x] La ficha de detalle del dispositivo (`DispositivoDetalle.jsx`) seguía mostrando "Datos de ejemplo — simulados" y "Sin conexión" para el Total View TOV452 real, porque nunca se conectó a `medicionesReales` (todo dispositivo usaba un generador sintético de lecturas/eventos, sin importar si tenía `tabla_bd_externa`). Se corrigió: cuando el dispositivo tiene `tabla_bd_externa`, la ficha ahora jala historial y estado real en vivo. De paso se arreglaron dos bugs preexistentes que afectaban a TODOS los dispositivos: (a) la ficha leía `dispositivo.codigo_interno` pero el campo real se llama `codigo` (por eso siempre decía "Sin código"), y (b) la Locación/Dirección intentaba leer `dispositivo.locacion_id` (campo que no existe en el esquema) en vez de resolverla vía el activo vinculado → área → locación.
13. [x] Se agregó la posibilidad de que un cliente (modo invitado, sin cuenta) solicite atención técnica y agende una cita con un ingeniero — antes el botón "Nuevo Ticket" en `/soporte` estaba oculto para invitados porque no tienen sesión real de Base44. Se creó la función `guestSupportRequest` (usa `asServiceRole`, mismo patrón que `guestRead`) que crea el `Ticket` y, si se da fecha/hora, también la `ReunionSoporte` con enlace de videollamada — superficie mínima a propósito: solo puede crear, no leer/editar/borrar nada más. El formulario de invitado pide nombre/correo/teléfono de contacto y muestra una confirmación con el enlace y clave de acceso si se agendó cita.
14. [x] `AiCopilot.jsx` (TG AI) nunca recibía la telemetría real — su contexto solo tenía activos/dispositivos/tickets/usuarios genéricos. Ahora, si hay un dispositivo con `tabla_bd_externa`, se le pasa `telemetria_electrica_real` (voltaje/corriente/PF/THD/frecuencia por fase, kWh, señal) con instrucción explícita de aclarar que es dato real y nunca inventar valores si no hay lectura. Además, el modelo puede poner `sugerir_soporte: true` cuando el usuario describe una falla real, y el chat muestra un botón "Sí, agendar cita" que abre el mismo flujo de `guestSupportRequest` (invitado) o `Ticket`+`ReunionSoporte` (staff autenticado).

15. [x] En "Consulta en tiempo real" se quitaron los 5 módulos simulados (Sistema de puesta a tierra, Sistema de pararrayos, Telemetría TG One, Supresores de picos, Bancos de capacitores) a petición explícita — la página ahora solo muestra "Monitoreo eléctrico" (el panel real del TOV452). El banner ya no menciona "el resto de los módulos sigue con datos de ejemplo" porque ya no hay resto.
16. Se comparó una foto real del medidor Total View físico (voltajes 121.6/125.8/127.4 V, 6.1 kWh en pantalla) contra la lectura del sistema en el mismo momento (124.4/123.0/125.3 V, 6 kWh) — el rango cuadra (confirma que es dato real, no inventado) pero los valores no coinciden exacto fase por fase. Puede ser fluctuación normal de red entre el instante de la foto y la lectura, o que el orden `VFase1/2/3` en la base de datos no corresponda 1-a-1 con las etiquetas físicas U1/UB/UC del medidor — **pendiente de confirmar con Boris**, no es algo verificable desde el código.
17. [x] "Mediciones Reales" — se verificó que la limpieza pedida (quitar la franja Servidor/Base de datos/Tabla/Refresco y las 3 tarjetas "Solo lectura"/"Fuente real conectada"/"Lectura activa") ya estaba aplicada en el código (commit propio del usuario vía Base44, minutos antes). El RSSI como barras de wifi y los medidores circulares también ya estaban implementados. Sobre eso se agregó:
    - **Bug real de "Curvas en tiempo real" investigado y resuelto**: no era un bug de código — se confirmó empíricamente (llamando al servidor real dos veces con ~80s de diferencia) que el medidor físico a veces deja de mandar lecturas nuevas por más de un minuto. El mensaje "acumulando lecturas…" técnicamente era correcto pero confuso (sonaba a que nunca iba a llegar). Se cambió por un mensaje honesto que muestra el número de la última lectura real y hace cuánto llegó.
    - **Todo lo importante ahora es clickeable**: Frecuencia, Fase 1/2/3 (voltaje) en la lectura principal, los medidores circulares, y las tarjetas de fase (corriente) — cada uno abre un panel de detalle con tendencia real, mínimo/promedio/máximo calculados sobre las lecturas reales acumuladas (nunca inventados).
18. [x] Se confirmó el contrato completo de escritura (INSERT/UPDATE/DELETE) contra el servidor de Boris probando en vivo sobre la tabla `prueba` (creada por él para este propósito, sin tocar `TOV452_66`): `action:"post"` + `campos` inserta, `action:"put"` + `condiciones`+`campos` actualiza, `action:"delete"` + `condiciones` borra — los tres requieren `token`. Se insertó, actualizó y borró un registro de prueba para confirmar el ciclo completo; la tabla quedó exactamente como estaba (21 registros).
19. [x] Se construyó la pantalla que pidió Boris: paginación real (`backend/pruebaCrud.entry.ts`, acción `list`, pagina en memoria sobre la tabla completa porque el servidor no soporta `orden`/`limite`) + CRUD completo con validación por tipo de columna (`frontend/PruebaRegistros.jsx`, ruta `/prueba-registros`, solo visible para admin en el menú "Sistema"). Valida en cliente y servidor contra las reglas reales de la tabla: `Nombre` obligatorio ≤30 car., `Descripcion`/`Status`/`nivel` opcionales (≤30/10/10 car.), `boleano` entero 0-1, `numerico` entero rango `int`, `fecha` formato `YYYY-MM-DD`, y **`doble` entero de -128 a 127 porque la columna real es `tinyint`, no decimal, a pesar del nombre** (esto se marca explícitamente en la etiqueta del campo en el formulario para que nadie se confunda). Solo usuarios con sesión real (no invitados) pueden usar la función — igual que con `medicionesReales`, nunca se expone escritura a un visitante anónimo.
20. [x] **Corregido bug de modo claro** en "Mediciones Reales" → "Lectura principal": los tiles digitales (`DigitalTile`) usaban `bg-zinc-950` fijo (fondo casi negro sin importar el tema), con `dark:bg-black/60` como único ajuste — en modo claro se veían "fondos negros horribles". Se cambió a `bg-muted/50 dark:bg-black/60` (con bordes/textos igualmente adaptados a ambos temas).
21. [x] Simplificado el renglón "Última actualización": ya no muestra la hora exacta (`11:56:30 a.m. · justo ahora`), solo el tiempo relativo (`justo ahora`), a petición explícita. Se eliminó la función `fmtTime`, que quedó sin uso.
22. [x] **Bug real de "Curvas en tiempo real" resuelto de fondo** (reporte de un cliente vía el usuario: "Tenemos 1 lectura real (#8465, justo ahora). El medidor todavía no manda una segunda…"). Diagnóstico previo (ítem 17) ya había confirmado que no era un bug de cómputo sino de UX: cada carga de página arrancaba `history` con un solo punto y dependía de esperar, en vivo, a que el medidor mandara una lectura nueva — y el medidor físico manda lecturas de forma irregular (a veces cada ~15-20s, a veces con huecos de más de un minuto), así que la gráfica se veía "atorada" mucho rato aunque todo funcionara bien. Se resolvió sembrando el historial con datos reales ya existentes en el servidor:
    - `medicionesReales/entry.ts` acepta ahora `incluirHistorial: true` (solo en la carga inicial de la página, nunca en el polling normal) y, en ese caso, trae en **paralelo** las últimas ~8 lecturas reales (`Promise.all` de fetches individuales por `condiciones: { lectura: N }`) en vez de solo la más reciente.
    - Medido en vivo contra el servidor real: 8 fetches en paralelo tardan **~0.3s en total** (vs. ~28s si se pidieran todos los campos de las ~1560+ filas de la tabla de una sola vez) — no añade demora perceptible a la carga de la página.
    - `useMedicionesReales.js` manda `incluirHistorial: true` únicamente en su primera llamada (`primeraCargaRef`) y, si el servidor regresa `historial`, siembra el arreglo `history` completo con esos registros reales (nunca inventados/interpolados) en vez de esperar a que lleguen uno por uno.
    - El mensaje de respaldo ("Tenemos 1 lectura real…") se deja intacto como lo que ahora es: un caso de borde genuino (tabla con muy pocas filas reales), no el camino común.

23. [x] **Corregida la escala de corriente (IFase1/2/3)**: Manuel Vega (Total Ground) confirmó por chat el 22/jul/2026 que el valor de corriente estaba mal — se le aplicaba ÷10 y debía ser ÷1000. Se corrigió en `escalarRegistro()` (`useMedicionesReales.js`) y Manuel confirmó que con ÷1000 el valor ya está bien. El resto de las escalas (voltaje ÷10, PF ÷1000, frecuencia ÷100, THD ÷10) no cambian.

Nota: `AiCopilot.jsx`, `Soporte.jsx`, `DispositivoDetalle.jsx` y `guestSupportRequest` son componentes/funciones de TG One en general, no exclusivos de la integración TOV452 — por eso no se mirroan como archivos en `backend/`/`frontend/` de este repo (que documenta específicamente el contrato de telemetría), pero se registran aquí porque todos los cambios de esta sesión de trabajo tocaron la misma app en vivo. `pruebaCrud.entry.ts` y `PruebaRegistros.jsx` sí se mirroan porque ejercitan directamente el contrato de escritura (POST/PUT/DELETE) que es el tema central de este repo.

### Verificación previa a revisión (22/jul/2026)

Antes de entregar se corrió, sobre el código ya desplegado:
- `npm run lint` en todo el proyecto — 0 errores (se corrigieron también ~12 imports sin usar preexistentes en archivos no relacionados, para dejar el proyecto completo en cero).
- `npm run build` — compila sin errores.
- `npm run typecheck` tiene ~543 errores preexistentes en todo el proyecto (tipado laxo de componentes UI compartidos, de antes de esta integración) — no son nuevos ni bloquean el build; no se tocaron por estar fuera del alcance de esta integración.
- Se confirmó en el código fuente de `react-router-dom` que `NavLink` soporta `children` como función (usado en el rediseño del sidebar para pintar el ícono según el estado activo) — no es una suposición.

`useTovLive.js` queda sin ninguna página que lo importe — es código muerto, no rompe nada, se deja documentado como historial.

## Nota de seguridad

El endpoint real sigue sin distinguir lectura de escritura por intención, solo por verbo HTTP, y ya hubo un incidente real de borrado accidental. Por eso:
- `medicionesReales` (usada por TG One) nunca manda nada distinto de `action: 'get'` — no hay forma de escribir desde ahí.
- La consola de pruebas (`dbcommQuery`, en la app "DB Data Connector") bloquea cualquier payload con la clave `campos` (la que dispara un INSERT/UPDATE reales) salvo que quien la ejecute tenga rol `admin` **y** mande `confirmarEscritura: true` explícitamente.
- `PUT`/`DELETE` contra el servidor real siguen sin exponerse desde ninguna de las dos apps.
