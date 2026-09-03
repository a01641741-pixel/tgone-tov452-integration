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
- `backend/guardarLecturaHistorica.entry.ts` — función server-side que persiste snapshots reales de telemetría en la entidad `LecturaHistorica`, para tener tendencias históricas genuinas (no solo la cola en vivo de la tabla externa). Nunca confía en datos del cliente: siempre vuelve a consultar la fuente real antes de guardar, y deduplica por `tabla_bd_externa`+`lectura`.
- `backend/LecturaHistorica.entity.jsonc` — esquema de la entidad donde se guardan esos snapshots (campos crudos, misma convención de escalas que `medicionesReales`).
- `frontend/TendenciasHistoricas.jsx` — componente que lee `LecturaHistorica` y muestra min/prom/máx reales y una curva histórica real, con selector de rango (24h / 7 días / todo). Integrado en el Dashboard Ejecutivo.

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
24. [x] **Nuevo "Dashboard Ejecutivo"** (`src/pages/DashboardEjecutivo.jsx`, ruta `/dashboard-ejecutivo`, primer item del grupo "Telemetría en vivo (real)" en el menú) a petición de Sergio (dueño del proyecto): pidió un dashboard con "mucha información y muchas gráficas", con estética cuidada y líneas que se vean en constante movimiento para dar efecto de tiempo real. Se construyó combinando telemetría real del TOV452 con datos operativos reales (Dispositivo/Ticket/ActivoIndustrial/VinculacionDispositivo), todo vía `useMedicionesReales` y `fetchMany` — **nada inventado**:
    - `useMedicionesReales({ tabla: 'TOV452_66', intervalMs: 5000 })` — refresco cada 5s (más rápido que los 15s de "Mediciones Reales") para que las curvas se vean vivas; sigue siendo polling real, nunca datos sintéticos.
    - 6 tarjetas de KPI en vivo (frecuencia, voltaje promedio, corriente total, factor de potencia promedio, señal RSSI, energía) con minigráfica real de fondo.
    - Curvas de área (voltaje y corriente por fase), línea de doble eje (frecuencia + PF), barras agrupadas (THD-V vs THD-I por fase) y un radar de "huella armónica" (las 6 series THD reales en un solo radar, mismo % en las 6, sin normalizar ni mezclar unidades distintas — se descartó a propósito un radar que mezclara voltaje/corriente/PF porque hubiera requerido normalizar contra rangos supuestos, no medidos).
    - Dona de dispositivos por estado y dona de tickets por prioridad (conteos reales de las entidades Base44), más un indicador de cobertura de monitoreo (% de activos industriales con dispositivo vinculado).
    - Feed de las últimas 10 lecturas reales acumuladas (tabla compacta), distinto del "Registro completo" de Mediciones Reales (que muestra 1 registro con todos los campos crudos) — aquí se muestran varias lecturas con columnas clave.
    - El "efecto de tiempo real" (marquesina de valores con scroll continuo, borde con pulso suave en el ícono del encabezado) es decoración CSS pura sobre datos reales — no se fabrica ningún punto ni se acelera el reloj de las lecturas para simular movimiento.

