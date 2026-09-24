# Fuente legacy: tgv_dev.tov452_66 vía API /tgcommdev/

Estado al 24/sep/2026. TOV452-66 sigue en legacy con el perfil `tov452_crudo` (el de siempre).
El perfil de valores finales está PREPARADO y probado, pero NO activado.

## Arquitectura (acordada con Manuel)

```
TG One (navegador) ──HTTPS──▶ medicionesReales (Base44, servidor)
                                   │ POST action:"get"
                                   ▼
                  API PHP /tgcommdev/dbcommapi0099.php (servidor de Manuel)
                                   │ hoy: credenciales enviadas por TG One
                                   │ objetivo: usuario LOCAL de MySQL, solo lectura
                                   ▼
                          MySQL tgv_dev.tov452_66
```
Esto es la conexión legacy actual. La futura API en la nube (TG ONE CLOUD, API-CONTRACT.md) es otra
cosa: aún no existe servidor ni API, y shadow/tg_api siguen bloqueados.

## Nombres: dispositivo, identificador y tabla
| Concepto | Valor | Dónde vive |
| --- | --- | --- |
| Código del dispositivo | TOV452-66 | Dispositivo.codigo |
| Identificador legacy en TG One | TOV452_66 | Dispositivo.tabla_bd_externa (clave del archivo LecturaHistorica) |
| Tabla real en MySQL | tov452_66 | Confirmada por Manuel; Dispositivo.telemetria_tabla_fisica al activar |
El respaldo proviene de MySQL 8.0.44 en Windows y un trigger usa nombres con mayúsculas distintas:
el servidor no distingue mayúsculas, por eso TOV452_66 funciona hoy. En Linux habría que usar tov452_66.
La tabla física se toma de la configuración del dispositivo en el servidor, nunca del navegador.

## Respaldo tgv_dev_backup_170926.sql
- UTF-16LE, 8.7 MB. Truncado: termina en la estructura temporal de `vreportealarmas`; faltan vistas,
  rutinas (incluido TOV452_END) y la línea final. Usado solo para inspección y pruebas aisladas;
  no se restauró en ninguna base. La muestra de prueba (9 filas reales, sin la columna `track`) está en
  scripts/fixtures/tov452_66-muestra-respaldo-170926.json.
- 7 524 filas de tov452_66 (Lectura 6 901 a 14 431; 6/jul a 17/sep/2026). DevEUI único del medidor.

## Mapeo verificado (perfil tov452_valores_finales)
Cada columna se comparó fila por fila con su fórmula; los valores se usan tal cual, sin factores.
| TG One | Columna final | Fórmula comprobada | Coincidencia |
| --- | --- | --- | --- |
| v1..v3 (V) | Fase1..3_volts | (TP1/TP2)·0.1·VFase | 100 % |
| i1..i3 (A) | Fase1..3_amps | (TC1/TC2)·0.001·IFase | 100 % |
| pf1..pf3 | PF1..3_e | PFn·0.001 (el formulario dice PF1 para las 3: errata) | 100 % |
| frequency (Hz) | Frequency_e | Frequency·0.01 | 100 % |
| potencias W/VA/var por fase y totales | Fase1..3_W/VA/VAr, Fase_W/VA/VAr | sumas por fase | 100 % |
| FP del sistema | PF_e | promedio de las 3 fases | 100 % |
| rssi (dBm) | rssi | directo de TTN | — |
Ceros reales, negativos y datos ausentes (null) se conservan tal cual.
Excluidas por estar SIEMPRE vacías: Frecuency, Armonico_e y una columna cuyo nombre contiene un
tabulador ("Fase_W<TAB>Potencia"). Armonico_e es el nombre de la fórmula genérica del formulario.
Hallazgo: entre el 6 y el 22 de julio TC fue 800/5; el perfil anterior mostró 160 veces menos corriente
(lectura 8231: 0.011 A en TG One frente a 1.76 A en la base).
Presentación de potencias: < 1000 unidad base; ≥ 1000 prefijo k; ≥ 1 000 000 prefijo M (formulario).
PF_e promedia las 3 fases aunque este equipo solo mide corriente en la fase 1 (PF2/PF3 valen 1.00).

## Pendiente de Manuel (no se muestra hasta confirmar)
1. Unidad de los armónicos THD_*_e (THD·0.01): ¿fracción (0.11 = 11 %) o porcentaje? El perfil
   anterior mostraba THD÷10 (1.1).
2. Escala y unidad de kWh (no tiene columna final).
3. Regla para reconocer una lectura completa (hay filas con valores finales vacíos, p. ej. 7072, 6901).
Zona horaria: se usa America/Mexico_City. Los datos reales lo respaldan (lectura 15058 guardada 14:49:50,
archivada 21:00:09 UTC = 10 min después). Solo falta que Manuel confirme ese identificador.

## Activar / revertir (panel Infraestructura TG One → «Lectura de la base legacy»)
1. Verificar lectura legacy: el servidor consulta en vivo la MISMA lectura (mismo equipo e identificador)
   con el perfil actual en TOV452_66 y con los valores finales en tov452_66; muestra el número de
   Lectura y la fecha para compararla con la fila de la base.
2. Usar valores finales: solo si la verificación pasó; el servidor la repite, pide confirmación, registra
   Auditoría y guarda telemetria_perfil_legacy=tov452_valores_finales y telemetria_tabla_fisica=tov452_66.
3. Volver al perfil anterior: siempre disponible; restaura perfil crudo y tabla registrada.
El archivo histórico (LecturaHistorica) sigue guardando las columnas crudas.

## Credenciales (sin reproducirlas aquí)
Las credenciales legacy están incrustadas en medicionesReales, guardarLecturaHistorica, archivarTelemetria
y pruebaCrud, y en el historial de git. Funcionan en producción (las lecturas llegan), así que son reales.
Traslado sin cortar lecturas, con la misma convención que archivarTelemetria:
1. Base44 → Settings → Secrets: TG_FUENTE_URL, TG_FUENTE_SERVIDOR, TG_FUENTE_BASE, TG_FUENTE_USUARIO,
   TG_FUENTE_PASSWORD y TG_FUENTE_TOKEN con los valores actuales (todos o ninguno).
2. Verificar en el panel que «Credenciales legacy» diga «Secretos del servidor».
3. Quitar los valores del código (siguiente cambio).
4. Manuel crea el usuario local de MySQL de solo lectura y rota contraseña y token; se actualizan secretos.
5. Solo si Manuel confirma que su PHP usa el usuario local, ignora credenciales del cuerpo, valida el
   token y tiene HTTPS: TG_FUENTE_CREDENCIALES_EN_SERVIDOR=si (sin HTTPS se niega a enviar el token).
   archivarTelemetria aún no tiene este modo: agregarlo antes de activarlo.
pruebaCrud (consola que escribe y borra en la tabla de prueba) ahora exige rol administrador en el servidor.
