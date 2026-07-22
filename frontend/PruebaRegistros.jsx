import React, { useState, useEffect, useCallback } from 'react';
import { Database, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

const PAGE_SIZE = 10;

const CAMPOS_VACIOS = {
  Nombre: '', Descripcion: '', Status: '', nivel: '',
  boleano: false, numerico: '', fecha: '', doble: '',
};

function aFormulario(fila) {
  if (!fila) return { ...CAMPOS_VACIOS };
  return {
    Nombre: fila.Nombre ?? '',
    Descripcion: fila.Descripcion ?? '',
    Status: fila.Status ?? '',
    nivel: fila.nivel ?? '',
    boleano: fila.boleano === 1 || fila.boleano === true,
    numerico: fila.numerico ?? '',
    fecha: fila.fecha ?? '',
    doble: fila.doble ?? '',
  };
}

function aRegistro(form) {
  return {
    Nombre: form.Nombre.trim(),
    Descripcion: form.Descripcion.trim() || null,
    Status: form.Status.trim() || null,
    nivel: form.nivel.trim() || null,
    boleano: form.boleano ? 1 : 0,
    numerico: form.numerico === '' ? null : Number(form.numerico),
    fecha: form.fecha || null,
    doble: form.doble === '' ? null : Number(form.doble),
  };
}

export default function PruebaRegistros() {
  const [filas, setFilas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null); // null = alta, objeto = edición
  const [form, setForm] = useState(CAMPOS_VACIOS);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [borrando, setBorrando] = useState(null); // fila pendiente de confirmar borrado

  const { toast } = useToast();

  const cargar = useCallback(async (p = page) => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('pruebaCrud', { action: 'list', page: p, pageSize: PAGE_SIZE });
      const body = res?.data ?? res;
      if (body.error) throw new Error(body.error);
      setFilas(body.datos || []);
      setTotalPages(body.totalPages || 1);
      setTotal(body.total || 0);
      setPage(body.page || p);
    } catch (err) {
      setError(err.message || 'No se pudo consultar la tabla.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { cargar(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const validarLocal = (f) => {
    const e = {};
    if (!f.Nombre.trim()) e.Nombre = 'Obligatorio.';
    else if (f.Nombre.length > 30) e.Nombre = 'Máximo 30 caracteres.';
    if (f.Descripcion.length > 30) e.Descripcion = 'Máximo 30 caracteres.';
    if (f.Status.length > 10) e.Status = 'Máximo 10 caracteres.';
    if (f.nivel.length > 10) e.nivel = 'Máximo 10 caracteres.';
    if (f.numerico !== '' && !Number.isInteger(Number(f.numerico))) e.numerico = 'Debe ser un entero.';
    if (f.doble !== '' && (!Number.isInteger(Number(f.doble)) || Number(f.doble) < -128 || Number(f.doble) > 127)) e.doble = 'Entero entre -128 y 127 (columna tinyint).';
    if (f.fecha && Number.isNaN(new Date(f.fecha).getTime())) e.fecha = 'Fecha inválida.';
    return e;
  };

  const abrirAlta = () => {
    setEditando(null);
    setForm(CAMPOS_VACIOS);
    setFormErrors({});
    setModalOpen(true);
  };

  const abrirEdicion = (fila) => {
    setEditando(fila);
    setForm(aFormulario(fila));
    setFormErrors({});
    setModalOpen(true);
  };

  const guardar = async () => {
    const e = validarLocal(form);
    setFormErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const registro = aRegistro(form);
      const payload = editando ? { action: 'update', id: editando.id, registro } : { action: 'create', registro };
      const res = await base44.functions.invoke('pruebaCrud', payload);
      const body = res?.data ?? res;
      if (body.error) throw new Error(body.error);
      toast({ title: editando ? 'Registro actualizado' : 'Registro creado' });
      setModalOpen(false);
      cargar(editando ? page : 1);
    } catch (err) {
      toast({ title: 'Error', description: err.message || 'No se pudo guardar.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmarBorrado = async () => {
    if (!borrando) return;
    try {
      const res = await base44.functions.invoke('pruebaCrud', { action: 'delete', id: borrando.id });
      const body = res?.data ?? res;
      if (body.error) throw new Error(body.error);
      toast({ title: 'Registro eliminado' });
      setBorrando(null);
      const quedanEnPagina = filas.length - 1;
      cargar(quedanEnPagina === 0 && page > 1 ? page - 1 : page);
    } catch (err) {
      toast({ title: 'Error', description: err.message || 'No se pudo borrar.', variant: 'destructive' });
    }
  };

  const columnas = [
    { key: 'id', label: 'ID' },
    { key: 'Nombre', label: 'Nombre' },
    { key: 'Descripcion', label: 'Descripción' },
    { key: 'Status', label: 'Status' },
    { key: 'nivel', label: 'Nivel' },
    { key: 'boleano', label: 'Booleano', render: (v) => (v === 1 || v === true ? 'Sí' : 'No') },
    { key: 'numerico', label: 'Numérico' },
    { key: 'fecha', label: 'Fecha' },
    { key: 'doble', label: 'Doble (tinyint)' },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Database className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Registros de prueba</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tabla <span className="font-mono">prueba</span> en <span className="font-mono">tgv_dev</span> — CRUD real contra el servidor de Boris, validado por tipo de dato.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={abrirAlta}><Plus className="h-4 w-4 mr-1" />Nuevo registro</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 rounded" />)}
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 p-5 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <span className="text-sm">{error}</span>
          </div>
        ) : filas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin registros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {columnas.map((c) => (
                    <th key={c.key} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{c.label}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    {columnas.map((c) => (
                      <td key={c.key} className="px-3 py-2 font-mono whitespace-nowrap">
                        {c.render ? c.render(fila[c.key]) : (fila[c.key] ?? '—')}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirEdicion(fila)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setBorrando(fila)} title="Borrar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs">
            <span className="text-muted-foreground">{total} registro{total === 1 ? '' : 's'} · página {page} de {totalPages}</span>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-7 px-2" disabled={page <= 1} onClick={() => cargar(page - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" className="h-7 px-2" disabled={page >= totalPages} onClick={() => cargar(page + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Alta / Edición */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader><DialogTitle>{editando ? `Editar registro #${editando.id}` : 'Nuevo registro'}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Nombre * (máx. 30)</Label>
              <Input maxLength={30} value={form.Nombre} onChange={(e) => setForm((p) => ({ ...p, Nombre: e.target.value }))} className="bg-secondary border-border" />
              {formErrors.Nombre && <p className="text-xs text-destructive">{formErrors.Nombre}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Descripción (máx. 30)</Label>
              <Textarea maxLength={30} value={form.Descripcion} onChange={(e) => setForm((p) => ({ ...p, Descripcion: e.target.value }))} className="bg-secondary border-border" rows={2} />
              {formErrors.Descripcion && <p className="text-xs text-destructive">{formErrors.Descripcion}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Status (máx. 10)</Label>
                <Input maxLength={10} value={form.Status} onChange={(e) => setForm((p) => ({ ...p, Status: e.target.value }))} className="bg-secondary border-border" />
                {formErrors.Status && <p className="text-xs text-destructive">{formErrors.Status}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Nivel (máx. 10)</Label>
                <Input maxLength={10} value={form.nivel} onChange={(e) => setForm((p) => ({ ...p, nivel: e.target.value }))} className="bg-secondary border-border" />
                {formErrors.nivel && <p className="text-xs text-destructive">{formErrors.nivel}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Numérico (int)</Label>
                <Input type="number" step="1" value={form.numerico} onChange={(e) => setForm((p) => ({ ...p, numerico: e.target.value }))} className="bg-secondary border-border" />
                {formErrors.numerico && <p className="text-xs text-destructive">{formErrors.numerico}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Fecha</Label>
                <Input type="date" value={form.fecha} onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))} className="bg-secondary border-border" />
                {formErrors.fecha && <p className="text-xs text-destructive">{formErrors.fecha}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Doble (entero -128 a 127 — la columna real es tinyint, no decimal, a pesar del nombre)</Label>
              <Input type="number" step="1" min={-128} max={127} value={form.doble} onChange={(e) => setForm((p) => ({ ...p, doble: e.target.value }))} className="bg-secondary border-border" />
              {formErrors.doble && <p className="text-xs text-destructive">{formErrors.doble}</p>}
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
              <Label className="text-xs font-medium text-muted-foreground">Booleano</Label>
              <Switch checked={form.boleano} onCheckedChange={(v) => setForm((p) => ({ ...p, boleano: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar borrado */}
      <AlertDialog open={!!borrando} onOpenChange={(o) => !o && setBorrando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar registro #{borrando?.id}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esto borra el registro real de la tabla <span className="font-mono">prueba</span> en el servidor de Boris. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarBorrado} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Borrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
