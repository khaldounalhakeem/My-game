// Procedural cartoon avatars (no external images).
export function avatarSvg(a = {}, size = 64) {
  const bg = a.bg || '#5d9948';
  if (a.robot) {
    return `<svg class="avatar-svg" width="${size}" height="${size}" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="${bg}"/>
      <rect x="16" y="18" width="32" height="28" rx="6" fill="#cfd8dc" stroke="#455a64" stroke-width="2"/>
      <line x1="32" y1="18" x2="32" y2="10" stroke="#455a64" stroke-width="2"/><circle cx="32" cy="9" r="3" fill="${a.accent || '#f44336'}"/>
      <circle cx="25" cy="30" r="4.5" fill="${a.accent || '#29b6f6'}"/><circle cx="39" cy="30" r="4.5" fill="${a.accent || '#29b6f6'}"/>
      <rect x="23" y="38" width="18" height="3.5" rx="1.5" fill="#455a64"/><rect x="10" y="26" width="6" height="10" rx="2" fill="#90a4ae"/><rect x="48" y="26" width="6" height="10" rx="2" fill="#90a4ae"/></svg>`;
  }
  if (a.engine) {
    return `<svg class="avatar-svg" width="${size}" height="${size}" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#1d1d1d"/>
      <path d="M22 50h20l-2-6H24zM25 44h14l-2-10c3-2 4-5 3-8-1-4-5-6-9-6-2 0-4 1-5 2l-4 4 3 2 2-1c-1 2-1 4 1 6z" fill="#e8e8e8"/>
      <circle cx="32" cy="32" r="27" fill="none" stroke="#7fa650" stroke-width="2" stroke-dasharray="4 3"/></svg>`;
  }
  const skin = a.skin || '#f1c27d';
  const hair = a.hair || '#4a2f1b';
  const style = a.hairStyle || 'short';
  const shirt = a.shirt || '#3f51b5';
  let hairBack = '', hairFront = '';
  if (style === 'long') { hairBack = `<path d="M14 30c0-14 8-21 18-21s18 7 18 21v20H14z" fill="${hair}"/>`; hairFront = `<path d="M16 28c2-10 8-15 16-15s14 5 16 15c-6-4-12-6-16-10-4 4-10 6-16 10z" fill="${hair}"/>`; }
  else if (style === 'bun') { hairBack = `<circle cx="32" cy="9" r="7" fill="${hair}"/>`; hairFront = `<path d="M16 28c1-10 7-15 16-15s15 5 16 15c-4-3-10-6-16-6s-12 3-16 6z" fill="${hair}"/>`; }
  else if (style === 'curly') { hairFront = [16, 22, 28, 34, 40, 46].map((x, i) => `<circle cx="${x + 1}" cy="${17 + (i % 2) * 2}" r="6" fill="${hair}"/>`).join('') + `<circle cx="15" cy="25" r="5" fill="${hair}"/><circle cx="49" cy="25" r="5" fill="${hair}"/>`; }
  else if (style === 'spiky') { hairFront = `<path d="M15 27l2-12 5 6 3-10 5 8 4-10 4 9 5-7 2 9 4-3-1 10c-6-4-11-5-17-5s-11 1-16 5z" fill="${hair}"/>`; }
  else if (style === 'bald') { hairFront = `<path d="M15 30c0-3 1-5 2-6v8zM49 30c0-3-1-5-2-6v8z" fill="${hair}"/>`; }
  else if (style === 'mohawk') { hairFront = `<path d="M28 20l2-14 2 4 2-4 2 14z" fill="${hair}"/>`; }
  else { hairFront = `<path d="M16 28c0-10 7-16 16-16s16 6 16 16c-3-4-8-7-16-7s-13 3-16 7z" fill="${hair}"/>`; }
  const eyes = a.mood === 'cool' ? `<rect x="20" y="28" width="24" height="6" rx="3" fill="#111"/>`
    : `<circle cx="26" cy="31" r="2.3" fill="#222"/><circle cx="38" cy="31" r="2.3" fill="#222"/><circle cx="26.8" cy="30.2" r=".7" fill="#fff"/><circle cx="38.8" cy="30.2" r=".7" fill="#fff"/>`;
  const brows = a.mood === 'angry' ? `<path d="M22 26l7 2M42 26l-7 2" stroke="#222" stroke-width="1.8" stroke-linecap="round"/>` : `<path d="M23 26.5q3-1.5 6 0M35 26.5q3-1.5 6 0" stroke="${hair}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  const mouth = a.mood === 'angry' ? `<path d="M27 42q5-3 10 0" stroke="#7a2a2a" stroke-width="2" fill="none" stroke-linecap="round"/>`
    : a.mood === 'smirk' ? `<path d="M27 40q6 3 10-1" stroke="#7a2a2a" stroke-width="2" fill="none" stroke-linecap="round"/>`
    : `<path d="M26 39q6 5 12 0" stroke="#7a2a2a" stroke-width="2" fill="#fff" stroke-linecap="round"/>`;
  const glasses = a.glasses ? `<g stroke="${a.glasses}" stroke-width="1.6" fill="rgba(255,255,255,.15)"><circle cx="26" cy="31" r="5"/><circle cx="38" cy="31" r="5"/><path d="M31 31h2"/></g>` : '';
  const beard = a.beard ? `<path d="M19 34c1 10 6 15 13 15s12-5 13-15c-3 4-7 5-13 5s-10-1-13-5z" fill="${a.beard}"/>` : '';
  const hat = a.hat === 'crown' ? `<path d="M18 16l4-9 5 6 5-8 5 8 5-6 4 9z" fill="#ffd54f" stroke="#c49000"/>`
    : a.hat === 'cap' ? `<path d="M15 23c0-9 7-14 17-14s17 5 17 14z" fill="${a.hatColor || '#e53935'}"/><path d="M40 21h14v3H40z" fill="${a.hatColor || '#e53935'}"/>`
    : a.hat === 'beanie' ? `<path d="M15 25c0-11 7-16 17-16s17 5 17 16z" fill="${a.hatColor || '#8e24aa'}"/><circle cx="32" cy="8" r="4" fill="#fff"/>`
    : a.hat === 'wizard' ? `<path d="M16 22L34 0l14 22z" fill="${a.hatColor || '#3949ab'}"/><circle cx="30" cy="12" r="1.5" fill="#ffd54f"/><circle cx="37" cy="16" r="1.2" fill="#ffd54f"/>` : '';
  const blush = a.blush ? `<circle cx="21" cy="37" r="2.5" fill="#ff8a80" opacity=".6"/><circle cx="43" cy="37" r="2.5" fill="#ff8a80" opacity=".6"/>` : '';
  return `<svg class="avatar-svg" width="${size}" height="${size}" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="${bg}"/>
    ${hairBack}<path d="M14 64c0-10 8-14 18-14s18 4 18 14z" fill="${shirt}"/><rect x="28" y="44" width="8" height="8" fill="${skin}"/>
    <ellipse cx="32" cy="31" rx="16" ry="18" fill="${skin}"/><ellipse cx="16" cy="32" rx="2.5" ry="4" fill="${skin}"/><ellipse cx="48" cy="32" rx="2.5" ry="4" fill="${skin}"/>
    ${beard}${hairFront}${brows}${eyes}${glasses}${blush}<path d="M31 33q1 4-1 5" stroke="rgba(0,0,0,.25)" stroke-width="1.4" fill="none"/>${mouth}${hat}</svg>`;
}
