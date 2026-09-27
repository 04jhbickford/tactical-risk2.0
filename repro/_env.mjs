import { pathToFileURL } from 'url'; import { dirname, join } from 'path'; import { fileURLToPath } from 'url'; import { readFileSync } from 'fs';
globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };
const mk = () => { const cs = new Set(); return { style: {}, children: [], dataset: {}, classList: { add(...n) { n.forEach((x) => cs.add(x)); }, remove(...n) { n.forEach((x) => cs.delete(x)); }, contains(n) { return cs.has(n); }, toggle() {} }, appendChild(c) { return c; }, querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {}, setAttribute() {}, removeAttribute() {} }; };
globalThis.document ??= { documentElement: mk(), body: mk(), createElement: mk, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {} };
globalThis.window ??= globalThis; globalThis.addEventListener ??= () => {};
export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const imp = (p) => import(pathToFileURL(join(root, p)));
export const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));