25. [x] **Corregido un bug real de animación que podía dar la impresión de datos falsos "subiendo y bajando"**: el usuario pidió explícitamente que todo movimiento visual sea real, basado en las lecturas reales. Al revisar el código se encontró que varias gráficas de Recharts (áreas/líneas/barras/radar/dona en `DashboardEjecutivo.jsx`, el medidor circular `RadialBar` en `PhaseGauge` de `MedicionesReales.jsx`, y la barra `Bar` del historial en `DispositivoDetalle.jsx`) no tenían `isAnimationActive={false}`. Como el hook `useMedicionesReales` genera un objeto/array nuevo en cada sondeo (cada 5s o 15s según la página) **aunque el valor real no haya cambiado**, Recharts detectaba una "nueva data" y repetía su animación de entrada/barrido — dando la impresión visual de movimiento aunque el medidor físico no hubiera mandado nada nuevo. Se corrigió agregando `isAnimationActive={false}` a todas esas series (ya era el patrón usado en los `Line` de `MedicionesReales.jsx` y `DispositivoDetalle.jsx`, que sí estaban bien desde antes). Ahora cualquier movimiento visual en toda la app corresponde exclusivamente a un cambio real y verificable en los datos.
26. [x] Con las animaciones de redibujado apagadas (ítem 25), las curvas se quedaban visualmente "congeladas" entre lecturas reales (el medidor a veces tarda más de un minuto en mandar la siguiente) — el usuario pidió que se sintiera movimiento constante de todos modos, sin volver a inventar datos. Se agregó un **marcador pulsante** (`makeLiveDot`, animación SVG nativa `<animate>` sobre el último punto real ya graficado) en las curvas de Voltaje/Corriente/Frecuencia+PF de `DashboardEjecutivo.jsx` y en las de "Curvas en tiempo real" de `MedicionesReales.jsx` — es un efecto puramente decorativo (un anillo que pulsa sobre el punto más reciente) que transmite "esto sigue vivo y conectado" sin mover ni un pixel la posición real del dato. Se ajustaron los márgenes de esas gráficas para que el anillo no se recorte contra el borde. La marquesina de valores reales (ya existente en `DashboardEjecutivo.jsx`) sigue siendo la otra fuente de movimiento constante — texto real en scroll continuo, no gráficas fabricadas.
27. [x] **Bug real corregido: la foto del dispositivo no hacía nada visible al hacer clic** (reportado por el usuario en la ficha de un dispositivo, `/dispositivos/:id`). Causa raíz: el diálogo de zoom (`DispositivoDetalle.jsx` línea ~330) renderiza el componente `Image` (`src/components/ui/image.jsx`) con `fittingType="fit"` y solo la clase `w-full`, sin alto ni `aspect-ratio` — como las dos etiquetas `<img>` internas de `Image` están en `position: absolute`, no aportan altura al contenedor en flujo normal, así que el `<span>` envolvente colapsaba a **0px de alto**. El diálogo sí se abría (el botón de cerrar y el título accesible estaban ahí), pero la foto ampliada era invisible — exactamente la sensación de "no pasa nada al hacer clic". Era el único uso de `fittingType="fit"` en toda la app sin una altura fija en el contenedor (el thumbnail chico sí funciona porque su botón padre tiene `h-20` fijo). Se corrigió agregando `h-[70vh] max-h-[600px]` a la clase del diálogo ampliado.
28. [x] **Historial inicial más rico**: se aumentó `NUM_HISTORIAL` de 8 a 20 en `medicionesReales/entry.ts` — confirmado en vivo que 20 lecturas reales en paralelo (con los 19 campos completos) tardan ~1.2s en total, sin bloquear la carga. Con solo 8 lecturas la variación real casi no se notaba en las curvas; con 20 los picos y valles genuinos del medidor son visibles desde el primer render, sin esperar a que se acumulen con el polling en vivo.
29. [x] **Dominios de eje Y con margen real**: las curvas de Voltaje/Corriente/Frecuencia (`DashboardEjecutivo.jsx` y "Curvas en tiempo real" de `MedicionesReales.jsx`) usaban `domain={['auto','auto']}`, lo que pega el pico o valle real justo contra el borde de la gráfica. Se agregó `paddedDomain()` — calcula `[mín - margen, máx + margen]` sobre los valores reales ya mostrados (margen = 8% del rango real observado, nunca un valor inventado) — para que la variación real se lea con claridad.
30. [x] **Bug sistémico real corregido: campos fantasma `estado_conexion` y `codigo_interno`**. Al revisar a fondo el área de Dispositivos (por indicación de Manuel/Boris de enfocarnos ahí) se encontró que 6 archivos (`Dispositivos.jsx`, `Home.jsx`, `ReportGenerator.jsx`, `KpiDetailDialog.jsx`, `DispositivoDetalle.jsx` en su rama de dispositivos sin telemetría real, y `AiCopilot.jsx`) leían/escribían campos `estado_conexion` y `codigo_interno` que **no existen en el esquema real** de `Dispositivo` (los campos reales son `estado` — enum `Activo`/`Inactivo`/`En configuración`/`Con falla` — y `codigo`). Esto significaba que, silenciosamente:
    - La columna "Estado" y "Código" en la lista de Dispositivos siempre aparecía vacía.
    - El KPI **"Dispositivos Offline" en el Centro de Control (`Home.jsx`) siempre marcaba 0**, sin importar cuántos dispositivos reales tuvieran falla.
    - El formulario de alta/edición de Dispositivo dejaba elegir un estado de conexión ("Online"/"Offline"/etc.) que nunca se reflejaba en el campo real `estado` que sí usan las alertas, badges y `notificationUtils.js` en el resto de la app.
    - TG AI recibía `estado: undefined` para todos los dispositivos en su contexto.
    Se corrigieron los 6 archivos para usar `estado`/`codigo` consistentemente, con el enum real, y el filtro "offline" ahora usa el mismo criterio que `notificationUtils.js` (`estado === 'Con falla' || estado === 'Inactivo'`) para que el KPI, las alertas del sidebar y el feed de eventos concuerden entre sí.

