// Code-built garrison mark. No new art file.
// Frame and sight use the AA fire chrome already in style.css
// (.aa-title #ffb74d, .aa-fire-section rgba(255, 152, 0)).
// Sandbags use the existing neutral chip grey (#9aa0a6) and white.

const GARRISON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="Garrison">
  <rect x="1.25" y="1.25" width="21.5" height="21.5" rx="3" fill="#111111" stroke="#ffb74d" stroke-width="1.5"/>
  <path d="M12 4.1 V6.2 M10.3 5.15 H13.7" stroke="#ffb74d" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M7.2 16.2 L9.4 9.2 H14.6 L16.8 16.2 Z" fill="#9aa0a6" stroke="#ffffff" stroke-width="0.8"/>
  <rect x="10.7" y="11.1" width="2.6" height="1.7" fill="#111111"/>
  <ellipse cx="8" cy="16.7" rx="3.2" ry="1.7" fill="#ffffff" stroke="#ffb74d" stroke-width="0.7"/>
  <ellipse cx="12" cy="16.3" rx="3.2" ry="1.7" fill="#ffffff" stroke="#ffb74d" stroke-width="0.7"/>
  <ellipse cx="16" cy="16.7" rx="3.2" ry="1.7" fill="#ffffff" stroke="#ffb74d" stroke-width="0.7"/>
</svg>`;

export function garrisonIconSvg() {
  return GARRISON_SVG;
}

export function garrisonIconDataUri() {
  return `data:image/svg+xml,${encodeURIComponent(GARRISON_SVG)}`;
}
