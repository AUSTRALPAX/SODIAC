import { Link } from "react-router-dom";

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

/** Trail simple "A > B > C" — el último item es la página actual, sin link. */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-sm text-text-secondary" aria-label="Ruta de navegación">
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1.5">
          {index > 0 && <span className="text-text-muted">›</span>}
          {item.to ? (
            <Link to={item.to} className="hover:text-accent">
              {item.label}
            </Link>
          ) : (
            <span className="text-text-primary">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