31. [x] **Mapa de locaciones corregido: era falso, ahora es real**. El usuario reportó que "el mapa de locaciones no es real, no está operando y no funciona". Se confirmó revisando `src/components/ops/OpsMap.jsx`: no era un mapa real en absoluto, sino una proyección lineal casera de lat/lng sobre un `<div>` con degradado decorativo y anillos de "contorno" falsos — nunca mostraba geografía real de fondo (ni calles, ni costa, ni nada reconocible). Lo notable: **`react-leaflet` (y su dependencia `leaflet`) ya estaban instalados en el proyecto pero nunca se usaban en ningún archivo** — el mapa real estaba a un `import` de distancia y nadie lo conectó. Se reescribió `OpsMap.jsx` para usar `react-leaflet` con tiles reales de OpenStreetMap (gratis, sin API key): `MapContainer` + `TileLayer` (servidor público `tile.openstreetmap.org`, con la atribución que exige su política de uso) + `CircleMarker` por locación (coloreado por el mismo estado de salud que antes: verde/amarillo/rojo/gris), con `FitBounds` para encuadrar automáticamente todas las locaciones reales. Se agregó `leaflet` como dependencia explícita en `package.json` (antes solo estaba como dependencia transitiva de `react-leaflet`). Verificado en vivo con `curl` que el servidor de tiles responde con imagen real (38.5 KB, con calles y etiquetas) para las coordenadas reales de Total Ground — Zapopan (20.64296, -103.42794) — no un tile en blanco.

