const phases = ['書類選考', '一次面接', '最終面接'];
const actions = ['応募書類を確認', '面接日程を調整', '最終面接の評価を共有'];
const people = [
  ['佐藤 葵', 'プロダクトデザイナー', 'ポートフォリオ受領済み。担当した画面と設計意図を確認したい。', 0, 'lilac'],
  ['田中 悠', 'フロントエンドエンジニア', '応募書類が揃いました。チーム開発の経験を確認してください。', 0, 'blue'],
  ['高橋 澪', 'カスタマーサクセス', '書類確認済み。午後の時間帯で面接を希望しています。', 1, 'peach'],
  ['伊藤 陸', 'プロダクトデザイナー', '一次面接の記録あり。次回は過去のプロジェクトについて話す予定です。', 2, 'sage']
];
const lanes = document.querySelector('#lanes');
const dialog = document.querySelector('#detail');
const advance = document.querySelector('#advance');
let stages = people.map(person => person[3]);
let selected = 0;
function render() {
  lanes.innerHTML = phases.map((phase, stage) => {
    const members = people.map((person, index) => stages[index] === stage ? `<button class="file" data-person="${index}"><span class="person"><span class="avatar ${person[4]}">${person[0][0]}</span><span><strong>${person[0]}</strong><small>${person[1]}</small></span><span class="chev" aria-hidden="true">›</span></span><span class="task">${actions[stage]}</span></button>` : '').filter(Boolean);
    return `<section class="lane lane${stage}" aria-label="${phase}"><h3><i></i>${phase}<span>${members.length}</span></h3>${members.join('') || '<p class="empty">候補者はいません</p>'}</section>`;
  }).join('');
}
lanes.addEventListener('click', event => {
  const card = event.target.closest('[data-person]');
  if (!card) return;
  selected = Number(card.dataset.person);
  const [name, role, memo] = people[selected];
  const stage = stages[selected];
  for (const [key, value] of Object.entries({ candidate:name, role, memo, phase:phases[stage], next:actions[stage] })) document.getElementById(key).textContent = value;
  advance.textContent = stage < 2 ? `${phases[stage + 1]}へ進める` : '確認して閉じる';
  dialog.showModal();
});
advance.addEventListener('click', () => {
  dialog.close();
  if (stages[selected] === 2) return;
  stages[selected]++;
  render();
  lanes.querySelector(`[data-person="${selected}"]`).focus();
  document.querySelector('#notice').textContent = `${people[selected][0]}さんを${phases[stages[selected]]}へ移動しました。`;
});
document.querySelector('#close').addEventListener('click', () => dialog.close());
document.querySelector('#reset').addEventListener('click', () => {
  stages = people.map(person => person[3]);
  render();
  document.querySelector('#notice').textContent = '選考ボードを初期状態に戻しました。';
});
render();
