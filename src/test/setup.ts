/**
 * Pré-carga dos testes (`npm test`): componentes importam `*.module.css`, que o Node não entende.
 * Aqui o `.css` vira um objeto cujo acesso a qualquer classe devolve o próprio nome (`styles.box === "box"`),
 * nos dois caminhos de carga que o tsx usa (require e import).
 */
import Module, { register } from "node:module";

const STUB = 'export default new Proxy({}, { get: (_, k) => (typeof k === "string" ? k : undefined) });';

// Caminho CommonJS (arquivos .tsx sem "type": "module" entram por aqui).
// `__esModule` + `default` explícitos: a interop do TypeScript lê essas chaves, e um Proxy "cego" responderia strings a elas.
(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = { __esModule: true, default: new Proxy({}, { get: (_, k) => (typeof k === "string" ? k : undefined) }) };
};

// Caminho ESM.
register(
  `data:text/javascript,export async function load(url, ctx, next) {
    if (/\\.css$/.test(url)) return { format: "module", shortCircuit: true, source: ${JSON.stringify(STUB)} };
    return next(url, ctx);
  }`,
  import.meta.url,
);