32. [x] **Nueva entidad `LecturaHistorica` + tendencias históricas reales persistentes**, a petición explícita del usuario de seguir creciendo la plataforma con algo "absolutamente real". Hasta este punto, "picos y valles" solo cubrían lo acumulado desde que se abría la página (o las ~20 lecturas sembradas al cargar) — sin profundidad histórica real de días/semanas. Se construyó un pipeline completo:
    - **Entidad nueva `LecturaHistorica`** (ver `backend/LecturaHistorica.entity.jsonc`): guarda snapshots reales (campos crudos, misma convención de escalas que `medicionesReales`), deduplicados por `tabla_bd_externa` + `lectura`. RLS: lectura abierta, escritura solo vía `asServiceRole` (la función), nunca expuesta a creación directa desde el cliente.
    - **Backfill real inicial**: se consultó la tabla externa `TOV452_66` y se confirmó que ya existían **16 días reales de historia** (6 al 22 de julio de 2026, ~1622 filas). Se seleccionaron 33 lecturas reales distribuidas en buckets de 6h a lo largo de todo ese rango (algunos buckets sin lectura son huecos reales del medidor, no se rellenaron), se trajeron en paralelo (~1.5s) y se insertaron tal cual en `LecturaHistorica` — 100% lecturas reales ya existentes en el servidor, cero inventadas.
    - **`backend/guardarLecturaHistorica.entry.ts`** (nueva función): guarda snapshots hacia adelante. A propósito **nunca confía en datos que mande el navegador** — recibe solo `{ tabla }` y ella misma vuelve a consultar la fuente real (mismo contrato de solo lectura que `medicionesReales`) antes de guardar, con deduplicación server-side. Esto cierra un posible hueco de integridad: nadie puede forjar "historial falso" llamando a la función con un payload arbitrario, porque el payload no importa.
    - **`useMedicionesReales.js`** ahora llama a `guardarLecturaHistorica` en segundo plano (fire-and-forget, sin bloquear la UI) cada vez que detecta una lectura real genuinamente nueva — así el historial sigue creciendo mientras alguien tenga la app abierta, sin depender de un cron server-side (Base44 no expone uno a través de las herramientas disponibles; depender de la propia infraestructura de este asistente para eso habría sido una dependencia oculta y fragil, así que se descartó a propósito).
    - **`frontend/TendenciasHistoricas.jsx`** (nuevo componente, integrado en el Dashboard Ejecutivo): lee `LecturaHistorica`, calcula mín/prom/máx reales de voltaje/frecuencia/corriente y grafica una curva histórica real, con selector de rango (24h / 7 días / todo). Incluye una nota honesta explícita: esto no es monitoreo continuo 24/7, solo se guarda una lectura cuando alguien tiene la app abierta (más el respaldo inicial), así que puede haber huecos reales — para no dar una falsa impresión de cobertura continua que no existe.
    - Se agregó `LecturaHistorica` al whitelist de `guestRead` para que tanto invitados como personal autenticado puedan ver las tendencias.

33. [x] **Pantalla de Paginación/CRUD de `prueba` llevada al siguiente nivel**, a petición explícita de Boris/el usuario ("que quede pasado de verga"). Sobre la base ya funcional (paginación, alta/edición/borrado con validación por tipo real de columna) se agregó:
    - **Búsqueda real** (`pruebaCrud` acción `list`, parámetro `search`) sobre Nombre/Descripcion/Status/nivel, con debounce de 350ms en el frontend para no golpear la función en cada tecla.
    - **Orden por columna real**: clic en cualquier encabezado ordena asc/desc (parámetros `sortBy`/`sortDir`, resueltos en memoria en el backend igual que la paginación, porque el servidor externo tampoco soporta `orden` — ya confirmado antes con `TOV452_66`).
    - **Selección múltiple + borrado masivo real** (`action: 'bulkDelete'`, nuevo en `pruebaCrud`): borra en paralelo cada id seleccionado contra el servidor real, con confirmación explícita.
    - **Duplicar registro**: precarga el formulario de alta con los datos de una fila existente (sufijo "(copia)" en el Nombre) para crear una copia rápida.
    - **Toggle inline del booleano** directo en la tabla (sin abrir el modal) — manda el registro completo al backend (no solo el campo cambiado) para no pisar el resto de las columnas con `null`, ya que el backend reemplaza `campos` tal cual se le pasan.
    - **Exportar a CSV** real (hasta 1000 filas, respetando la búsqueda/orden activos), generado y descargado 100% en el cliente.
    - **Estadísticas reales** en vivo: total de registros, cuántos tienen el booleano activo, cuántos coinciden con el filtro actual — todas calculadas por el backend sobre los datos reales de la tabla, no inventadas.
    - Contadores de caracteres en tiempo real en los campos de texto del formulario (Nombre/Descripcion/Status/nivel) para que sea obvio cuánto falta antes de topar el límite real de la columna.

