const samples = [
  [['11月12日', '¥12,800', '青葉文具店'], ['11月12日', '¥12,800', '青葉文具店']],
  [['11月14日', '¥8,400', '森野印刷室'], ['11月14日', '¥8,040', '森野印刷室']],
  [['11月18日', '¥3,960', '泉町書房'], ['11月19日', '¥3,960', '泉町書房']]
];
const fields = ['日付', '金額', '取引先'];
const lists = ['receipt', 'ledger'].map(id => document.getElementById(id));
const options = document.querySelectorAll('[data-index]');
const statusText = document.getElementById('status');
let selected = 0;
function render() {
  lists.forEach((list, side) => {
    list.replaceChildren(...samples[selected][side].map((value, index) => {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const data = document.createElement('dd');
      term.textContent = fields[index];
      data.textContent = value;
      row.append(term, data);
      return row;
    }));
  });
}
options.forEach(option => option.addEventListener('click', () => {
  selected = Number(option.dataset.index);
  options.forEach(item => item.setAttribute('aria-pressed', String(item === option)));
  render();
  statusText.textContent = `${samples[selected][0][2]}の記録を表示しました。`;
}));
document.getElementById('compare').addEventListener('click', () => {
  const [receipt, ledger] = samples[selected];
  const differences = fields.filter((field, index) => {
    const differs = receipt[index] !== ledger[index];
    lists.forEach(list => list.children[index].classList.toggle('diff', differs));
    return differs;
  });
  statusText.textContent = differences.length ? `${differences.join('・')}が異なります。両方の記録を確認してください。` : '照合完了。3項目すべて一致しています。';
});
render();
