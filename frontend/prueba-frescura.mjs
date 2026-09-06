// Prueba de la calibracion de frescura con marcas de tiempo REALES del
// TOV452_66, leidas del servidor de telemetria el 6/sep/2026.
//
// Existe por un error concreto: la primera version de frescura.js usaba un
// umbral fijo de 3 min para dejar de llamar "reciente" a un dato. Al medir la
// cadencia real del medidor resulto ser de ~6.4 min (mediana de 382 s sobre
// 60 lecturas consecutivas), y 58 de 59 intervalos superaban esos 3 min: la
// app decia "rezagado" casi siempre aunque el equipo estuviera perfecto.
//
// Esta prueba fija ese comportamiento para que no vuelva: comprueba que la
// cadencia se mide bien, que un dato normal ya NO se marca como rezagado, y
// que uno de verdad viejo sigue marcandose como atrasado.
import { cadenciaDe, umbralesDe, evaluarFrescura, CADENCIA_POR_OMISION_MS } from '@/lib/frescura';

// Fechas reales, tal como las devuelve el medidor (hora local, sin zona).
// Incluye a proposito la lectura 12459, que trae la fecha desfasada 79 h
// respecto de sus vecinas — es un registro real, no un caso inventado.
const SERIE_REAL = [
  '2026-09-05 23:58:47', '2026-09-06 00:05:17',
  '2026-09-06 01:33:48', // lectura 12458
  '2026-09-02 18:30:10', // lectura 12459 — fecha desfasada, del propio medidor
  '2026-09-06 01:46:33', // 12460
  '2026-09-06 01:53:28', // 12461
  '2026-09-06 01:59:51', // 12462
  '2026-09-06 02:06:05', // 12463
  '2026-09-06 02:12:20', // 12464
  '2026-09-06 02:18:34', // 12465
].map((fecha) => ({ fecha }));

let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK  ' : '  FALLA ') + msg); if (!cond) fallos++; };

console.log('--- cadencia medida sobre lecturas reales ---');
const c = cadenciaDe(SERIE_REAL);
ok(c !== null, 'se puede medir la cadencia con la serie real');
ok(c > 300 * 1000 && c < 460 * 1000, `cadencia ~6.4 min (medido: ${(c / 1000).toFixed(0)} s)`);
// El registro con 79 h de desfase no debe arrastrar la medicion: si se
// promediara en vez de tomar la mediana con los saltos filtrados, la cadencia
// se dispararia a horas y todo pareceria "al dia" para siempre.
ok(c < 60 * 60 * 1000, 'el registro con fecha desfasada NO arrastra la cadencia');

console.log('\n--- casos sin material suficiente ---');
ok(cadenciaDe([]) === null, 'sin lecturas no se inventa una cadencia');
ok(cadenciaDe([{ fecha: '2026-09-06 02:12:20' }]) === null, 'con una sola lectura tampoco');
ok(cadenciaDe([{ fecha: 'no-es-fecha' }, { fecha: 'tampoco' }]) === null, 'fechas ilegibles no producen cadencia');

console.log('\n--- umbrales derivados ---');
const u = umbralesDe(c);
ok(u.reciente > 3 * 60 * 1000, `el umbral "al dia" supera los 3 min viejos (${(u.reciente / 60000).toFixed(1)} min)`);
ok(u.atrasado > u.reciente, 'atrasado siempre es mas laxo que al dia');
const uRapido = umbralesDe(5 * 1000);
ok(uRapido.reciente >= 5 * 60 * 1000, 'un equipo muy rapido no acaba con una ventana de segundos (hay piso)');
ok(umbralesDe(null).cadencia === CADENCIA_POR_OMISION_MS, 'sin cadencia se usa la de omision, declarada');

console.log('\n--- etiquetado: el bug que motivo el cambio ---');
const medidoEn = new Date('2026-09-06T02:12:20');
const alos = (min) => new Date(medidoEn.getTime() + min * 60000);
const lectura = { fecha: '2026-09-06 02:12:20' };

const a5 = evaluarFrescura({ reading: lectura, status: 'ok', historial: SERIE_REAL, ahora: alos(5) });
ok(a5.nivel === 'reciente', `a los 5 min sigue "al dia" (antes se marcaba rezagado) -> ${a5.nivel}`);
ok(a5.cadenciaMedida === true, 'declara que la cadencia se midio, no que se asumio');

const a20 = evaluarFrescura({ reading: lectura, status: 'ok', historial: SERIE_REAL, ahora: alos(20) });
ok(a20.nivel === 'rezagado', `a los 20 min ya se salto un ciclo -> ${a20.nivel}`);

const a120 = evaluarFrescura({ reading: lectura, status: 'ok', historial: SERIE_REAL, ahora: alos(120) });
ok(a120.nivel === 'atrasado', `a las 2 h si esta atrasado -> ${a120.nivel}`);

console.log('\n--- honestidad cuando no se pudo medir ---');
const sinHist = evaluarFrescura({ reading: lectura, status: 'ok', ahora: alos(5) });
ok(sinHist.cadenciaMedida === false, 'sin historial NO afirma haber medido la cadencia');
ok(/se asume/.test(sinHist.descripcion), 'y lo dice en pantalla en vez de presentarlo como dato');

console.log('\n--- no se inventan causas ni datos ---');
const sinDatos = evaluarFrescura({ reading: null, status: 'ok' });
ok(sinDatos.nivel === 'sin_datos', 'consulta correcta sin lectura -> sin_datos');
const conError = evaluarFrescura({ reading: lectura, status: 'error', mensaje: 'timeout' });
ok(conError.nivel === 'error_consulta', 'consulta fallida -> error_consulta');
ok(conError.medidoEn !== null, 'y la lectura previa NO se borra: se conserva con su hora original');
const sinHora = evaluarFrescura({ reading: { fecha: null }, status: 'ok' });
ok(sinHora.nivel === 'sin_hora', 'lectura sin fecha -> sin_hora, no se supone que es de ahora');

console.log(fallos === 0 ? '\n=== TODO OK ===' : `\n=== ${fallos} FALLA(S) ===`);
process.exit(fallos ? 1 : 0);
