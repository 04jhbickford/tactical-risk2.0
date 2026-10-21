const mockUrl = new URL('./firebase-reject-mock.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (typeof specifier === 'string' && specifier.includes('/firebasejs/')) {
    return { url: mockUrl, shortCircuit: true, format: 'module' };
  }
  return nextResolve(specifier, context);
}