34. [x] **"Total View" (`/monitoreo/total-view`) dejó de ser una maqueta de demostración y ahora usa telemetría real**. El usuario reportó: "dice Datos de ejemplo — sitio de demostración. Los quiero reales". Esta página vivía separada del dispositivo real "Total View TOV452" (mismo nombre comercial, pero código distinto: `useSimulated` + `Math.random()` cada 6s, sin relación con `useMedicionesReales`). Como sí existe el equipo real, se reescribió `src/pages/monitor/TotalView.jsx` para consumir `useMedicionesReales({ tabla: 'TOV452_66' })` en vez de datos simulados:
    - Los medidores analógicos (voltaje ×3, frecuencia, factor de potencia) ahora muestran valores reales.
    - Se quitaron "Potencia activa/reactiva" (no existen esos campos en la telemetría real del TOV452 — inventarlos hubiera sido fabricar datos) y se reemplazaron por **Energía acumulada (kWh) y Señal (RSSI)**, que sí son campos reales.
    - La curva de voltaje por fase usa el historial real acumulado (`history`), no una serie sintética.
    - Los "eventos" (antes 3 líneas de texto fijas e inventadas) ahora se calculan sobre las lecturas reales acumuladas: cualquier lectura real donde una fase salga del rango 114-127V aparece como evento real, con su lectura y fecha real — si no hay ninguna, se dice honestamente que no hay eventos, en vez de mostrar algo inventado.
    - El panel de información del dispositivo (`MonitorShell`) ahora recibe datos reales (nombre y código reales del `Dispositivo`, ubicación real resuelta vía Activo→Área→Locación) en vez de un serial/firmware/ubicación ficticios — los campos que no existen de verdad (firmware, conectividad) se dejan honestamente en blanco («—») en vez de inventarse.
    - Se agregó un prop `demo` a `MonitorShell` y a `downloadMonitorReport` (default `true`, sin afectar a los otros 5 módulos que siguen siendo demos simuladas a propósito — Terrómetro, Contador de Descargas, Sensor de Gas, Sensor de Presión, Calidad de Energía, ninguno con un dispositivo real detrás): con `demo={false}` muestran un badge verde "Dato real conectado" y el PDF generado dice explícitamente que son datos reales, no simulados.
    - En el menú lateral, "Total View" se movió del grupo "Demos de producto (simulado)" al grupo "Telemetría en vivo (real)".

35. [x] **Navegación jerárquica real: Empresa → Locación → Área → Activo → Dispositivo**. El usuario compartió una foto de un diagrama de pizarrón (Institución/Empresa → Locación → Activo → Dispositivo) con el comentario "dashboard no lleva a nada, el quiere que siga esta ruta". Se investigó el estado real de cada tramo de esa cadena en el código:
    - `Areas.jsx` y `ActivosIndustriales.jsx` **ya** navegaban al hacer clic en una fila (`onRowClick` a `/areas/:id` y `/activos/:id`), y `AreaDetalle.jsx`/`ActivoDetalle.jsx` ya existían mostrando a los hijos reales de cada uno (Área → sus Activos; Activo → sus Dispositivos vinculados, tickets, eventos).
    - **`Locaciones.jsx` era el único tramo roto**: no tenía `onRowClick`, así que al hacer clic en una locación solo se abría el modal genérico de edición — no había manera de bajar de Locación a sus Áreas. Esto es exactamente lo que el diagrama pedía y lo que el reporte "no lleva a nada" describe.
    - Se agregó `onRowClick={(item) => navigate('/locaciones/${item.id}')}` en `Locaciones.jsx` y una ruta nueva `/locaciones/:id` en `App.jsx`.
    - Se creó `src/pages/LocacionDetalle.jsx` (mismo patrón que `AreaDetalle.jsx`/`ActivoDetalle.jsx`, usando `fetchOne`/`fetchMany` de `src/lib/guest.js`, que ya funcionan en modo invitado y con sesión real): muestra los datos reales de la Locación (nombre, dirección, estado, Institución), la lista real de sus Áreas (filtrando `Area` por `locacion_id`, con conteo real de activos por área) con clic a `/areas/:id`, y los datos de la Institución/Empresa dueña.
    - Se completó el último tramo que faltaba: en `ActivoDetalle.jsx`, los Dispositivos vinculados se mostraban en una lista pero no eran clicables — se agregó navegación real a `/dispositivos/:id` al hacer clic en cada uno (cuidando de no disparar la navegación al usar el botón de eliminar vinculación, con `stopPropagation`).
    - Con esto la cadena completa del diagrama ya es clic-a-clic real de principio a fin: Locación → Área → Activo → Dispositivo. Ningún dato nuevo fue inventado — toda la información mostrada en `LocacionDetalle.jsx` viene de relaciones ya existentes en el esquema real (`locacion_id`, `area_id`, `institucion_id`).
    - Verificado con `npm run lint` (0 errores) y `npm run build` (compila) tras el cambio.

