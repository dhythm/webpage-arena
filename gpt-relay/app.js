const periods = {
  day: {labels:['06時','09時','12時','15時','18時','21時'], dates:'2026.11.28', compare:'前日比', totals:[931,682,535], offset:2},
  week: {labels:['11/22','11/23','11/24','11/25','11/26','11/27','11/28'], dates:'2026.11.22 — 11.28', compare:'前週比', totals:[5480,4126,3240], offset:0},
  month: {labels:['11/1–7','11/8–14','11/15–21','11/22–28'], dates:'2026.11.01 — 11.28', compare:'前月比', totals:[22234,17302,13886], offset:4}
};
const hubs=['東湾ハブ','中央ハブ','西丘ハブ'];
const icons=['<path d="m3 7 9-5 9 5v11l-9 5-9-5Zm0 0 9 5 9-5m-9 5v11M7 5l9 5"/>','<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>','<circle cx="12" cy="14" r="8"/><path d="M12 10v4l3 2M9 2h6m-3 0v4m6 1 2-2"/>','<path d="M2 5h12v12H2Zm12 4h4l4 5v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>'];
const metrics=[['総配送件数','件','#375dec','#eaf0ff'],['定時配送率','%','#159b86','#e0f5ef'],['平均配送時間','分','#885bce','#f0eafc'],['稼働車両数','台','#cc8a24','#fff2d9']];
const element=id=>document.getElementById(id);
element('metrics').innerHTML=metrics.map(([name,unit,color,pale],index)=>`<article class="metric" style="--ink:${color};--pale:${pale}"><div class="metric-head"><span class="metric-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[index]}</svg></span>${name}</div><div class="value"><b></b><span>${unit}</span></div><div class="metric-foot"><span class="delta"></span><span class="compare"></span><svg class="spark" viewBox="0 0 84 26" preserveAspectRatio="none" aria-hidden="true"></svg></div></article>`).join('');
let period='week';
let animation=0;
const sum=values=>values.reduce((total,value)=>total+value,0);
function distribute(total,weights){let assigned=0;return weights.map((weight,index)=>{const count=index===weights.length-1?total-assigned:Math.round(total*weight/sum(weights));assigned+=count;return count;});}
function drawTrend(labels,now,prior){
  const max=Math.max(...now,...prior), step=10**Math.floor(Math.log10(max))/2, ceiling=Math.ceil(max/step)*step;
  const floor=170, height=146, group=600/labels.length, width=Math.min(27,group*.32);
  let svg='<g fill="#708098" font-family="Arial,sans-serif" font-size="11"><text x="0" y="12">件</text>';
  for(let tick=0;tick<=4;tick++){const ypos=floor-height*tick/4;svg+=`<path d="M43 ${ypos}H650" stroke="#e2e7f0" stroke-dasharray="3 4"/><text x="36" y="${ypos+4}" text-anchor="end">${Math.round(ceiling*tick/4).toLocaleString()}</text>`;}
  labels.forEach((label,index)=>{const center=49+group*(index+.5);[prior[index],now[index]].forEach((count,which)=>{const barHeight=height*count/ceiling;svg+=`<rect x="${center+(which?1:-width-1)}" y="${floor-barHeight}" width="${width}" height="${barHeight}" rx="2" fill="${which?'#3c62e9':'#cddaf7'}"><title>${label} ${which?'今期':'前期'}：${count.toLocaleString()}件</title></rect>`;});svg+=`<text x="${center}" y="194" text-anchor="middle">${label}</text>`;});element('trend').innerHTML=svg+'</g>';
}
function render(){
  const config=periods[period], branch=Number(element('branch').value), ids=branch?[branch-1]:[0,1,2];
  const total=sum(ids.map(index=>config.totals[index]));
  const rate=index=>[98.9,98.4,98.3][index]-.09*config.offset;
  const vehicles=index=>[54,42,32][index]+config.offset*(index+1);
  const weighted=fn=>sum(ids.map(index=>config.totals[index]*fn(index)))/total;
  const values=[total,weighted(rate),weighted(index=>[41.5,43.2,44.5][index]+config.offset*.7),sum(ids.map(vehicles))];
  const changes=[12.8+branch*.7-config.offset*.4,.8+.1*branch+.1*config.offset,-5.2-branch*.4-config.offset*.3,6.7+branch*.9+config.offset*.2];
  const weights=config.labels.map((_,index)=>[64,78,69,89,77,94,103][index]+12*Math.sin(index*(branch+1)+config.offset));
  const now=distribute(total,weights),prior=distribute(Math.round(total/(1+changes[0]/100)),weights.map((weight,index)=>weight+10*Math.cos(index+branch)));
  element('dates').textContent=config.dates;drawTrend(config.labels,now,prior);
  document.querySelectorAll('[data-period]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.period===period)));
  const cards=[...document.querySelectorAll('.metric')], starts=cards.map((card,index)=>Number(card.dataset.display??values[index]));
  cancelAnimationFrame(animation);const start=performance.now(),duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:450;
  function update(time){const progress=duration?Math.min(1,(time-start)/duration):1;cards.forEach((card,index)=>{const displayed=starts[index]+(values[index]-starts[index])*(1-(1-progress)**3);card.dataset.display=displayed;card.querySelector('.value b').textContent=displayed.toLocaleString('ja-JP',{minimumFractionDigits:index===1||index===2?1:0,maximumFractionDigits:index===1||index===2?1:0});});if(progress<1)animation=requestAnimationFrame(update);}update(start);
  cards.forEach((card,index)=>{card.querySelector('.delta').textContent=`${changes[index]<0?'↘':'↗'} ${Math.abs(changes[index]).toFixed(1)}${index===1?'pt':'%'}`;card.querySelector('.compare').textContent=config.compare;const points=Array.from({length:13},(_,point)=>`${point*7},${(index===2?6+point:20-point)+Math.sin(point*1.5+branch+index+config.offset)*3.8+Math.cos(point*.9)*2}`);card.querySelector('.spark').innerHTML=`<polygon points="0,26 ${points.join(' ')} 84,26" fill="${metrics[index][3]}"/><polyline points="${points.join(' ')}" stroke="${metrics[index][2]}" stroke-width="1.8" fill="none"/>`;});
  const shares=[76+branch*2-config.offset,17-branch+config.offset,7-branch], colors=['#3c62e9','#35b6a5','#f3bd57'];let offset=0;
  element('donut').innerHTML=shares.map((share,index)=>{const circle=`<circle cx="70" cy="70" r="57" fill="none" stroke="${colors[index]}" stroke-width="18" pathLength="100" stroke-dasharray="${share-.65} ${100-share+.65}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"/>`;offset+=share;return circle;}).join('');
  element('ring-total').textContent=total.toLocaleString();element('statuses').innerHTML=shares.map((share,index)=>`<div class="status-row"><i class="dot" style="background:${colors[index]}"></i>${['配送完了','配送中','出荷待ち'][index]}<strong>${share}%</strong></div>`).join('');
  element('rows').innerHTML=ids.map(index=>`<tr><td>${hubs[index]}</td><td>${config.totals[index].toLocaleString()} 件</td><td>${rate(index).toFixed(1)}%</td><td>${vehicles(index)} 台</td></tr>`).join('');
}
document.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>{period=button.dataset.period;render();}));element('branch').addEventListener('change',render);render();
