import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { NAV_ITEMS } from "./navigation";
import { searchGlobal, type GlobalSearchResult } from "@/services/globalSearch";

const SEARCH_DEBOUNCE_MS = 250;
const EMPTY_RESULTS: GlobalSearchResult = { subjects: [], topics: [] };

/**
 * Paleta global Ctrl+K (docs/PRODUCT_SPEC.md — navegación). Sin texto
 * escrito muestra el atajo de navegación de siempre (NAV_ITEMS); al
 * escribir 2+ caracteres busca materias y temas reales (Fase 4).
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult>(EMPTY_RESULTS);
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(EMPTY_RESULTS);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(EMPTY_RESULTS);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchGlobal(query).then((r) => {
        if (!cancelled) setResults(r);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  if (!open) return null;

  const isSearching = query.trim().length >= 2;

  function goToSubject(subjectId: string) {
    navigate(`/carrera/${subjectId}`);
    setOpen(false);
  }

  function goToTopic(topicTitle: string) {
    navigate(`/mapa?buscar=${encodeURIComponent(topicTitle)}`);
    setOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-32"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <Command
        className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        shouldFilter={!isSearching}
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
      >
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Buscar sección, materia o tema…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-muted"
        />
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-text-muted">
            Sin resultados.
          </Command.Empty>
          {!isSearching &&
            NAV_ITEMS.map((item) => (
              <Command.Item
                key={item.path}
                onSelect={() => {
                  navigate(item.path);
                  setOpen(false);
                }}
                className="cursor-pointer rounded px-3 py-2 text-sm text-text-secondary data-[selected=true]:bg-surface-hover data-[selected=true]:text-text-primary"
              >
                {item.label}
              </Command.Item>
            ))}
          {isSearching && results.subjects.length > 0 && (
            <Command.Group
              heading="Materias"
              className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted [&_[cmdk-group-items]]:mt-1"
            >
              {results.subjects.map((subject) => (
                <Command.Item
                  key={subject.id}
                  value={`subject-${subject.id}`}
                  onSelect={() => goToSubject(subject.id)}
                  className="cursor-pointer rounded px-3 py-2 text-sm text-text-secondary data-[selected=true]:bg-surface-hover data-[selected=true]:text-text-primary"
                >
                  {subject.title}
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {isSearching && results.topics.length > 0 && (
            <Command.Group
              heading="Temas"
              className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted [&_[cmdk-group-items]]:mt-1"
            >
              {results.topics.map((topic) => (
                <Command.Item
                  key={topic.id}
                  value={`topic-${topic.id}`}
                  onSelect={() => goToTopic(topic.title)}
                  className="cursor-pointer rounded px-3 py-2 text-sm text-text-secondary data-[selected=true]:bg-surface-hover data-[selected=true]:text-text-primary"
                >
                  {topic.title}
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}