36. [x] **Modo Invitado desactivado por completo (seguridad)**. El usuario reportó: "ya la puse en privada pero..." — pidió que "absolutamente nadie pueda entrar, solo a quienes yo dé de alta puedan verla". Se encontró que, aunque la app se puso en privada desde el panel de Base44, seguía existiendo un acceso paralelo sin autenticación: la ruta pública `/invitado` (`src/pages/Invitado.jsx`) activaba una bandera de `localStorage` que hacía que `src/lib/guest.js` leyera datos reales (Institución, Locación, Área, ActivoIndustrial, Dispositivo, Ticket, Usuario, etc.) a través de la función de backend `guestRead`, la cual usaba `asServiceRole` **sin revisar ninguna sesión** — es decir, cualquiera con el link entraba y veía datos reales sin correo ni contraseña, y el toggle de "privada" de Base44 no cerraba ese camino porque es una función custom, no la puerta de entrada estándar de la plataforma. Se desactivó de raíz:
    - `guestRead` ahora rechaza toda solicitud (403) sin tocar ninguna entidad — no se restauró "leyendo menos", se restauró "leyendo nada".
    - `src/lib/guest.js` se neutralizó: `isGuest()` siempre regresa `false` (ni manipulando `localStorage` se puede reactivar), `enterGuest()` es un no-op, y `fetchList`/`fetchOne`/`fetchMany` siempre usan el SDK normal con sesión real — sin tocar los ~15 archivos que ya importaban estas funciones (el cambio es transparente para ellos).
    - Se eliminó la ruta `/invitado` de `App.jsx` y el archivo `src/pages/Invitado.jsx` (sin uso).
    - Se quitaron los botones que activaban el modo invitado en `Login.jsx` ("Continuar como invitado", "Ver catálogo de productos") y `Presentacion.jsx` ("Ver Catálogo") — ambos llamaban `enterGuest()` antes de navegar.
    - Se dejó intacta `guestSupportRequest` (permite que un visitante sin cuenta cree un ticket de soporte): a diferencia de `guestRead`, es de solo escritura, no expone ningún dato real de vuelta, y funciona como un formulario de contacto público — no es el problema que se reportó.
    - Ya existía, y sigue funcionando exactamente como se pidió, la pantalla real de alta de usuarios: `src/pages/AltaUsuarios.jsx` (`/alta-usuarios`), restringida por backend (`base44/functions/emitirInvitacion/entry.ts`) a un único correo propietario — captura correo + rol y usa la invitación nativa de Base44 (`base44.auth.inviteUser`) para que la persona invitada configure ella misma su primera contraseña por correo; el propietario nunca la ve ni la escribe.

