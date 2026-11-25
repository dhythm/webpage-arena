const dishes = {
  drink: [
    ['soda', '星のクリームソーダ', '青い柑橘ソーダに、バニラの月。', 850],
    ['coffee', '夜更けのブレンド', 'ほろ苦い余韻が続く、深煎り珈琲。', 600]
  ],
  sweet: [
    ['pudding', '満月のカスタードプリン', '固めのプリンに、ほろ苦いカラメル。', 650],
    ['cake', '夜半のチーズケーキ', 'ゆっくり焼いたチーズと、レモンの香り。', 700]
  ],
  meal: [
    ['toast', '厚切りバタートースト', 'こんがり焼いた山食に、有塩バターをひとかけ。', 550],
    ['sandwich', '星待ちのたまごサンド', 'ふわりと焼いた厚いたまごを、薄切り食パンで。', 780]
  ]
};
const illustrations = {
  soda: '<path d="M22 29h36q-3 27-16 31v6l9 3H29l9-3v-6Q24 54 22 29Z" fill="#72a5b7"/><ellipse cx="40" cy="29" rx="18" ry="4" fill="#95bdc7"/><path d="M26 29q-1-16 14-17 13 0 14 17-12 7-28 0Z" fill="#f5ebc8"/><circle cx="42" cy="11" r="4" fill="#c56c55"/><path d="M43 9q0-5 5-8M26 34q2 12 8 18m-4-17 3 9"/>',
  coffee: '<ellipse cx="38" cy="59" rx="28" ry="6" fill="#efe5c9"/><path d="M56 35q18-5 12 9-3 6-15 7" fill="none" stroke-width="3"/><path d="M14 31q1 32 27 28 16-1 18-28Z" fill="#ede8d7"/><ellipse cx="36.5" cy="31" rx="22.5" ry="7" fill="#c6ac8d"/><ellipse cx="36" cy="32" rx="18.5" ry="4.3" fill="#675045"/><path d="M21 40q3 10 10 13M31 20c-7-5 3-8-1-13m10 12c-4-4 4-7 2-11" fill="none"/>',
  pudding: '<ellipse cx="40" cy="58" rx="32" ry="7" fill="#faf4db"/><path d="m19 53 7-28h27l8 28q-18 11-42 0Z" fill="#d8b26b"/><ellipse cx="40" cy="26" rx="14" ry="4" fill="#916943"/><path d="m29 32-4 17m10-15-2 16m19-18 3 13"/>',
  cake: '<ellipse cx="40" cy="55" rx="32" ry="9" fill="#f8f2da"/><path d="m13 43 39-23 15 9-2 22-51 3Z" fill="#e3c79d"/><path d="m13 43 54-14m-49 20 44-11"/>',
  toast: '<ellipse cx="40" cy="52" rx="32" ry="13" fill="#f6eed6"/><path d="M14 46 37 23q11-10 22-2 10 2 7 11L46 58 17 52Z" fill="#c38f5e"/><path d="m18 45 23-23q6-5 13 0 8-1 9 8L44 53Z" fill="#e6cd98"/><path d="m33 36 10-8 10 4-10 9Z" fill="#f6df94"/>',
  sandwich: '<ellipse cx="40" cy="56" rx="32" ry="8" fill="#faf2db"/><path d="m12 43 32-24 22 17-3 14-48 5Z" fill="#f5ecd1"/><path d="m14 46 49-7-1 7-47 6Z" fill="#d9b161"/><path d="m12 43 54-7"/>'
};
const menuItems = document.querySelector('#items');
const choices = document.querySelectorAll('.choices button');
function showMenu(kind) {
  menuItems.innerHTML = dishes[kind].map(([icon, name, note, price]) => `<article><span class="tile ${icon}" aria-hidden="true"><svg viewBox="0 0 80 80" fill="none" stroke="#4a5555" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round">${illustrations[icon]}</svg></span><div><h3>${name}</h3><p>${note}</p><strong>¥${price}</strong></div></article>`).join('');
  choices.forEach(choice => choice.setAttribute('aria-pressed', String(choice.dataset.kind === kind)));
}
choices.forEach(choice => choice.addEventListener('click', () => showMenu(choice.dataset.kind)));
showMenu('drink');
