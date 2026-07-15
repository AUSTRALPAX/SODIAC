/**
 * Símbolo geométrico provisional de SODIAC — sugiere nodos/órbita/sistema.
 * Original, deliberadamente distinto del logotipo de Muso.AI. Reemplazable
 * sin tocar el resto de la UI (ver docs/DESIGN_SYSTEM.md §4).
 */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="3" fill="var(--accent-bright)" />
      <circle cx="6" cy="10" r="2" fill="var(--accent)" />
      <circle cx="26" cy="10" r="2" fill="var(--accent)" />
      <circle cx="16" cy="27" r="2" fill="var(--accent)" />
      <path
        d="M16 16 L6 10 M16 16 L26 10 M16 16 L16 27"
        stroke="var(--accent-dark)"
        strokeWidth="1.5"
      />
    </svg>
  );
}
