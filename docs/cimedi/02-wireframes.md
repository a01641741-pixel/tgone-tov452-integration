# CIMEDI — Wireframes por módulo

Estructura común de la consola (`/app`). Todo módulo hereda este armazón:

```
┌────────────┬──────────────────────────────────────────────────────────┐
│ CIMEDI     │ [empresa ▾] [app]              🔔3   ☀   [usuario ▾]     │  ← topbar
│ Total Gr…  ├──────────────────────────────────────────────────────────┤
│            │                                                          │
│ OPERACIÓN  │  Título del módulo                    [Exportar][Nuevo]  │
│ • Inicio   │  Descripción de una línea                                │
│ • Monitoreo│  ──────────────────────────────────────────────────────  │
│ • Alertas  │                                                          │
│            │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐   ← tarjetas KPI        │
│ INFRA      │  └─────┘ └─────┘ └─────┘ └─────┘                         │
│ • Locacio… │                                                          │
│ • Áreas    │  [buscar…]                            [filtros]          │
│ • Activos  │  ┌──────────────────────────────────────────────────┐   │
│ • Disposi… │  │ tabla / calendario / mapa / matriz               │   │
│            │  └──────────────────────────────────────────────────┘   │
│ MANTENIM.  │  N registros                              ‹ 1/4 ›        │
│ • Calenda… │                                                          │
│ • Reportes │                                                          │
│ SERVICIO   │                                                          │
│ ADMINIST.  │                                                          │
│ ──────────  │                                                          │
│ Rol activo │                                                          │
│ [Sitio púb]│                                                          │
└────────────┴──────────────────────────────────────────────────────────┘
```

El menú lateral **se construye desde los permisos**: un módulo sin `read` no aparece. En móvil el
sidebar pasa a drawer y la topbar conserva empresa, alertas y usuario.

---

## Inicio

```
Centro de operación · Total Ground                          [● Operativo]

┌ Activos ──┐ ┌ Dispositivos ┐ ┌ Alertas ────┐ ┌ Mantenim. ──┐
│    24     │ │     31       │ │      3      │ │      2      │
│ 19 operat.│ │ 2 sin señal  │ │ 1 crítica   │ │  vencidos   │
└───────────┘ └──────────────┘ └─────────────┘ └─────────────┘

┌─ Mapa operativo ──────────────────────┐  ┌─ Distribución ────┐
│                                       │  │ Operativos ████ 19│
│    ●verde   ●ámbar                    │  │ Alerta     ██   3 │
│         ●rojo         ●gris           │  │ Críticos   █    1 │
│                                       │  │ Sin datos  █    1 │
│  (color = peor activo de la locación) │  └───────────────────┘
└───────────────────────────────────────┘  ┌─ Favoritos ───────┐
                                           │ [Monitoreo][Alert]│
┌─ Alertas recientes ───┐ ┌─ Próximos mantenimientos ─────────┐
│ ⚠ Nivel sobre máximo  │ │ Limpieza pluviómetro    27/08     │
│ ⚠ Sensor sin señal    │ │ Calibración medidor     16/08     │
└───────────────────────┘ └───────────────────────────────────┘

┌─ Dispositivos sin señal ──────────────────────────────────┐
│ 📵 ZAP-PS1-DI1-LLU-01   hace 2 días                       │
└───────────────────────────────────────────────────────────┘
```

## Locaciones

```
Locaciones                              [Exportar][Importar][Nuevo]

[buscar…]
┌───────────────┬─────────┬───────────┬─────────┬───────┬────────┬──────┐
│ Locación      │ Región  │ Municipio │ Colonia │ Áreas │ Salud  │ ⚙    │
├───────────────┼─────────┼───────────┼─────────┼───────┼────────┼──────┤
│ Zona incendios│ Centro  │ Zapopan   │ El Coll…│   0   │ ● s/d  │ ✎ 🗑 │
│ Vesubio 1     │ ⚠s/capt │ ⚠s/captur │ ⚠s/capt │   1   │ ● ok   │ ✎ 🗑 │
│ Vesubio 3     │ ⚠s/capt │ ⚠s/captur │ ⚠s/capt │   0   │ ● s/d  │ ✎ 🗑 │
└───────────────┴─────────┴───────────┴─────────┴───────┴────────┴──────┘

┌─ Cobertura territorial (mapa) ────────────────────────────────────────┐
└───────────────────────────────────────────────────────────────────────┘
```

