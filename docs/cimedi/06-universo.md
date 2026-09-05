# CIMEDI — El universo y su catálogo

CIMEDI es el centro del ecosistema: alberga a las demás plataformas, resuelve una sola vez la
identidad y los permisos, y deja el rastro de quién entró a qué. Este documento describe cómo se
representa ese universo y por qué está construido así.

## Fuente única de verdad

`src/lib/cimedi/plataformas.js` es el catálogo del universo. De ahí leen, sin duplicar la lista:

| Consumidor | Qué toma |
|---|---|
| `CommandSidebar` (menú lateral público) | `MODULE_ITEMS` |
| `/plataformas` (página pública del universo) | `plataformasPorEstado()` |
| `ModuloNav` (pie de cada ficha de módulo) | `PLATAFORMAS` para calcular vecinos |
| `/app/universo` (lanzador de la consola) | `ESTADOS`, para etiquetar registros de `AppInstance` |

La regla es que nada de esto pueda contradecirse. Si un módulo sube de estado, sube en todas partes
a la vez porque el estado vive en un solo archivo.

## Los ocho módulos

| Módulo | Estado | De dónde sale el estado |
|---|---|---|
| **TG One+** → `tgonex.com` | operativa | Dominio confirmado por Alejandro |
| **SAI · Sistema Auxiliar de Inundaciones** | operativa | `Presentacion_CIMEDI.pdf` (la fuente lo marca "En Revisión") |
| **HYDRION** | propuesta | Confirmado por Alejandro: se venderá a gobierno, aún no existe |
| **Alerta Jalisco** | pendiente de integración | La propia página lo declara: "requiere accesos" |
| **CIE · Centro de Inteligencia Energética** | conceptual | La propia página lo declara |
| **SDIF** | conceptual | La propia página lo declara |
| **Mejoramiento vial** | conceptual | La propia página lo declara |
| **Monitoreo sísmico** | por definir | Su página no declara estado; no se le atribuyó uno |

Cada tarjeta del sitio público muestra ese origen en el campo `fuente`. No es adorno: ante una
dependencia, la diferencia entre "esto ya opera" y "esto es una propuesta" no puede quedar a
interpretación, y quien lea la página debe poder verificar de dónde sale la afirmación.

## Vocabulario de estados

`ESTADOS` define cinco, ordenados de más a menos maduro:

| Clave | Significado |
|---|---|
| `operativa` | Hay sistema y hay liga que funciona. Sin las dos cosas, no es operativa. |
| `propuesta` | Oferta comercial. No existe como sistema. |
| `pendiente_accesos` | El desarrollo no es el obstáculo; faltan permisos externos. |
| `conceptual` | Alcance planteado, sin desarrollo técnico ni sensores. |
| `por_definir` | Nadie ha confirmado su estado. Un hueco declarado también es información. |

El esquema de `AppInstance` adoptó este mismo vocabulario, y su valor por omisión pasó de
`operativa` a `por_definir` a propósito: un registro nuevo no debe nacer prometiendo un acceso que
todavía no existe. `en_desarrollo` se conserva como alias de `propuesta` para no romper registros
anteriores.

## Dos caras del mismo universo

| | `/plataformas` (público) | `/app/universo` (consola) |
|---|---|---|
| Fuente | `plataformas.js` (estático) | Entidad `AppInstance` (por empresa, con RLS) |
| Quién lo ve | Cualquiera que llegue al sitio | Personal con sesión y permiso `universo.read` |
| Para qué | Presentar el ecosistema con su estado real | Entrar a cada producto, filtrado por rol |

Son dos porque cumplen fines distintos: el sitio no puede leer `AppInstance` —está protegida por
RLS— y el lanzador sí debe respetar `required_role_keys` por empresa. Comparten el vocabulario de
estados para que digan lo mismo.

Los ocho módulos quedaron registrados como `AppInstance` de la empresa operadora; antes solo
existían tres y el lanzador mostraba un universo incompleto.

## Callejones sin salida que se cerraron

Levantamiento de enlaces que no llevaban a ningún lado, y su resolución:

| Qué pasaba | Resolución |
|---|---|
| El menú lateral enlazaba `/plataformas`, que no existía como ruta | Ruta agregada en `App.jsx` dentro de `CommandLayout` |
| "¿Olvidaste tu contraseña?" apuntaba a `/forgot-password`, ruta inexistente | Apunta a `/reset-password`, que ahora tiene modo "pedir enlace" |
| `/reset-password` sin token solo decía "el enlace no es válido" | Formulario que solicita el enlace por correo vía `auth.resetPasswordRequest` |
| El pie enlazaba `#objetivo`, `#modulos`… que solo existen en la portada | Los enlaces son `/#objetivo`; `ScrollToTop` baja a la sección al aterrizar |
| El pie solo aparecía en la portada y en `/plataformas` | `CommandFooter` se movió a `CommandLayout`: lo tienen todas las páginas públicas |
| Las fichas de módulo terminaban en seco | `ModuloNav` cierra cada una con módulo anterior, siguiente y universo completo |
| `CommandHeader.jsx` no lo importaba nadie | Eliminado (código muerto; además contenía el CTA que se describe abajo) |

## "Solicitar acceso" ya no existe

El menú lateral remataba con un botón **Solicitar acceso**. Se sustituyó por **Acceder** → `/login`.

El alta en CIMEDI es exclusivamente por invitación: solo el titular emite tokens, y cada alta queda
en la bitácora. Un botón que invita a pedir cuenta prometía un trámite inexistente y sugería que la
información es pública. Es lo contrario de lo que este sistema es.

En el mismo sentido, el modo de recuperación de contraseña responde **siempre lo mismo**, exista o
no el correo capturado. Confirmar qué correos están dados de alta convertiría esa pantalla en un
directorio de funcionarios para cualquiera que la visite.

## Legibilidad

El sitio usa `muted.DEFAULT` como color de **fondo** (`--surface-2`), no de texto. Escribir
`text-muted` o `text-muted-foreground/40` producía texto casi invisible sobre el panel oscuro.

- Todo el texto usa `text-muted-foreground`; queda una advertencia en `src/index.css` explicando la
  trampa del token.
- Las opacidades bajas se elevaron: no queda ningún texto por debajo de `/85`.
- Verificación: `grep -roP "text-muted(?!-foreground)" src/` solo debe encontrar la definición en
  `index.css`.

## Pendientes

- **Logotipos** (`logo_url`) de cada plataforma en sus tarjetas; hoy se dibuja la inicial.
- **Confirmar** que `saijalisco.com` es la liga de producción de SAI.
- **Estado del monitoreo sísmico**, con la dependencia responsable.
- **Ajuste de configuración de la plataforma Base44** (login hospedado y logotipo de la app): no es
  alcanzable desde código ni desde las herramientas disponibles; se hace en el editor de Base44.
