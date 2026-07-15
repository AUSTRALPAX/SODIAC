# SODIAC — Sistema de Diseño (Fase 0)

Inspiración exclusivamente en el *lenguaje visual* de la referencia Muso.AI (fondo oscuro,
tipografía blanca, acento turquesa, navegación sobria, composición editorial). No se copia marca,
logotipo, fotografía, textos ni estructura exacta.

## 1. Tokens de color (obligatorios, `src/styles/tokens.css`)

```css
:root {
  --background: #090B0D;
  --background-deep: #050607;
  --surface: #111418;
  --surface-elevated: #171B20;
  --surface-hover: #1C2228;
  --border: #293037;
  --border-subtle: #1D2328;
  --text-primary: #F4F7F8;
  --text-secondary: #A5AEB5;
  --text-muted: #6F7980;
  --accent: #00D6C5;
  --accent-bright: #16F1DD;
  --accent-dark: #087F78;
  --atmosphere-purple: #25192B;
  --atmosphere-blue: #0B285E;
  --success: #43D69A;
  --warning: #E6B85C;
  --danger: #FF6B72;
}
```
Mapeados 1:1 a tokens de Tailwind (`tailwind.config.ts` → `theme.extend.colors`).

## 2. Tipografía

- Títulos y números destacados: **Space Grotesk**.
- Interfaz y lectura: **Inter**.
- Ambas empaquetadas localmente vía npm (`@fontsource/space-grotesk`, `@fontsource/inter`) —
  sin CDN, la app debe funcionar sin conexión.

## 3. Forma

- Radios: 6–10px.
- Bordes: 1px, color `--border` / `--border-subtle`.
- Sombras discretas, sin glassmorphism.
- Brillo turquesa (`--accent-bright`) reservado a foco y acciones relevantes (botón INICIAR
  ESTUDIO, estados activos).
- Sin fondos blancos, sin gradientes saturados, sin colores aleatorios por materia.

## 4. Marca

- Wordmark "SODIAC" en mayúsculas, tracking amplio.
- Símbolo geométrico original (sugiere nodos/órbita/sistema), separado del wordmark, ubicado en
  `src/components/brand/Mark.tsx` como SVG editable — reemplazable sin tocar el resto de la UI.
- Explícitamente distinto del logotipo de Muso.AI.

## 5. Cabecera del dashboard "Hoy"

Área atmosférica oscura con gradiente `--atmosphere-blue` → `--atmosphere-purple`, líneas/nodos
abstractos generados en SVG (no fotografía), título grande, punto de continuidad, botón principal
**INICIAR ESTUDIO**.

## 6. Interacción y accesibilidad

- Transiciones 120–180ms.
- Foco siempre visible (`:focus-visible`, anillo `--accent`).
- Respeta `prefers-reduced-motion`.
- Skeletons sobrios para carga; estados vacíos con mensaje + acción sugerida (nunca pantalla en
  blanco).
- Confirmaciones explícitas para toda acción destructiva, mostrando consecuencias.
- Navegación completa por teclado, paleta de comandos `Ctrl+K` (`cmdk` sobre Radix Dialog).
- Contraste AA mínimo; ningún estado se comunica solo por color (se acompaña de ícono/texto).
- Rango de ventana soportado: 1280×720 a 4K, con escala de interfaz configurable.

## 7. Navegación persistente

Hoy · Mapa · Sesiones · Planificación · Repasos · Proyectos · Biblioteca · Estadísticas ·
Documentos · Obsidian · Configuración — sidebar fija, sobria, mayúsculas espaciadas para las
etiquetas de sección.
