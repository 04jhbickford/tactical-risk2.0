// Promise timeout — boot / resume / tile loads must fail soft, not hang.

export function withTimeout(promise, ms, label = 'operation') {
  const wait = Math.max(0, Number(ms) || 0);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${wait}ms`);
      err.timedOut = true;
      reject(err);
    }, wait);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export function isTimeoutError(err) {
  return !!(err && (err.timedOut === true || /timed out/i.test(String(err.message || err))));
}