37. [x] **TG AI reparado**: el usuario reportó "le pregunto por novedades y no sabe de qué hablo... tiene que arrojarme reportes enteros, saber de todo, hacer sugerencias". Se investigó `src/components/AiCopilot.jsx` (frontend) y `base44/functions/tgAiQuery/entry.ts` (backend) y se encontraron dos causas reales:
    - **Bug real**: el filtro que arma `dispositivos_offline` comparaba `estado` contra `'Offline'`, `'Alerta'`, `'Sin comunicación'` — valores que **nunca existieron** en el enum real de `Dispositivo.estado` (`Activo`/`Inactivo`/`En configuración`/`Con falla`, ver ítem 30). El conteo de dispositivos con falla siempre daba 0, así que TG AI nunca podía reportar un problema real aunque existiera en los datos. Corregido para comparar contra `'Con falla'`/`'Inactivo'` (mismo criterio que `notificationUtils.js`).
    - **Diseño real**: cada pregunta —incluso "genera un resumen del día"— se enterraba bajo un catálogo completo de 400 productos (`CATALOGO_CONTEXT` + lista de `Producto`) que `tgAiQuery` agregaba siempre al prompt, sin importar si la pregunta era sobre operación o sobre productos, además de pedir contexto de internet (`add_context_from_internet: true`) para datos que ya son privados y reales. Se hizo que el catálogo y el contexto de internet solo se incluyan cuando el frontend detecta (por palabras clave) que la pregunta realmente es sobre productos/catálogo — el resto de las preguntas llegan limpias.
    - Se agregó `actividad_reciente` al contexto que recibe TG AI: los últimos 15 eventos reales (tickets nuevos, dispositivos que entraron en falla, activos/usuarios registrados), con la misma lógica que ya usa el timeline de Inicio — antes TG AI no recibía ningún dato con fecha, así que no tenía forma de responder "¿qué novedades hay?".
    - Se agregaron instrucciones explícitas en el `SYSTEM_PROMPT` para que TG AI use esa actividad reciente al responder sobre "novedades" y para que ofrezca sugerencias accionables basadas únicamente en datos reales cuando la situación lo amerite (dispositivos con falla, activos sin monitoreo, tickets críticos, telemetría fuera de rango) — nunca inventadas.

38. [x] **Interfaz amigable para no ingenieros**: a petición explícita del usuario ("quiero que cualquier persona pueda entender qué es TGOne, cómo se usa, qué se mide, si la medición está en rangos normales, si hay que revisarlos o de plano intervenir"), se le preguntó si prefería ocultar lo técnico detrás de un "modo simple" o mantener todo visible con ayuda en lenguaje simple superpuesta — eligió la segunda opción explícitamente. Se construyó:
    - `src/lib/estadoSalud.js`: única fuente de verdad de un semáforo de 3 estados (normal/revisar/alerta), reutilizando los mismos umbrales reales que ya usaba la app en otros lugares (voltaje 114–127V de `VOLT_ZONES` en `TotalView.jsx`, frecuencia 59.5–60.5Hz, factor de potencia 0.90/0.95, y los mismos "bien"/"mal" de THD-V/THD-I que `riesgoPredictivo.js` cita de IEEE 519/NEMA MG1) — no se inventó ningún rango nuevo.
    - `src/components/EstadoSalud.jsx`: banner grande y versión compacta que traducen ese semáforo a una frase clara ("Todo funciona con normalidad" / "Hay algo que conviene revisar" / "Se requiere intervención") con los motivos reales listados debajo.
    - `src/lib/glosario.js` + `src/components/InfoTecnico.jsx`: un ícono "?" junto a cada término técnico (Voltaje, Frecuencia, Factor de potencia, THD, Corriente, RSSI, kWh) que abre una explicación en español simple más el rango normal real — sin ocultar ni reemplazar el número real.
    - `src/components/AyudaTgOne.jsx`: modal "¿Qué es TG One?" invocable en cualquier momento desde un botón "?" nuevo en el header (`Layout.jsx`) — explica qué es la plataforma, qué mide, y qué significa cada color del semáforo.
    - Todo esto se insertó en `Home.jsx` (banner de estado general de toda la operación, vía `evaluarSistema()`), `MedicionesReales.jsx`, `DashboardEjecutivo.jsx` y `TotalView.jsx` (banner de estado de la lectura actual, vía `evaluarLectura()`, más los íconos de glosario junto a las etiquetas técnicas existentes).
    - Bug propio detectado y corregido en el camino: el ícono de ayuda inicialmente se renderizó como un `<button>` anidado dentro de tarjetas ya clicables (`DigitalTile`/`Fase` en `MedicionesReales.jsx`) — HTML inválido con clics impredecibles. Se corrigió usando un `<span role="button">` con manejo de teclado en vez de un `<button>` real.

