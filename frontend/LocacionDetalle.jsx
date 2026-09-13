import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, LayoutGrid, Building2 } from 'lucide-react';
import { fetchOne, fetchMany } from '@/lib/guest';
import { Skeleton } from '@/components/ui/skeleton';
import StatusBadge from '@/components/StatusBadge';
import DetailSection from '@/components/DetailSection';

export default function LocacionDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [locacion, setLocacion] = useState(null);
  const [institucion, setInstitucion] = useState(null);
  const [areas, setAreas] = useState([]);
  const [activos, setActivos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const l = await fetchOne('Locacion', id);
        setLocacion(l);
        if (l?.institucion_id) { try { setInstitucion(await fetchOne('Institucion', l.institucion_id)); } catch {} }
        const lists = await fetchMany(['Area', 'ActivoIndustrial']);
        const areasDeLocacion = (lists.Area || []).filter(a => a.locacion_id === id);
        setAreas(areasDeLocacion);
        const areaIds = new Set(areasDeLocacion.map(a => a.id));
        setActivos((lists.ActivoIndustrial || []).filter(act => areaIds.has(act.area_id)));
      } catch {}
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 rounded-lg" /></div>;
  if (!locacion) return <p className="text-sm text-muted-foreground">Locación no encontrada</p>;

  const activosPorArea = (areaId) => activos.filter(act => act.area_id === areaId).length;

  return (
    <div className="space-y-5 max-w-4xl animate-fade-in">
      <button onClick={() => navigate('/locaciones')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Volver a Locaciones
      </button>

      <div className="rounded-lg border border-border bg-card p-5 card-hover">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold">{locacion.nombre}</h1>
          </div>
          <StatusBadge status={locacion.estado} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div><p className="text-xs text-muted-foreground">Dirección</p><p className="font-medium">{locacion.direccion || '—'}</p></div>
          <div><p className="text-xs text-muted-foreground">Institución</p><p className="font-medium">{institucion?.nombre || '—'}</p></div>
          <div><p className="text-xs text-muted-foreground">Áreas</p><p className="font-medium">{areas.length}</p></div>
        </div>
      </div>

      <DetailSection title="Áreas de la Locación" icon={LayoutGrid} count={areas.length}>
        {areas.length === 0 ? <p className="text-sm text-muted-foreground py-3 text-center">Sin áreas registradas</p> : (
          <div className="space-y-2">{areas.map(a => (
            <div key={a.id} onClick={() => navigate(`/areas/${a.id}`)} className="flex items-center justify-between rounded border border-border p-2.5 cursor-pointer hover:bg-secondary/30 transition-colors">
              <div className="min-w-0"><p className="text-sm font-medium truncate">{a.nombre}</p><p className="text-xs text-muted-foreground">{a.tipo} · {activosPorArea(a.id)} activo(s)</p></div>
              <StatusBadge status={a.tipo} />
            </div>
          ))}</div>
        )}
      </DetailSection>

      {institucion && (
        <DetailSection title="Institución" icon={Building2} defaultOpen={false}>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs text-muted-foreground">Nombre</p><p className="font-medium">{institucion.nombre || '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Estado</p><StatusBadge status={institucion.estado} /></div>
          </div>
        </DetailSection>
      )}
    </div>
  );
}