Los campos que el sistema de origen dejó vacíos se marcan **`sin capturar`** en ámbar en lugar de
rellenarse con un valor inventado: el hueco es información.

**Formulario** (diálogo, agrupado en secciones): Identificación · Jerarquía geográfica (selects en
cascada) · Georreferencia (lat/lng con aviso de que sin ellas no aparece en el mapa) · Contacto.

## Áreas / Activos / Dispositivos

Mismo patrón de tabla + diálogo seccionado. Diferencias notables:

**Activos** — KPI de semáforo arriba; columna *Salud* con tooltip que explica **por qué**
(«2 dispositivo(s) sin señal · 1 mantenimiento vencido»); columna *Disp.* en ámbar cuando es 0
(un activo sin dispositivos no puede tener semáforo).

**Dispositivos** — ficha técnica (EUI, MAC), calibración (`valor = (crudo + ajuste) × multiplicador`),
intervalo de muestreo, y **editor de canales**:

```
Canales (sub-variables)
┌────────┬──────────┬────────┬─────┬─────┬────────┬──────┐
│ clave  │ etiqueta │ unidad │ mín │ máx │ escala │ 1º ✕ │
├────────┼──────────┼────────┼─────┼─────┼────────┼──────┤
│ volumen│ Volumen  │ m³     │  8  │ 38  │  40    │ [1º] │
│ porcen…│ Porcenta…│ %      │ 20  │ 95  │ 100    │  ✕   │
└────────┴──────────┴────────┴─────┴─────┴────────┴──────┘
                                            [+ Agregar canal]
```

## Monitoreo

```
Monitoreo                                            [Exportar CSV]

[Dispositivo ▾ ZAP-PS1-DM1-NIV-01] [Sub-variable ▾ Volumen] [Rango ▾ 7 días]

●en línea   EUI 0004A30B0104E265   última señal hace 2 min   cada 2 min

┌─ Lectura actual ─┐  ┌─ Tendencia ─────────────────────────────────┐
│      ╭───╮       │  │ 32 ┤          ╭─╮                           │
│    31.20 m³      │  │    │  ╭─╮ ╭───╯ ╰─╮      ····· recta trend  │
│   ╰───────╯      │  │ 31 ┤──╯ ╰─╯       ╰────                     │
│ mín  prom  máx   │  │    └──────────────────────────────────      │
│31.10 31.5 32.00  │  │     ─ ─ ─ máx 38    ─ ─ ─ mín 8             │
│ 360 lecturas     │  └─────────────────────────────────────────────┘
└──────────────────┘

┌─ Diagnóstico predictivo ──────────────────────────────────────────┐
│ ⚠ Deriva sostenida a la baja                                      │
│   Cambia -0.096 m³ por día (R²=0.71). A este ritmo alcanza el      │
│   umbral en ~241 día(s).                                          │
│ ✓ Sin valores atípicos ni saltos bruscos                          │
└───────────────────────────────────────────────────────────────────┘

┌─ Histórico ───────────────────────────────────────────────────────┐
│ Fecha y hora      │ Valor (m³) │ Crudo │ Calidad │ Origen          │
└───────────────────────────────────────────────────────────────────┘
```

## Calendario

Tres vistas conmutables: **mes** (rejilla 7×N, hasta 3 eventos por día, vencidos en rojo),
**semana** (misma rejilla, 7 columnas) y **Gantt**:

```
[mes][semana][GANTT]            [Todos los activos ▾]

                    │ ago 26 │ sep 26 │ oct 26 │ nov 26 │
Limpieza pluvióme…  │    ▓▓▓▓│▓◆      │        │        │
cada 3 mes          │        │   hoy  │        │        │
Calibración medi…   │  ▓▓▓▓▓▓│◆       │        │        │
cada 6 mes          │        │        │        │        │
Mantenimiento ZAP…  │████◆   │        │        │        │  ← rojo: vencido
                    │        ⋮hoy     │        │        │
   ▓ Programado   █ Vencido   ▓ Completado
```

Al marcar **Realizado**: se sella `last_maintenance` = hoy y se agenda la siguiente fecha según la
frecuencia, en una sola acción.

## Alertas

