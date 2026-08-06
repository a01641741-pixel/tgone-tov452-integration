# CIMEDI — Roles y permisos

## Modelo

Dos capas independientes, y conviene no confundirlas:

1. **RLS (backend, no negociable):** decide **de qué empresa** son los datos que alguien puede
   tocar. Vive en el esquema de cada entidad y se evalúa del lado del servidor.
2. **Matriz de permisos (rol, editable):** decide **qué puede hacer** dentro de su empresa. Se
   consulta en la UI con `can(modulo, accion)`.

Ningún rol, por permisivo que sea, cruza la frontera de la capa 1.

## Acciones

| Acción | Significado |
|---|---|
| `read` | Ver el módulo y sus registros. Sin esto el módulo no aparece en el menú. |
| `create` | Dar de alta registros nuevos, incluida la importación CSV. |
| `update` | Editar registros existentes. |
| `delete` | Eliminar registros. |
| `export` | Descargar a CSV/PDF. Se separa de `read` porque sacar datos de la plataforma es un acto distinto a consultarlos — y queda auditado. |

Reglas de consistencia que aplica el editor: quitar `read` apaga todo lo demás del módulo;
encender cualquier acción enciende `read`.

## Roles base precargados

Se crean en cada empresa nueva y son un punto de partida editable, no una jaula.

| Rol | Nivel | Para quién | Alcance |
|---|---|---|---|
| **Administrador** | 0 | Responsable de la plataforma | Todo, incluidos catálogos, roles y configuración |
| **Supervisor** | 10 | Jefatura de operación | CRUD completo de infraestructura, alertas, mantenimiento y tickets. Lee usuarios y auditoría. **No** edita roles ni configuración |
| **Técnico de campo** | 20 | Cuadrillas | Ejecuta: cierra mantenimientos, atiende tickets, actualiza activos y dispositivos. **No** crea infraestructura ni ve usuarios, roles ni auditoría |
| **Consulta** | 30 | Dirección, enlaces externos | Solo lectura de operación e infraestructura, con exportación de monitoreo |
| **Auditor** | 25 | Contraloría / OIC | Lectura total **más** bitácora de auditoría y exportación de evidencia |

### Matriz resumida

`✓` = permitido · `R` = solo lectura · `—` = sin acceso

| Módulo | Admin | Supervisor | Técnico | Consulta | Auditor |
|---|---|---|---|---|---|
| Inicio | ✓ | ✓ | R | R | R+exp |
| Monitoreo | ✓ | ✓ | R+exp | R+exp | R+exp |
| Alertas | ✓ | ✓ | R+editar | R | R+exp |
| Locaciones | ✓ | ✓ | R | R | R+exp |
| Áreas | ✓ | ✓ | R | R | R+exp |
| Activos | ✓ | ✓ | R+editar | R | R+exp |
| Dispositivos | ✓ | ✓ | R+editar | R | R+exp |
| Calendario | ✓ | ✓ | R+editar+exp | R | R+exp |
| Reportes | ✓ | ✓ | R | R | R+exp |
| Mesa de ayuda | ✓ | ✓ | ✓ (sin borrar) | R | R+exp |
| Soporte | ✓ | ✓ | ✓ (sin borrar) | R | R+exp |
| Usuarios | ✓ | R+exp | — | — | R+exp |
| Roles y permisos | ✓ | R | — | — | R |
| Equipos | ✓ | ✓ | R | — | R+exp |
| Catálogos | ✓ | ✓ | R | — | R+exp |
| Auditoría | ✓ | R+exp | — | — | R+exp |
| Configuración | ✓ | R | — | — | R |

La matriz real, celda por celda, vive en `src/lib/cimedi/permissions.js` y se edita desde
**Roles y permisos** sin tocar código.

## Sobre "Catálogos"

En el sistema de referencia este módulo estaba bloqueado tras un *"requiere permisos adicionales"*
sin explicación, sin indicar qué permiso faltaba ni cómo obtenerlo, y ni siquiera aparecía en el
menú lateral.

Aquí Catálogos es un módulo como cualquier otro:

- Aparece en el menú si tu rol tiene `catalogos.read`.
- Si no lo tiene, la pantalla dice literalmente qué permiso falta, sobre qué módulo, y que un
  administrador puede habilitarlo en Roles y permisos.
- El administrador lo concede marcando una casilla en la matriz. No hay ticket a soporte, ni
  escalamiento al proveedor, ni banderas ocultas en la base.

Ese cambio —de bloqueo opaco a permiso explícito y auto-servible— es el criterio que se aplicó a
todos los módulos.

## Personalización por usuario

`Membership.visible_modules` y `User.visible_modules` permiten **acotar** el menú de una persona.
Nunca lo amplían: el menú final es la intersección de lo que el rol permite con lo que el usuario
eligió ver. Inicio y Configuración jamás se ocultan — son la vía de regreso.

## Vía de escape del propietario

El usuario con rol `admin` de la app Base44 (el propietario de la instalación) pasa todas las
verificaciones de permisos. Es deliberado: evita que una empresa quede sin nadie capaz de
administrarla tras un cambio de roles desafortunado. En producción conviene sustituirlo por un rol
de servicio dedicado, con acceso auditado y caducidad.
