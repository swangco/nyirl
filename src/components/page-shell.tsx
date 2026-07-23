import type { ReactNode } from "react";

// One source of truth for page width + gutters, so the masthead and every page
// share the same measure (the header used to be wider than its content).
const WIDTHS = {
  narrow: "max-w-xl",
  prose: "max-w-2xl",
  wide: "max-w-3xl",
} as const;

export function PageShell({
  children,
  width = "prose",
}: {
  children: ReactNode;
  width?: keyof typeof WIDTHS;
}) {
  return (
    <main className={`mx-auto w-full ${WIDTHS[width]} px-5 py-10 sm:px-6 sm:py-12`}>
      {children}
    </main>
  );
}
