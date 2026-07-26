# Votify — Núcleo de plataforma

Implementación de la **Directiva de Arquitectura v2.0**. Este paquete no contiene pantallas: contiene los motores sobre los que se van a construir.

## Qué está construido

| Pieza | Estado |
|---|---|
| Modelo de dominio (Venue → Room → **Moment** → Round → Options → Votes → Result) | ✅ |
| **Voting Engine** — puro, agnóstico al contenido, sin I/O | ✅ 24 pruebas |
| **Experience Engine** — estrategia por reglas, con interfaz lista para IA | ✅ |
| Bus de eventos + catálogo de eventos de dominio | ✅ |
| Puertos `ContentSource` y `ResultConsumer` | ✅ |
| Adaptadores: lista curada local + DJ humano | ✅ 2 pruebas de integración |
| Esquema Postgres multi-tenant, con conteo materializado y RLS activo | ✅ |
| Gamification / Notification / Analytics / Recommendation / Identity Engine | ⬜ Se agregan como suscriptores del bus, sin tocar lo anterior |
| Adaptadores Spotify / Apple / Soundtrack / Rockbot | ⬜ Implementan los mismos puertos |
| Frontend, dashboard del venue, pantalla del DJ | ⬜ |

```
packages/core         núcleo: cero dependencias, cero I/O, cero música
packages/providers    todo lo específico de un proveedor vive aquí
db/migrations         esquema Postgres
```

## Las cinco reglas del núcleo

`packages/core` cumple, sin excepción:

1. **No sabe qué es una canción.** Solo conoce opciones con una referencia opaca.
2. **No hace I/O.** No lee el reloj, no genera IDs, no toca red ni base de datos. Todo entra como parámetro.
3. **No lanza excepciones.** Todo fallo del dominio es un valor tipado (`Result`).
4. **Es puro.** Mismas entradas, mismas salidas — dos servidores llegan al mismo conteo.
5. **Cero dependencias de runtime.**

Estas reglas son la razón por la que el motor no se va a reescribir cuando cambien la UI, la base de datos o el proveedor de música.

## Por qué existe `Moment`

La directiva aprobó `Venue → Room → Voting Round → Options → Votes → Result`. Ese modelo deja fuera toda experiencia que no sea una votación: un brindis, un gol, un anuncio, una promoción activada por el host. Sin un contenedor común, cada una habría necesitado su propia jerarquía — el error que v2.0 prohíbe, un nivel más arriba.

**Un Momento es la experiencia colectiva; votar es una de sus mecánicas** (`vote`, `broadcast`, `reaction`, `ambient`).

Tres consecuencias concretas:

- El Experience Engine tiene sujeto: su trabajo es decidir **qué Momento lanzar**, no "abrir una ronda".
- La analítica tiene unidad: *"¿qué experiencia genera mayor permanencia?"* es una pregunta sobre Momentos.
- El ADN queda en el esquema y no solo en la narrativa.

## La prueba que protege la arquitectura

`packages/core/test/voting-engine.test.ts` corre el mismo motor sobre rondas de `song`, `promo`, `karaoke_slot`, `dj_battle`, `challenge` y `lighting_preset` — con cero código específico por tipo, y verifica que el resultado ni siquiera menciona el tipo de contenido.

**Ese bloque debe romperse el día que alguien intente meter una canción en el núcleo.** Es la regla #2 de la directiva, hecha ejecutable.

## Decisiones que conviene conocer

**El presupuesto de votos se aplica en la base de datos.** `UNIQUE (round_id, participant_id, vote_slot)` más un trigger contra la política de la ronda. Dos peticiones simultáneas del mismo teléfono pueden pasar la validación de aplicación a la vez; no pueden pasar un índice único. La credibilidad del conteo es lo único que este producto no puede perder.

**Idempotencia obligatoria en cada voto.** La red de un bar es mala y la gente da doble tap. Un reintento tardío tiene éxito aunque la ronda ya haya cerrado — castigar al usuario por una red que no controla sería un bug de producto.

**El conteo está materializado.** Nadie hace `COUNT(*)` sobre `votes` para pintar la pantalla; un trigger mantiene `round_option_tallies` y el realtime transmite esas filas, agregadas y con coalescing. Transmitir voto por voto a 500 personas es tráfico cuadrático, y tumba exactamente la noche que hay que ganar.

**El desempate aleatorio es reproducible.** Semilla fija, hash determinista. Ante un venue que reclame que su concurso salió mal, `Math.random()` deja el resultado indefendible.

**El Experience Engine todavía no usa IA, y es deliberado.** Un modelo necesita datos que hoy no existen: nadie ha usado Votify en un bar real. La interfaz `ExperienceStrategy` ya está; hoy la implementa un conjunto de reglas explicables y depurables a las 11 de la noche. Cada sugerencia guarda su `rationale` y su `confidence`, y cada Moment guarda su `origin` — el sistema está registrando desde hoy qué sugirió, por qué, y si funcionó. **Eso es el dataset.** Cuando existan mil noches, se escribe `AIExperienceStrategy` con la misma firma y se cambia una inyección.

**Votify no reproduce.** El adaptador `manual-dj` es la prueba de que el ciclo completo funciona sin ninguna integración de audio: la ronda entrega un resultado, una pantalla lo muestra, una persona lo pone. Es el adaptador estratégicamente más importante que hay — hace a Votify instalable en cualquier establecimiento del mundo sin negociar con Spotify y sin heredar riesgo de licenciamiento de ejecución pública. Los demás adaptadores son optimizaciones sobre este.

## Correr

```bash
pnpm install
pnpm -r test        # 26 pruebas
pnpm -r typecheck   # strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
```

## Pendiente de definir

- **Tokens de marca.** Los hex del brief son aproximaciones leídas del moodboard. Fijar un design system sobre valores aproximados es deuda que se paga en cada pantalla — hace falta el archivo fuente o una confirmación explícita de que aproximamos.
- **Antifraude.** La identidad anónima es falsificable por diseño (borrar `localStorage` y volver a entrar). Irrelevante para votar canciones; crítico antes de cualquier Momento con premio. El `join_code` ya rota por sesión, pero falta la estrategia completa.
- **Proveedor de auth**, para escribir las políticas RLS concretas en `0002`.
