// Seat-setup re-renders replace .lobby-content-wrapper. html/body use
// overflow:clip, so that wrapper is the scroller. Recreating it jumps
// scrollTop to 0 (faction / color click). Capture before innerHTML.

export function captureLobbyScroll(root) {
  const scroller = root?.querySelector?.('.lobby-content-wrapper') || null;
  let pageTop = 0;
  if (typeof document !== 'undefined') {
    pageTop = document.scrollingElement?.scrollTop
      || document.documentElement?.scrollTop
      || document.body?.scrollTop
      || 0;
  }
  return {
    scrollTop: scroller?.scrollTop || 0,
    pageTop,
  };
}

export function restoreLobbyScroll(root, saved) {
  const top = Number(saved?.scrollTop) || 0;
  const pageTop = Number(saved?.pageTop) || 0;
  const scroller = root?.querySelector?.('.lobby-content-wrapper');
  if (scroller) scroller.scrollTop = top;
  if (typeof document !== 'undefined') {
    if (document.scrollingElement) document.scrollingElement.scrollTop = pageTop;
    if (document.documentElement) document.documentElement.scrollTop = pageTop;
    if (document.body) document.body.scrollTop = pageTop;
  }
  return top;
}
