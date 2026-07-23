import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Database, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, AlertTriangle,
  Search, X, ArrowUp, ArrowDown, ArrowUpDown, Copy, Download, RefreshCw, CheckSquare,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

const PAGE_SIZE = 10;
const EXPORT_PAGE_SIZE = 1000;

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

function csvEscape(val) {
  const s = val === null || val === undefined ? '' : String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function descargarCsv(filas, columnas) {
  const encabezado = columnas.map((c) => csvEscape(c.label)).join(',');
  const cuerpo = filas.map((f) => columnas.map((c) => csvEscape(c.render ? c.render(f[c.key]) : f[c.key])).join(',')).join('\n');
  const csv = `${encabezado}\n${cuerpo}`;
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prueba_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function PruebaRegistros() {
  const [filas, setFilas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalGeneral, setTotalGeneral] = useState(0);
  const [totalBoleanoTrue, setTotalBoleanoTrue] = useState(0);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortDir, setSortDir] = useState('desc');
  const searchTimer = useRef(null);

  const [seleccionados, setSeleccionados] = useState(() => new Set());
  const [bulkBorrando, setBulkBorrando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [toggleando, setToggleando] = useState(null); // id de la fila cuyo booleano se está cambiando inline

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null); // null = alta/duplicado, objeto = edición
  const [form, setForm] = useState(CAMPOS_VACIOS);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [borrando, setBorrando] = useState(null); // fila pendiente de confirmar borrado individual

  const { toast } = useToast();

  const cargar = useCallback(async ({ p, s, sBy, sDir } = {}) => {
    setLoading(true);
    setError(null);
    const pFinal = p ?? page;
    const sFinal = s ?? search;
    const sByFinal = sBy ?? sortBy;
    const sDirFinal = sDir ?? sortDir;
    try {
      const res = await base44.functions.invoke('pruebaCrud', {
        action: 'list', page: pFinal, pageSize: PAGE_SIZE, search: sFinal, sortBy: sByFinal, sortDir: sDirFinal,
      });
      const body = res?.data ?? res;
      if (body.error) throw new Error(body.error);
      setFilas(body.datos || []);
      setTotalPages(body.totalPages || 1);
      setTotal(body.total || 0);
      setTotalGeneral(body.totalGeneral ?? 0);
      setTotalBoleanoTrue(body.totalBoleanoTrue ?? 0);
      setPage(body.page || pFinal);
      setSeleccionados(new Set());
    } catch (err) {
      setError(err.message || 'No se pudo consultar la tabla.');
    } finally {
      setLoading(false);
    }
  }, [page, search, sortBy, sortDir]);

  useEffect(() => { cargar({ p: 1 }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Búsqueda con debounce: se escribe libre en searchInput, y hasta 350ms
  // después de dejar de teclear se dispara la consulta real al servidor.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(searchInput);
      cargar({ p: 1, s: searchInput });
    }, 350);
    return () => clearTimeout(searchTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const ordenarPor = (columna) => {
    const nuevaDir = sortBy === columna && sortDir === 'asc' ? 'desc' : 'asc';
    setSortBy(columna);
    setSortDir(nuevaDir);
    cargar({ p: 1, sBy: columna, sDir: nuevaDir });
  };

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

  const duplicar = (fila) => {
    setEditando(null); // es una alta nueva, no edición
    setForm({ ...aFormulario(fila), Nombre: `${fila.Nombre || ''} (copia)`.slice(0, 30) });
    setFormErrors({});
    setModalOpen(true);
    toast({ title: 'Registro duplicado', description: 'Revisa los datos y guarda para crear la copia.' });
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
      cargar({ p: editando ? page : 1 });
    } catch (err) {
      toast({ title: 'Error', description: err.message || 'No se pudo guardar.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleBoleano = async (fila) => {
    setToggleando(fila.id);
    const nuevoValor = !(fila.boleano === 1 || fila.boleano === true);
    // Mandamos el registro completo (no solo boleano) porque el backend
    // reemplaza los campos tal cual se lo pasamos — si mandáramos solo
    // {boleano}, el resto de las columnas se irían en null.
    const registro = aRegistro({ ...aFormulario(fila), boleano: nuevoValor });
    try {
      const res = await base44.functions.invoke('pruebaCrud', { action: 'update', id: fila.id, registro });
      const body = res?.data ?? res;
      if (body.error) throw new Error(body.error);
      setFilas((prev) => prev.map((f) => (f.id === fila.id ? { ...f, boleano: nuevoValor ? 1 : 0 } : f)));
      setTotalBoleanoTrue((prev) => prev + (nuevoValor ? 1 : -1));
    } catch (err) {
      toast({ title: 'Error', description: err.message || 'No se pudo cambiar el booleano.', variant: 'destructive' });
    } finally {
      setToggleando(null);
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
      cargar({ p: quedanEnPagina === 0 && page > 1 ? page - 1 : page });
    } catch (err) {
      toast({ title: 'Error', description: err.message || 'No se pudo borrar.', variant: 'destructive' });
    }
  };

  const confirmarBorradoMasivo = async () => {
    const ids = [...seleccionados];
    if (!ids.length) return;
    try {
      const res = await base44.functions.invoke('pruebaCrud', { action: 'bulkDelete', ids });
      const body = res?.data ?? res;
      if (body.error) throw new Error(body.error);
      toast({ title: `${body.borrados} registro${body.borrados === 1 ? '' : 's'} eliminado${body.borrados === 1 ? '' : 's'}`, description: body.fallidos ? `${body.fallidos} no se pudieron borrar.` : undefined });
      setBulkBorrando(false);
      const quedanEnPagina = filas.length - ids.length;
      cargar({ p: quedanEnPagina <= 0 && page > 1 ? page - 1 : page });
    } catch (err) {
      toast({ title: 'Error', description: err.message || 'No se pudo completar el borrado masivo.', variant: 'destructive' });
    }
  };

  const exportarCsv = async () => {
    setExportando(true);
    try {
      const res = await base44.functions.invoke('pruebaCrud', {
        action: 'list', page: 1, pageSize: EXPORT_PAGE_SIZE, search, sortBy, sortDir,
      });
      const body = res?.data ?? res;
      if (body.error) throw new Error(body.error);
      descargarCsv(body.datos || [], columnas);
      toast({ title: 'CSV descargado', description: `${(body.datos || []).length} registro(s) exportado(s).` });
    } catch (err) {
      toast({ title: 'Error', description: err.message || 'No se pudo exportar.', variant: 'destructive' });
    } finally {
      setExportando(false);
    }
  };

  const toggleSeleccion = (id) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSeleccionTodos = () => {
    setSeleccionados((prev) => {
      if (prev.size === filas.length) return new Set();
      return new Set(filas.map((f) => f.id));
    });
  };

  const columnas = useMemo(() => [
    { key: 'id', label: 'ID', ordenable: true },
    { key: 'Nombre', label: 'Nombre', ordenable: true },
    { key: 'Descripcion', label: 'Descripción', ordenable: true },
    { key: 'Status', label: 'Status', ordenable: true },
    { key: 'nivel', label: 'Nivel', ordenable: true },
    { key: 'boleano', label: 'Booleano', ordenable: true, render: (v) => (v === 1 || v === true ? 'Sí' : 'No') },
    { key: 'numerico', label: 'Numérico', ordenable: true },
    { key: 'fecha', label: 'Fecha', ordenable: true },
    { key: 'doble', label: 'Doble (tinyint)', ordenable: true },
  ], []);

  const IconoOrden = ({ columna }) => {
    if (sortBy !== columna) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const todosSeleccionados = filas.length > 0 && seleccionados.size === filas.length;

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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => cargar({ p: page })} disabled={loading} title="Refrescar">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={exportarCsv} disabled={exportando || total === 0}>
            <Download className="h-4 w-4 mr-1" />{exportando ? 'Exportando…' : 'Exportar CSV'}
          </Button>
          <Button size="sm" onClick={abrirAlta}><Plus className="h-4 w-4 mr-1" />Nuevo registro</Button>
        </div>
      </div>

      {/* Estadísticas reales */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total de registros</p>
          <p className="text-xl font-bold font-mono mt-0.5">{totalGeneral}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Con booleano activo</p>
          <p className="text-xl font-bold font-mono mt-0.5">{totalBoleanoTrue} <span className="text-xs font-normal text-muted-foreground">/ {totalGeneral}</span></p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Coinciden con el filtro</p>
          <p className="text-xl font-bold font-mono mt-0.5">{total}</p>
        </Card>
      </div>

      {/* Búsqueda + acciones masivas */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por Nombre, Descripción, Status o Nivel…"
            className="pl-8 pr-8 bg-secondary border-border h-9"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="Limpiar búsqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {seleccionados.size > 0 && (
          <Button variant="destructive" size="sm" onClick={() => setBulkBorrando(true)}>
            <Trash2 className="h-4 w-4 mr-1" />Borrar {seleccionados.size} seleccionado{seleccionados.size === 1 ? '' : 's'}
          </Button>
        )}
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
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
            <Database className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{search ? `Sin resultados para "${search}".` : 'Sin registros todavía.'}</p>
            {!search && <Button size="sm" variant="outline" onClick={abrirAlta}><Plus className="h-4 w-4 mr-1" />Crear el primero</Button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2 w-8">
                    <Checkbox checked={todosSeleccionados} onCheckedChange={toggleSeleccionTodos} aria-label="Seleccionar todos" />
                  </th>
                  {columnas.map((c) => (
                    <th key={c.key} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => ordenarPor(c.key)}
                      >
                        {c.label}
                        <IconoOrden columna={c.key} />
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.id} className={`border-b border-border last:border-0 hover:bg-muted/20 ${seleccionados.has(fila.id) ? 'bg-primary/5' : ''}`}>
                    <td className="px-3 py-2">
                      <Checkbox checked={seleccionados.has(fila.id)} onCheckedChange={() => toggleSeleccion(fila.id)} aria-label={`Seleccionar registro ${fila.id}`} />
                    </td>
                    {columnas.map((c) => (
                      <td key={c.key} className="px-3 py-2 font-mono whitespace-nowrap">
                        {c.key === 'boleano' ? (
                          <Switch
                            checked={fila.boleano === 1 || fila.boleano === true}
                            onCheckedChange={() => toggleBoleano(fila)}
                            disabled={toggleando === fila.id}
                          />
                        ) : (
                          c.render ? c.render(fila[c.key]) : (fila[c.key] ?? '—')
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicar(fila)} title="Duplicar">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
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
            <span className="text-muted-foreground flex items-center gap-1.5">
              {seleccionados.size > 0 && <CheckSquare className="h-3.5 w-3.5 text-primary" />}
              {total} registro{total === 1 ? '' : 's'}{search ? ' (filtrados)' : ''} · página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-7 px-2" disabled={page <= 1} onClick={() => cargar({ p: page - 1 })}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" className="h-7 px-2" disabled={page >= totalPages} onClick={() => cargar({ p: page + 1 })}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Alta / Edición / Duplicado */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader><DialogTitle>{editando ? `Editar registro #${editando.id}` : 'Nuevo registro'}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">Nombre * (máx. 30)</Label>
                <span className="text-[10px] text-muted-foreground font-mono">{form.Nombre.length}/30</span>
              </div>
              <Input maxLength={30} value={form.Nombre} onChange={(e) => setForm((p) => ({ ...p, Nombre: e.target.value }))} className="bg-secondary border-border" />
              {formErrors.Nombre && <p className="text-xs text-destructive">{formErrors.Nombre}</p>}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">Descripción (máx. 30)</Label>
                <span className="text-[10px] text-muted-foreground font-mono">{form.Descripcion.length}/30</span>
              </div>
              <Textarea maxLength={30} value={form.Descripcion} onChange={(e) => setForm((p) => ({ ...p, Descripcion: e.target.value }))} className="bg-secondary border-border" rows={2} />
              {formErrors.Descripcion && <p className="text-xs text-destructive">{formErrors.Descripcion}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">Status (máx. 10)</Label>
                  <span className="text-[10px] text-muted-foreground font-mono">{form.Status.length}/10</span>
                </div>
                <Input maxLength={10} value={form.Status} onChange={(e) => setForm((p) => ({ ...p, Status: e.target.value }))} className="bg-secondary border-border" />
                {formErrors.Status && <p className="text-xs text-destructive">{formErrors.Status}</p>}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">Nivel (máx. 10)</Label>
                  <span className="text-[10px] text-muted-foreground font-mono">{form.nivel.length}/10</span>
                </div>
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

      {/* Confirmar borrado individual */}
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

      {/* Confirmar borrado masivo */}
      <AlertDialog open={bulkBorrando} onOpenChange={setBulkBorrando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar {seleccionados.size} registro{seleccionados.size === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esto borra {seleccionados.size} registro{seleccionados.size === 1 ? '' : 's'} real{seleccionados.size === 1 ? '' : 'es'} de la tabla <span className="font-mono">prueba</span> en el servidor de Boris. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarBorradoMasivo} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Borrar todos</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
