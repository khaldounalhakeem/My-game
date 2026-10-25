import { COACHES, say } from '../coaches.js';
import { LESSONS } from '../lessons.js';
import { store } from '../storage.js';
import { go, applySettings } from '../app.js';
import { avatar, esc, toast } from '../ui.js';

export function render(main) {
  const paint = () => {
    const mine = store.settings.coachId;
    main.innerHTML = `<div class="page" style="max-width:1100px"><h1>🧑‍🏫 Coaches</h1>
      <p class="muted">Choose your coach. Your coach narrates your Game Reviews, gives live feedback in Coach mode, warns you about threats and teaches lessons. Each one has a different personality.</p>
      <div class="coach-cards">${COACHES.map(c => {
        const lessons = LESSONS.filter(l => l.coach === c.id);
        return `<div class="coach-card ${c.id === mine ? 'mine' : ''}">
          <div class="top">${avatar(c.avatar, 76)}<div><h3>${esc(c.name)} <span style="font-size:16px">${c.flag}</span></h3><div class="t">${esc(c.title)}</div><div class="muted" style="font-size:12px">${esc(c.level)}</div></div></div>
          <p>${esc(c.bio)}</p>
          <div class="quote">“${esc(say(c, 'tip'))}”</div>
          <div class="quote" style="color:var(--muted)">On a blunder: “${esc(say(c, 'blunder', { move: 'Qxb7' }))}”</div>
          <div class="row" style="flex-wrap:wrap;margin-top:auto">
            ${c.id === mine ? '<span class="btn small" style="background:var(--green);cursor:default">✓ Your coach</span>' : `<button class="btn small" data-pick="${c.id}">Choose</button>`}
            <button class="btn small" data-play="${c.id}">▶ Play with ${esc(c.name.split(' ')[1])}</button>
            ${lessons.map(l => `<button class="btn small" data-lesson="${l.id}">${l.icon} ${esc(l.title)}</button>`).join('')}
          </div></div>`;
      }).join('')}</div></div>`;
    main.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { store.setSetting('coachId', b.dataset.pick); applySettings(); toast('Coach updated'); paint(); });
    main.querySelectorAll('[data-play]').forEach(b => b.onclick = () => { store.setSetting('coachId', b.dataset.play); go('bots', { coach: true }); });
    main.querySelectorAll('[data-lesson]').forEach(b => b.onclick = () => go('lesson/' + b.dataset.lesson));
  };
  paint();
}
