// Diccionario de términos técnicos en español simple. Un icono "?" junto a
// cada etiqueta abre esta explicación (ver InfoTecnico.jsx) — el número real
// no se toca ni se oculta, solo se le agrega contexto para quien no es
// ingeniero. Los rangos citados aquí son los mismos que ya usa la app en
// otros lugares (ver src/lib/estadoSalud.js, VOLT_ZONES de TotalView.jsx y
// riesgoPredictivo.js), nunca un número nuevo o inventado.
export const GLOSARIO = {
  voltaje: {
    nombre: 'Voltaje',
    explicacion: 'La "presión" eléctrica que llega por cada fase. Si se sale de su rango normal por mucho tiempo, puede dañar equipos conectados.',
    rangoNormal: '114 – 127 V',
  },
  frecuencia: {
    nombre: 'Frecuencia',
    explicacion: 'Qué tan rápido oscila la corriente eléctrica. En México debe mantenerse muy cerca de 60 Hz — si se aleja, es señal de inestabilidad en la red.',
    rangoNormal: '59.5 – 60.5 Hz',
  },
  pf: {
    nombre: 'Factor de potencia (FP)',
    explicacion: 'Qué tan eficientemente se está usando la energía. Cerca de 1.00 es ideal; un valor bajo implica más pérdidas y mayor desgaste del sistema.',
    rangoNormal: '0.95 – 1.00',
  },
  thd: {
    nombre: 'THD (distorsión armónica)',
    explicacion: 'Qué tan "limpia" es la señal eléctrica. Equipos electrónicos y motores pueden ensuciarla; un valor alto y sostenido puede sobrecalentar cables y transformadores.',
    rangoNormal: 'Voltaje: hasta 3% ideal, revisar sobre 10% · Corriente: hasta 5% ideal, revisar sobre 20%',
  },
  corriente: {
    nombre: 'Corriente',
    explicacion: 'La cantidad de electricidad que realmente está fluyendo por cada fase. Depende de cuánto equipo esté encendido en ese momento — no tiene un "rango fijo" como el voltaje.',
    rangoNormal: 'Varía según la carga conectada',
  },
  rssi: {
    nombre: 'RSSI (señal)',
    explicacion: 'Qué tan fuerte es la señal inalámbrica del medidor hacia la red — igual que las barritas de señal de un celular. Entre más cercano a 0, mejor.',
    rangoNormal: 'Mejor que -65 dBm es una señal buena',
  },
  kwh: {
    nombre: 'kWh (energía acumulada)',
    explicacion: 'La energía eléctrica total que el medidor ha registrado con el paso del tiempo — es un contador que solo sube, como el odómetro de un coche.',
    rangoNormal: 'No aplica — es un acumulado, no una medición instantánea',
  },
};
