/// <reference types="vite/client" />

/*
 * KaTeX side-effect imports.
 *
 * `katex/contrib/mhchem` is shipped as a plain ESM `.mjs` with no
 * accompanying `.d.ts`, so TypeScript's strict resolver can't type
 * it. We only import it for its side effect (it augments KaTeX's
 * macro table with `\ce{…}` / `\pu{…}`), so declaring the module as
 * an opaque object is enough.
 *
 * The CSS import is a Vite convention — bundling KaTeX's stylesheet
 * into the lazy chunk that loads it — that TypeScript also can't
 * resolve on its own without a shim.
 */
declare module "katex/contrib/mhchem" {
  const _default: unknown;
  export default _default;
}

declare module "katex/dist/katex.min.css" {
  const _default: unknown;
  export default _default;
}