39. [x] **Módulos de demostración archivados del menú lateral**: el usuario reportó que mezclar los 5 módulos simulados (Terrómetro, Contador de Descargas, Sensor de Gas, Sensor de Presión, Calidad de Energía) con la telemetría real en el mismo menú "confunde muchísimo", y pidió simplificar. Se quitó el grupo "Demos de producto" completo de `navGroups` en `src/components/Sidebar.jsx` (ya no aparece en el menú ni en el buscador del sidebar) — las rutas y el código de esas 5 páginas (`src/pages/monitor/*.jsx`) se dejaron intactos, sin usar, por si se retoman más adelante con un dispositivo real detrás.

40. [x] **Catálogo interno reemplazado por un enlace al inventario real**. El usuario pidió: "en el apartado de catálogo mejor quita todo lo que llevamos, si alguien quiere conocer todo nuestro catálogo, que al hacer clic lleve al inventario: https://www.totalground.com/catalogo". Se eliminaron `src/pages/Catalogo.jsx`, la ruta `/catalogo` en `App.jsx`, y los 4 componentes que solo existían para esa pantalla (`src/components/catalogo/ProductoCard.jsx`, `ProductoDialog.jsx`, `PortafolioWidget.jsx`, `FamiliaConfig.jsx` — carpeta completa borrada) junto con el widget de portafolio que se mostraba en Inicio. El ítem "Catálogo de Productos" del menú lateral (`src/components/Sidebar.jsx`) ahora es un `<a>` externo (`target="_blank"`, con ícono de salida) directo a `https://www.totalground.com/catalogo`, en vez de una ruta interna — se le agregó un caso especial (`item.external`) en `renderItem` para no forzar un `NavLink` sobre una URL externa. No se tocó la entidad `Producto` ni la función `tgAiQuery`: TG AI sigue pudiendo responder preguntas sobre productos desde el chat (eso es una función de conversación, no "el apartado de catálogo" que se pidió quitar).

Nota: `AiCopilot.jsx`, `Soporte.jsx`, `DispositivoDetalle.jsx`, `DashboardEjecutivo.jsx`, `OpsMap.jsx`/`Home.jsx`, `TotalView.jsx`/`MonitorShell.jsx`/`monitorReport.js`, `Locaciones.jsx`/`ActivoDetalle.jsx`/`App.jsx`, `guestSupportRequest`, `guestRead`/`guest.js`/`Invitado.jsx`/`Login.jsx`/`Presentacion.jsx`, `tgAiQuery`, `Sidebar.jsx`/`Layout.jsx`, `EstadoSalud.jsx`/`InfoTecnico.jsx`/`AyudaTgOne.jsx`, y `Catalogo.jsx`/`ProductoCard.jsx`/`ProductoDialog.jsx`/`PortafolioWidget.jsx`/`FamiliaConfig.jsx` (eliminados) son componentes/funciones de TG One en general, no exclusivos de la integración TOV452 — por eso no se mirroan como archivos en `backend/`/`frontend/` de este repo (que documenta específicamente el contrato de telemetría), pero se registran aquí porque todos los cambios de esta sesión de trabajo tocaron la misma app en vivo. `pruebaCrud.entry.ts`, `PruebaRegistros.jsx`, `guardarLecturaHistorica.entry.ts`, `LecturaHistorica.entity.jsonc`, `TendenciasHistoricas.jsx`, `LocacionDetalle.jsx`, `estadoSalud.js` y `glosario.js` sí se mirroan porque documentan o ejercitan directamente el contrato/los valores reales de telemetría.

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
