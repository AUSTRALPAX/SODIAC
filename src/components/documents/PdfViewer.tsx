import { useCallback, useEffect, useRef, useState } from "react";
import { readFile } from "@tauri-apps/plugin-fs";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { getSetting, setSetting } from "@/services/settings";

GlobalWorkerOptions.workerSrc = workerSrc;

export interface PdfViewerProps {
  documentKey: string;
  filePath: string;
  rangeStart?: number | undefined;
  rangeEnd?: number | null | undefined;
  onOpenFullDocument?: (() => void) | undefined;
}

interface ViewerPrefs {
  page: number;
  zoom: number;
}

function prefsKey(documentKey: string): string {
  return `pdf_viewer_prefs:${documentKey}`;
}

export function PdfViewer({ documentKey, filePath, rangeStart, rangeEnd, onOpenFullDocument }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(rangeStart ?? 1);
  const [pageInput, setPageInput] = useState(String(rangeStart ?? 1));
  const [zoom, setZoom] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [restrictRange, setRestrictRange] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<number[] | null>(null);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);

  const effectiveMin = restrictRange && rangeStart ? rangeStart : 1;
  const effectiveMax = restrictRange && rangeEnd ? rangeEnd : pdf?.numPages ?? rangeEnd ?? undefined;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const bytes = await readFile(filePath);
        const doc = await getDocument({ data: bytes }).promise;
        const prefs = await getSetting<ViewerPrefs>(prefsKey(documentKey));
        if (cancelled) return;
        // Todas las actualizaciones de estado se agrupan al final, después del
        // último await: si `pdf` se confirma en un commit separado de
        // `loading=false` (por el hueco asíncrono de getSetting), el efecto
        // que dispara el render de la página se ejecuta antes de que el
        // <canvas> exista en el DOM (loading todavía true) y no se reintenta
        // después — el documento queda "cargado" pero con el canvas en blanco.
        const startPage = prefs?.page ?? rangeStart ?? 1;
        setPdf(doc);
        setPage(startPage);
        setPageInput(String(startPage));
        if (prefs?.zoom) setZoom(prefs.zoom);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, documentKey]);

  const renderPage = useCallback(async () => {
    if (!pdf || !canvasRef.current) return;
    // pdf.js no permite dos render() concurrentes sobre el mismo canvas — al
    // cambiar de página rápido (o si un render anterior todavía está en
    // curso) hay que cancelar el anterior antes de lanzar el nuevo.
    renderTaskRef.current?.cancel();
    try {
      const pdfPage = await pdf.getPage(page);
      const viewport = pdfPage.getViewport({ scale: zoom, rotation });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const task = pdfPage.render({ canvasContext: context, viewport });
      renderTaskRef.current = task;
      await task.promise;

      if (textLayerRef.current) {
        const textContent = await pdfPage.getTextContent();
        textLayerRef.current.innerHTML = "";
        textLayerRef.current.style.width = `${viewport.width}px`;
        textLayerRef.current.style.height = `${viewport.height}px`;
        for (const item of textContent.items) {
          if (!("str" in item) || !item.str) continue;
          const tx = pdfPage.getViewport({ scale: zoom, rotation }).convertToViewportPoint(item.transform[4], item.transform[5]);
          const span = document.createElement("span");
          span.textContent = item.str;
          span.style.position = "absolute";
          span.style.left = `${tx[0]}px`;
          span.style.top = `${tx[1] - item.height * zoom}px`;
          span.style.fontSize = `${item.height * zoom}px`;
          span.style.color = "transparent";
          span.style.whiteSpace = "pre";
          textLayerRef.current.appendChild(span);
        }
      }
      await setSetting(prefsKey(documentKey), { page, zoom });
    } catch (e) {
      // Un render cancelado a propósito (cambio rápido de página) no es un error real.
      if (e instanceof Error && e.name === "RenderingCancelledException") return;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [pdf, page, zoom, rotation, documentKey]);

  useEffect(() => {
    void renderPage();
  }, [renderPage]);

  function goToPage(target: number) {
    const min = effectiveMin;
    const max = effectiveMax ?? pdf?.numPages ?? target;
    const clamped = Math.min(Math.max(target, min), max);
    setPage(clamped);
    setPageInput(String(clamped));
  }

  async function handleFitWidth() {
    if (!pdf || !containerRef.current) return;
    const pdfPage = await pdf.getPage(page);
    const unscaled = pdfPage.getViewport({ scale: 1, rotation });
    const available = containerRef.current.clientWidth - 32;
    setZoom(available / unscaled.width);
  }

  async function handleSearch() {
    if (!pdf || !searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const matches: number[] = [];
      const min = effectiveMin;
      const max = effectiveMax ?? pdf.numPages;
      for (let p = min; p <= max; p++) {
        const pdfPage = await pdf.getPage(p);
        const content = await pdfPage.getTextContent();
        const text = content.items.map((i) => ("str" in i ? i.str : "")).join(" ").toLowerCase();
        if (text.includes(searchQuery.trim().toLowerCase())) matches.push(p);
      }
      setSearchResults(matches);
      if (matches.length > 0) goToPage(matches[0]!);
    } finally {
      setSearching(false);
    }
  }

  function toggleFullscreen() {
    if (!fullscreen) containerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
    setFullscreen((f) => !f);
  }

  if (error) {
    return (
      <div className="rounded border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
        <p>No se pudo abrir el documento: {error}</p>
        <p className="mt-1 text-xs text-text-muted">
          Verificá que el archivo siga existiendo en esa ubicación (podría haberse movido o renombrado).
        </p>
        <div className="mt-2 flex gap-2 text-xs">
          <button onClick={() => openPath(filePath)} className="rounded border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent">
            Intentar abrir externamente
          </button>
        </div>
      </div>
    );
  }

  if (loading) return <div className="p-6 text-sm text-text-muted">Cargando documento…</div>;

  return (
    <div ref={containerRef} className="rounded border border-border-subtle bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle pb-2 text-xs">
        <button onClick={() => goToPage(page - 1)} className="rounded border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent">
          ← Anterior
        </button>
        <input
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onBlur={() => goToPage(Number(pageInput) || page)}
          onKeyDown={(e) => e.key === "Enter" && goToPage(Number(pageInput) || page)}
          className="w-14 rounded border border-border bg-background px-2 py-1 text-center text-text-primary focus:border-accent focus:outline-none"
        />
        <span className="text-text-muted">/ {effectiveMax ?? pdf?.numPages ?? "…"}</span>
        <button onClick={() => goToPage(page + 1)} className="rounded border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent">
          Siguiente →
        </button>
        <span className="mx-1 h-4 w-px bg-border-subtle" />
        <button onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))} className="rounded border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent">
          Zoom −
        </button>
        <span className="text-text-muted">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(4, z + 0.15))} className="rounded border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent">
          Zoom +
        </button>
        <button onClick={handleFitWidth} className="rounded border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent">
          Ajustar al ancho
        </button>
        <button onClick={() => setRotation((r) => (r + 90) % 360)} className="rounded border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent">
          Rotar
        </button>
        <button onClick={toggleFullscreen} className="rounded border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent">
          {fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
        </button>
        <span className="mx-1 h-4 w-px bg-border-subtle" />
        <button onClick={() => openPath(filePath)} className="rounded border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent">
          Abrir externamente
        </button>
        <button onClick={() => revealItemInDir(filePath)} className="rounded border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent">
          Revelar archivo
        </button>
        {rangeStart && rangeEnd && (
          <label className="ml-auto flex items-center gap-1 text-text-secondary">
            <input type="checkbox" checked={restrictRange} onChange={(e) => setRestrictRange(e.target.checked)} />
            Limitar a páginas {rangeStart}–{rangeEnd}
          </label>
        )}
        {restrictRange && rangeStart && rangeEnd && onOpenFullDocument && (
          <button onClick={onOpenFullDocument} className="text-accent hover:underline">
            Abrir documento completo →
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle py-2 text-xs">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Buscar texto en el documento…"
          className="flex-1 rounded border border-border bg-background px-2 py-1 text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <button onClick={handleSearch} disabled={searching} className="rounded border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40">
          {searching ? "Buscando…" : "Buscar"}
        </button>
        {searchResults && (
          <span className="text-text-muted">
            {searchResults.length === 0 ? "Sin resultados" : `${searchResults.length} página(s) con coincidencias`}
          </span>
        )}
      </div>

      <div className="mt-3 flex justify-center overflow-auto">
        <div className="relative">
          <canvas ref={canvasRef} className="rounded shadow-sm" />
          <div ref={textLayerRef} className="pointer-events-auto absolute left-0 top-0 select-text overflow-hidden" />
        </div>
      </div>
    </div>
  );
}
