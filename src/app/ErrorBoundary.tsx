import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Boundary global de errores de UI (Fase 1, docs/ARCHITECTURE.md §7).
 * El log estructurado en disco lo maneja Rust; aquí solo evitamos una pantalla en blanco.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[SODIAC] Error de UI no controlado:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-8 text-center">
          <h1 className="font-display text-2xl text-text-primary">
            Algo salió mal en la interfaz
          </h1>
          <p className="max-w-md text-sm text-text-secondary">
            {this.state.error.message}
          </p>
          <button
            className="rounded border border-accent px-4 py-2 text-sm uppercase tracking-wide text-accent transition hover:bg-accent/10"
            onClick={() => this.setState({ error: null })}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
