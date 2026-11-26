const guideNotes = {
  sites: ['区画について', [['草原区画', '砂丘の内側にある草地に、自分のテントを張る区画。1区画1泊3,200円です。'], ['砂丘デッキ', '草を踏まずに過ごせる木のデッキ。固定用のリングを備えています。1区画1泊4,400円です。'], ['共通の利用料', '各区画は4人まで。区画料とは別に、1人1泊600円です。']]],
  gear: ['設備と持ち物', [['水まわり', '入口の小屋に飲用水の蛇口、流し台、トイレがあります。区画内には電源がありません。'], ['荷物に加えるもの', 'テント、寝袋、灯りのほか、潮風を防ぐ上着を。草原区画には長めのペグ、デッキには固定用のロープをお持ちください。'], ['夜の過ごし方', '草地を守るため直火は禁止です。夜9時からは、波音が聞こえるくらいの小さな声で。']]],
  access: ['アクセス', [['徒歩で', '架空の「砂丘口」停留所から、海側の木道を約12分。風見旗の立つ小屋が受付です。'], ['車で', '架空の潮見岬道から「野営地入口」の標識を曲がり、共同駐車場へ。区画までの荷物運びには小屋の手押し車を使えます。'], ['到着の目安', 'チェックインは14時から17時まで。日暮れ前に設営できるようお越しください。']]]
};
const notes = document.querySelector('#notes');
const planner = document.querySelector('#plan');
for (const button of document.querySelectorAll('[data-note]')) {
  button.addEventListener('click', () => {
    const [title, entries] = guideNotes[button.dataset.note];
    document.querySelector('#note-title').textContent = title;
    const list = document.createElement('dl');
    for (const [term, description] of entries) {
      const heading = document.createElement('dt');
      const detail = document.createElement('dd');
      heading.textContent = term;
      detail.textContent = description;
      list.append(heading, detail);
    }
    document.querySelector('#note-body').replaceChildren(list);
    notes.showModal();
  });
}
function updatePrice() {
  const price = Number(document.querySelector('#site').value);
  const people = Number(document.querySelector('#people').value);
  const nights = Number(document.querySelector('#nights').value);
  document.querySelector('#total').textContent = `合計　${((price + people * 600) * nights).toLocaleString('ja-JP')}円`;
}
planner.addEventListener('change', updatePrice);
document.querySelector('[data-plan]').addEventListener('click', () => { updatePrice(); planner.showModal(); });
for (const button of document.querySelectorAll('.close')) button.addEventListener('click', () => button.closest('dialog').close());
