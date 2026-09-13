// Prueba de humo del reporte: usa registros REALES de LecturaHistorica
// (TOV452_66) tal cual salieron de la base, los escala con los mismos
// divisores documentados y ejercita el analisis + la composicion del PDF.
//
// Se corre con `npm run test:reporte` dentro de la app (usa esbuild para
// resolver el alias @/ y luego node). Existe porque el reporte no se puede
// abrir en un navegador desde el entorno de trabajo: esta prueba es la unica
// forma de confirmar que el PDF realmente se construye, pagina solo y saca
// los numeros correctos a partir de datos reales del medidor.
//
// Ya atrapo un error real: la primera version de `hallazgos()` elegia un solo
// "peor valor" de voltaje comparando distancias absolutas a cada extremo de
// la banda, y con V1 entre 111.6 y 123.2 V eso descartaba la excursion baja
// (la unica que si estaba fuera de rango). Ahora los dos extremos se revisan
// por separado.
import { analizarPeriodo, hallazgos } from '@/lib/analisisElectrico';
import { evaluarLectura, RANGOS, clasificarValor } from '@/lib/estadoSalud';
import { crearLienzo, COLOR_ESTADO, ETIQUETA_ESTADO, TINTA_SUAVE } from '@/lib/reportePdf';
import { jsPDF } from 'jspdf';
import fs from 'fs';

const CRUDOS = [
  {fecha:"2026-09-02 18:23:47",VFase1:1116,VFase2:0,VFase3:0,IFase1:0,IFase2:0,IFase3:0,Frequency:5997,PF1:1000,PF2:1000,PF3:1000,THD_VST1:7,THD_VST2:0,THD_VST3:0,THD_IST1:0,THD_IST2:0,THD_IST3:0,rssi:-33,kWh:10},
  {fecha:"2026-08-07 08:57:23",VFase1:1225,VFase2:1159,VFase3:1181,IFase1:21,IFase2:0,IFase3:0,Frequency:5997,PF1:326,PF2:1000,PF3:1000,THD_VST1:2,THD_VST2:4,THD_VST3:5,THD_IST1:133,THD_IST2:0,THD_IST3:0,rssi:-34,kWh:10},
  {fecha:"2026-08-03 18:34:47",VFase1:1232,VFase2:1190,VFase3:1209,IFase1:760,IFase2:0,IFase3:0,Frequency:5995,PF1:1000,PF2:1000,PF3:1000,THD_VST1:4,THD_VST2:6,THD_VST3:7,THD_IST1:5,THD_IST2:0,THD_IST3:0,rssi:-33,kWh:9},
];

// Mismos divisores que escalarRegistro (no se importa el hook para no
// arrastrar React y el cliente SDK a la prueba).
const escalar = (r) => ({
  fecha: r.fecha, rssi: r.rssi, kWh: r.kWh,
  frequency: r.Frequency/100,
  v1: r.VFase1/10, v2: r.VFase2/10, v3: r.VFase3/10,
  i1: r.IFase1/1000, i2: r.IFase2/1000, i3: r.IFase3/1000,
  pf1: r.PF1/1000, pf2: r.PF2/1000, pf3: r.PF3/1000,
  thdV1: r.THD_VST1/10, thdV2: r.THD_VST2/10, thdV3: r.THD_VST3/10,
  thdI1: r.THD_IST1/10, thdI2: r.THD_IST2/10, thdI3: r.THD_IST3/10,
});

let fallos = 0;
const ok = (cond, msg) => { console.log((cond?'  OK  ':'  FALLA ') + msg); if(!cond) fallos++; };

const a = analizarPeriodo(CRUDOS.map(escalar));
console.log('\n--- analizarPeriodo ---');
ok(a.n === 3, `3 lecturas analizadas (${a.n})`);
ok(a.fases[0].conectada === true, 'Fase 1 detectada como conectada');
ok(a.fases[1].conectada === true, 'Fase 2 conectada (tiene 115.9 y 119.0 V, y un 0 aislado)');
ok(Math.abs(a.fases[0].voltaje.max - 123.2) < 0.01, `V1 max = 123.2 (${a.fases[0].voltaje.max})`);
ok(Math.abs(a.fases[0].voltaje.min - 111.6) < 0.01, `V1 min = 111.6 (${a.fases[0].voltaje.min})`);
ok(a.fases[1].voltaje.n === 2, `V2 promedia solo las 2 lecturas no-cero (${a.fases[1].voltaje.n})`);
ok(Math.abs(a.frecuencia.max - 59.97) < 0.001, `frecuencia max 59.97 (${a.frecuencia.max})`);
ok(a.energia.delta === 1, `kWh subio 1 en el periodo (${a.energia && a.energia.delta})`);
ok(Math.abs(a.fases[0].factorPotencia.min - 0.326) < 0.001, `PF1 min 0.326 (${a.fases[0].factorPotencia.min})`);

console.log('\n--- hallazgos (deben nacer de numeros medidos) ---');
const h = hallazgos(a);
h.forEach(x => console.log(`  [${x.estado}] ${x.titulo}\n        ${x.detalle}`));
ok(h.some(x => x.titulo.includes('Factor de potencia') && x.estado === 'alerta'), 'detecta PF 0.326 como alerta');
ok(h.some(x => x.titulo.includes('Voltaje') && x.titulo.includes('Fase 1')), 'detecta V1 111.6 fuera de banda');
ok(h.some(x => x.titulo.includes('THD corriente') || x.titulo.includes('armonica de corriente') || x.titulo.includes('armónica de corriente')), 'detecta THD-I 13.3%');

console.log('\n--- casos vacios (no debe inventar nada) ---');
ok(analizarPeriodo([]) === null, 'periodo sin lecturas devuelve null');
ok(hallazgos(null).length === 0, 'sin analisis no hay hallazgos');

console.log('\n--- composicion del PDF ---');
const doc = new jsPDF();
const L = crearLienzo(doc);
L.encabezadoPortada({ titulo: 'Prueba', lineas: ['linea 1', 'linea 2'] });
L.seccion('1. Seccion');
L.parrafo('Un parrafo largo '.repeat(40));
// muchas filas: fuerza el salto de pagina y la repeticion del encabezado
L.tabla({
  columnas: [{titulo:'Magnitud',ancho:60},{titulo:'Valor',ancho:40,alinear:'right'},{titulo:'Estado',ancho:82}],
  filas: Array.from({length: 90}, (_,i) => [`Fila ${i}`, {texto:String(i),negrita:true}, {texto:ETIQUETA_ESTADO.alerta,color:COLOR_ESTADO.alerta}]),
});
L.nota('Una nota de limitacion de muestreo '.repeat(8), COLOR_ESTADO.revisar);
L.pieDePagina({ documentoId: 'TG1-PRUEBA' });
const salida = doc.output('arraybuffer');
// Se deja el PDF en disco para poder abrirlo a mano si algo se ve raro.
// El directorio se crea aqui: no se asume que exista.
fs.mkdirSync('node_modules/.cache', { recursive: true });
fs.writeFileSync('node_modules/.cache/prueba-reporte.pdf', Buffer.from(salida));
const paginas = doc.internal.getNumberOfPages();
ok(paginas > 1, `el PDF pagino solo (${paginas} paginas)`);
ok(salida.byteLength > 3000, `PDF con contenido (${salida.byteLength} bytes)`);
ok(Buffer.from(salida).slice(0,5).toString() === '%PDF-', 'cabecera %PDF- valida');

console.log(fallos === 0 ? '\n=== TODO OK ===' : `\n=== ${fallos} FALLA(S) ===`);
process.exit(fallos ? 1 : 0);