```
Alertas                              [Evaluar ahora][Nueva regla]

┌Abiertas┐┌Críticas┐┌Reconoc.┐┌Reglas activas┐
│   3    ││   1    ││   1    ││      4       │
└────────┘└────────┘└────────┘└──────────────┘

[BANDEJA (4)] [Reglas (4)] [Historial]

┌────────────────────────┬─────────┬──────────┬────────┬─────────┬──────────┐
│ Alerta                 │ Activo  │ Severidad│ Disparo│ Canales │ Estado   │
├────────────────────────┼─────────┼──────────┼────────┼─────────┼──────────┤
│ Nivel sobre el máximo  │ ZAP-PS1 │ CRÍTICA  │ hace 2h│ Correo  │ activa   │
│  ↳ regla: Nivel cárcamo│ …DM1-NIV│          │        │         │ [Recon.] │
│                        │         │          │        │         │[Resolver]│
└────────────────────────┴─────────┴──────────┴────────┴─────────┴──────────┘
```

## Roles y permisos

```
┌ Roles ─────────┐  ┌ Matriz de permisos · Supervisor      [Guardar] ┐
│ ▸ Administrador│  │ Módulo          │ Ver │Crear│Editar│Elim.│Exp. │
│   17/17 · 8 usr│  ├─────────────────┼─────┼─────┼──────┼─────┼─────┤
│ ▪ SUPERVISOR   │  │ OPERACIÓN                                      │
│   17/17 · 3 usr│  │  Inicio         │ [✓] │ [✓] │ [✓]  │ [ ] │ [✓] │
│ ▸ Técnico campo│  │  Monitoreo      │ [✓] │ [✓] │ [✓]  │ [ ] │ [✓] │
│ ▸ Consulta     │  │  Alertas        │ [✓] │ [✓] │ [✓]  │ [✓] │ [✓] │
│ ▸ Auditor      │  │ INFRAESTRUCTURA                                │
└────────────────┘  │  Locaciones     │ [✓] │ [✓] │ [✓]  │ [ ] │ [✓] │
                    │  …                                             │
                    │ El aislamiento entre empresas no depende de    │
                    │ esta matriz: lo impone el RLS del backend.     │
                    └────────────────────────────────────────────────┘
```

Clic en el nombre del módulo = alterna la fila completa; clic en el encabezado = alterna la columna
en todos los módulos. Reglas de consistencia: quitar *Ver* apaga el resto; encender cualquier acción
enciende *Ver*.

## Mesa de ayuda

Lista con folio, SLA (chip rojo si venció) y estado. Al abrir un ticket, panel lateral derecho:

```
                          ┌ CIM-2026-0001 ─────────────────────┐
                          │ Pluviómetro sin reportar     [✕]   │
                          │ [ALTA][en proceso][Sin comunicac.] │
                          ├────────────────────────────────────┤
                          │ Solicitante  │ Responsable         │
                          │ Activo       │ Creado              │
                          │ Límite SLA   │ Primera respuesta   │
                          ├─ Historial (3) ────────────────────┤
                          │ ┌ Mesa de ayuda      hace 2 h ───┐ │
                          │ │ Ticket turnado a cuadrilla.    │ │
                          │ └────────────────────────────────┘ │
                          │ ┌ 🔒 interna         hace 1 h ───┐ │
                          │ │ Revisar batería antes de ir.   │ │
                          │ └────────────────────────────────┘ │
                          ├────────────────────────────────────┤
                          │[asignado][en proceso][resuelto]…   │
                          │ [respuesta…                ] 🔒 ➤  │
                          └────────────────────────────────────┘
```

## Configuración

Pestañas: **Mi perfil** · **Empresa y marca** (white-label: color de acento, logo, tema, idioma,
interruptor de página pública con su URL) · **Módulos visibles** (rejilla de tarjetas; Inicio y
Configuración quedan fijos) · **Datos** (exportación CSV por entidad, cada una auditada).

## Página de estado pública (`/estado/:slug`)

```
CIMEDI · Total Ground — Estado operativo

┌Operativos┐┌En alerta┐┌Críticos┐┌Sin datos┐
│    19    ││    3    ││   1    ││    1    │
└──────────┘└─────────┘└────────┘└─────────┘

Estado por locación
  Zona incendios    Zapopan · 0 activos          ● Sin datos
  Vesubio 1         sin municipio · 2 activos    ● Operativo

🛡 Vista de solo lectura. No expone telemetría cruda ni datos de usuarios.
```
