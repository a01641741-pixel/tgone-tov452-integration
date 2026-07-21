# Integración de telemetría TOV452 — TG One

Documentación técnica de la integración entre **TG One** (plataforma de Total Ground, construida en Base44) y el sistema de telemetría real del medidor **Total View TOV452**, que vive en un servidor MySQL propio del equipo y se expone vía un endpoint PHP.

Este repo existe para que el contrato de la API quede escrito en un solo lugar — antes estaba repartido entre un pizarrón, capturas de Postman y una conversación de chat.

## Estado actual

🔴 **No conectado todavía.** El código del lado de TG One (Base44) ya está construido y listo (ver `/backend` y `/frontend`), pero está **deshabilitado a propósito** hasta que el equipo de Boris confirme el contrato final con un ejemplo real probado en Postman.

## Arquitectura

```
[Medidor TOV452] → MySQL (tgv_dev, puerto 3306, tabla TOV452_66)
                          ↓
            PHP WS (dbcommapi0099.php, puerto 3030)
                          ↓
         Función tovLive en Base44 (proxy server-side)
                          ↓
              Hook useTovLive() en React (TG One)
```

Servidor: `monitor02.redirectme.net:3030`
Endpoint: `/tgcomm/dbcommapi0099.php`

## Historia del contrato (por qué se ve así)

### V1 — GET con body (descontinuado)
El diseño original exigía **método GET con un body JSON crudo**:
```json
{
  "servidor": "localhost",
  "base_de_datos": "tgv_dev",
  "usuario": "root",
  "password": "root",
  "tabla": "TOV452_66",
  "displayfields": ["lectura", "TOV452_ID"],
  "condiciones": { "lectura": 6937 }
}
```
Esto funciona perfecto por `curl` o Postman, pero **la especificación web de `fetch()` prohíbe mandar body en una petición GET** — se confirmó tanto en Node como en el runtime real de Deno de Base44. Ningún cliente moderno (navegador, Deno, la mayoría de librerías HTTP) puede replicar ese request. Por eso se descartó.

Además, el mismo endpoint decidía la operación según el verbo HTTP:
- `GET` → lectura (select)
- `POST` / `PUT` → inserción
- `DELETE` → borrado

Esto es un riesgo de seguridad real: **cualquier cliente que adivine el verbo puede insertar o borrar datos**, sin que el endpoint validara ningún token en ese momento. (Nota histórica: durante las pruebas de este contrato se borró por accidente un registro de prueba en `tgv_dev.TOV452_66` al confirmar este comportamiento — dato real, aunque de una lectura vieja de prueba.)

### V2 — POST + campo "Accion" (contrato actual, no confirmado al 100%)
Boris propuso unificar todo bajo `POST`, con un campo explícito `Accion` que determina la operación en vez de depender del verbo HTTP:

```json
{
  "Accion": "get",
  "token": "...",
  "base_de_datos": "tgv_dev",
  "tabla": "TOV452_66",
  "displayfields": ["Lectura", "fecha"],
  "condiciones": { "Lectura": 6937 }
}
```

Valores válidos de `Accion`: `get` (leer) · `put` / `post` (insertar) · `delete` (borrar).

Además se agrega un **token de sesión**:
- Se genera cifrando `usuario + password + hora`.
- Se guarda en una tabla de sesiones del lado del servidor.
- La expiración se recorre hacia adelante con cada transacción (idle timeout) — no es un tiempo fijo, sino que se renueva mientras haya actividad.
- El token viaja dentro del JSON del body (no en un header).

### Lo que falta confirmar (`TODO_CONFIRMAR` en el código)
1. **Cómo se obtiene el primer token.** ¿Se manda `usuario`/`password` una vez y el mismo response de lectura ya trae el token? ¿Hay una `Accion` especial tipo `"login"`? ¿El servidor lo regresa aunque no se pida explícitamente?
2. **Qué regresa el servidor cuando el token ya expiró** (mensaje, código de error) — para que el cliente sepa cuándo debe volver a autenticar.

**Antes de poner `DISABLED = false` en `tovLive.entry.ts`, alguien del equipo debe probar en Postman un ciclo completo (login → token → lectura con token → token vencido) y pegar el ejemplo real aquí en este README, en la sección de abajo.**

## Ejemplo real validado (pendiente — llenar cuando se confirme)

```
(pegar aquí el request/response real de Postman una vez que Boris lo confirme)
```

## Estructura de este repo

- `backend/tovLive.entry.ts` — función server-side (Deno, corre dentro de Base44) que hace de proxy seguro hacia el endpoint PHP. Las credenciales viven solo aquí, nunca se exponen al navegador.
- `backend/TovSesion.entity.jsonc` — esquema de la entidad usada para cachear el token de sesión entre invocaciones de la función (las funciones de Base44 son stateless, así que el token se persiste en esta tabla).
- `frontend/useTovLive.js` — hook de React que consume la función `tovLive`, hace polling de nuevas lecturas, y escala los campos crudos del TOV452 a unidades reales (voltaje, corriente, factor de potencia, THD).

## Campos de la tabla `TOV452_66` (confirmados por inspección real)

| Campo | Significado | Escala aplicada (⚠️ sin confirmar bajo carga real) |
|---|---|---|
| `Lectura` | Consecutivo de la medición | — |
| `fecha` | Timestamp de la lectura | — |
| `VFase1/2/3` | Voltaje por fase | ÷10 |
| `IFase1/2/3` | Corriente por fase | ÷10 |
| `PF1/2/3` | Factor de potencia por fase | ÷1000 |
| `Frequency` | Frecuencia | ÷100 |
| `THD_V` / `THD_I` | Distorsión armónica | ÷10 |
| `kWh` | Energía acumulada | sin escala |
| `rssi` | Señal del dispositivo | sin escala (dBm) |
| `TOV452_ID` | Identificador físico del medidor | — |

⚠️ Estas escalas se dedujeron con el dispositivo en reposo (sin carga, corrientes en 0). Hay que confirmarlas con una lectura bajo carga real antes de mostrarlas en una demo a inversionistas o clientes.

## Cómo activar la integración (checklist)

1. [ ] Boris confirma el mecanismo exacto de login/token (ver TODO_CONFIRMAR arriba)
2. [ ] Se prueba un ciclo completo en Postman y se documenta aquí
3. [ ] Se sube el código de `backend/tovLive.entry.ts` a la función `tovLive` en Base44
4. [ ] Se sube el esquema `backend/TovSesion.entity.jsonc` como entidad en Base44
5. [ ] Se cambia `DISABLED = true` → `DISABLED = false` en `tovLive.entry.ts`
6. [ ] En TG One, en la ficha del dispositivo correspondiente, se llena el campo "Tabla en BD externa" con el nombre de la tabla (ej. `TOV452_66`)
7. [ ] Se verifica en Consulta en tiempo real que el panel de Monitoreo Eléctrico muestre "EN VIVO" con datos reales

## Nota de seguridad

El endpoint actual no valida ningún token real (se confirmó durante las pruebas — cualquier request con el verbo correcto pasaba sin credenciales verificadas). El nuevo diseño con token de sesión resuelve esto, pero **debe probarse que el token realmente se exige y se valida** antes de considerar esta integración lista para producción.
