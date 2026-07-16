import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { appLogDir } from "@tauri-apps/api/path";
import { checkIntegrity, listBackups, restoreBackup, type IntegrityResult } from "@/services/backup";
import { enableSafeMode, isSafeModeEnabled } from "@/services/safeMode";
import { recordErrorSafely } from "@/services/errorLog";
import type { BackupRecordRow } from "@/database/types";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * Boundary global de errores de UI (Fase 1, docs/ARCHITECTURE.md §7).
 * Ampliado (corrección de persistencia/recuperación): además de evitar una
 * pantalla en blanco, muestra la ruta del log persistente, permite copiar
 * el diagnóstico, verificar la integridad de la base y restaurar un backup
 * sin salir de esta pantalla — reutilizando `services/backup/index.ts`
 * directamente, ya que si el router falló no hay garantía de poder navegar
 * a Configuración.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[SODIAC] Error de UI no controlado:", error, info.componentStack);
    this.setState({ info });
    void recordErrorSafely("react_error_boundary", error.message, error.stack);
  }

  render() {
    if (this.state.error) {
      return <RecoveryScreen error={this.state.error} onRetry={() => this.setState({ error: null, info: null })} />;
    }
    return this.props.children;
  }
}

function RecoveryScreen({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [logDir, setLogDir] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);
  const [backups, setBackups] = useState<BackupRecordRow[] | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [safeModeQueued, setSafeModeQueued] = useState(isSafeModeEnabled());

  useEffect(() => {
    void appLogDir().then(setLogDir).catch(() => setLogDir(null));
  }, []);

  async function handleCheckIntegrity() {
    setCheckingIntegrity(true);
    try {
      setIntegrity(await checkIntegrity());
    } catch (e) {
      setIntegrity({ ok: false, detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setCheckingIntegrity(false);
    }
  }

  async function handleShowBackups() {
    setBackups(await listBackups());
  }

  async function handleRestore(backupId: string) {
    setRestoring(backupId);
    try {
      const result = await restoreBackup(backupId);
      alert(result.message);
    } finally {
      setRestoring(null);
    }
  }

  async function handleCopyDiagnostics() {
    const text = [
      `Error: ${error.message}`,
      logDir ? `Directorio de logs: ${logDir}` : "",
      "",
      error.stack ?? "(sin stack trace)",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Portapapeles no disponible — no es crítico, el texto sigue visible en pantalla.
    }
  }

  function handleToggleSafeMode() {
    enableSafeMode(!safeModeQueued);
    setSafeModeQueued(!safeModeQueued);
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 overflow-y-auto bg-background p-8 text-center">
      <h1 className="font-display text-2xl text-text-primary">Algo salió mal en la interfaz</h1>
      <p className="max-w-md text-sm text-text-secondary">{error.message}</p>

      {logDir && <p className="max-w-md text-xs text-text-muted">Registro de diagnóstico: {logDir}</p>}

      <div className="flex flex-wrap justify-center gap-2">
        <button
          className="rounded border border-accent px-4 py-2 text-sm uppercase tracking-wide text-accent transition hover:bg-accent/10"
          onClick={onRetry}
        >
          Reintentar
        </button>
        <button
          className="rounded border border-border px-4 py-2 text-sm uppercase tracking-wide text-text-secondary transition hover:border-accent hover:text-accent"
          onClick={() => void handleCopyDiagnostics()}
        >
          {copied ? "Copiado" : "Copiar diagnóstico"}
        </button>
        <button
          className="rounded border border-border px-4 py-2 text-sm uppercase tracking-wide text-text-secondary transition hover:border-accent hover:text-accent"
          onClick={() => void handleCheckIntegrity()}
          disabled={checkingIntegrity}
        >
          {checkingIntegrity ? "Verificando…" : "Verificar base"}
        </button>
        <button
          className="rounded border border-border px-4 py-2 text-sm uppercase tracking-wide text-text-secondary transition hover:border-accent hover:text-accent"
          onClick={() => void handleShowBackups()}
        >
          Ver backups
        </button>
        <button
          className="rounded border border-border px-4 py-2 text-sm uppercase tracking-wide text-text-secondary transition hover:border-accent hover:text-accent"
          onClick={handleToggleSafeMode}
        >
          {safeModeQueued ? "Modo seguro: activado (próximo inicio)" : "Activar modo seguro en el próximo inicio"}
        </button>
      </div>

      {integrity && (
        <p className={`text-xs ${integrity.ok ? "text-success" : "text-danger"}`}>
          Integridad de la base: {integrity.ok ? "ok" : integrity.detail}
        </p>
      )}

      {backups && (
        <div className="max-h-40 w-full max-w-md overflow-y-auto rounded border border-border-subtle bg-surface p-2 text-left">
          {backups.length === 0 && <p className="p-2 text-xs text-text-muted">No hay backups registrados.</p>}
          {backups.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 border-b border-border-subtle p-2 text-xs last:border-0">
              <span className="text-text-secondary">
                {b.backup_type} · {new Date(b.created_at).toLocaleString("es-AR")}
              </span>
              <button
                className="rounded border border-accent px-2 py-0.5 text-accent disabled:opacity-40"
                onClick={() => void handleRestore(b.id)}
                disabled={restoring === b.id}
              >
                {restoring === b.id ? "Restaurando…" : "Restaurar"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
