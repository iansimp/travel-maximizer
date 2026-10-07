(()=>{
 const key='tm-ba-london-quotes-v1';
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clock=s=>Date.parse(s.slice(0,19)+'Z'); // Seats.aero timestamps preserve airport-local clocks.
 const sumTax=parts=>{const result={};for(const p of parts){if(p.tax===null||!Number.isFinite(p.tax)){result.Unknown=null;continue;}result[p.currency]=(result[p.currency]||0)+p.tax;}return result;};
 function valid(q){return q&&['out','return'].includes(q.d)&&/^202[67]-\d\d-\d\d$/.test(q.date)&&q.date>='2026-12-01'&&q.date<='2027-01-16'&&Number.isFinite(q.p)&&q.p>0&&Number.isFinite(q.tax)&&q.tax>=0&&Number.isInteger(q.s)&&q.s>=1&&q.s<=9&&['USD','GBP','EUR'].includes(q.currency)&&(!q.departTime||/^\d\d:\d\d$/.test(q.departTime))&&(!q.arrival||/^202[67]-\d\d-\d\dT\d\d:\d\d$/.test(q.arrival));}
 function combine(long,q,minHours=4){
  if(!valid(q)||long.d!==q.d)return null;
  const baDepart=q.departTime?q.date+'T'+q.departTime:undefined;
  const before=q.d==='out'?long.arrive:q.arrival,after=q.d==='out'?baDepart:long.depart;
  let hours=null,provisional=true;
  if(before&&after){hours=(clock(after)-clock(before))/3600000;if(hours<minHours||hours>36)return null;provisional=false;}
  else {const a=(before||q.date).slice(0,10),b=(after||q.date).slice(0,10),days=(clock(b+'T00:00:00')-clock(a+'T00:00:00'))/86400000;if(days<0||days>1)return null;}
  const ba={d:q.d,date:q.date,c:['BA'],home:'LAX',p:q.p,tax:q.tax,currency:q.currency,s:q.s,depart:baDepart||q.date+'T00:00:00',arrive:q.arrival||q.date+'T23:59:00',route:q.d==='out'?'LHR → TLV':'TLV → LHR',flight:'BA · manually entered',program:'British Airways Club',source:'Your BA quote',checked:q.checked||new Date().toISOString(),timeUnknown:q.d==='out'?!q.arrival:!q.departTime};
  const parts=q.d==='out'?[long,ba]:[ba,long];
  return {d:q.d,date:parts[0].date,c:[...new Set(parts.flatMap(p=>p.c))],home:'LAX',p:long.p+q.p,tax:0,currency:'USD',taxes:sumTax(parts),s:long.s===null?null:Math.min(long.s||0,q.s),depart:parts[0].depart,arrive:parts[1].arrive,route:q.d==='out'?'LAX → LHR → TLV':'TLV → LHR → LAX',flight:parts.map(p=>p.flight).join(' / '),program:parts.map(p=>p.program).join(' + '),source:'Seats.aero + your BA quote',checked:long.checked,viaLondon:true,parts,connectionHours:hours,provisional,timeUnknown:ba.timeUnknown};
 }
 function init(root,redraw){
  const $=id=>root.querySelector('#'+id);let quotes=[];
  try{const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))quotes=saved.filter(valid);}catch{}
  const persist=()=>{try{localStorage.setItem(key,JSON.stringify(quotes));$('mx-ba-message').textContent='Saved in this browser.';}catch{$('mx-ba-message').textContent='Saved for this visit only; browser storage is unavailable.';}};
  function render(){
   $('mx-ba-quotes').innerHTML=quotes.length?quotes.map(q=>`<div class="ba-quote"><span>${q.d==='out'?'LHR → TLV':'TLV → LHR'} · ${esc(q.date)} · ${q.p.toLocaleString()} Avios + ${q.currency} ${q.tax.toFixed(2)} per person · ${q.s} seats${q.departTime?' · '+esc(q.departTime):''}${q.arrival?' → '+esc(q.arrival.replace('T',' ')):''}</span><button type="button" data-ba-remove="${esc(q.id)}" aria-label="Remove BA quote for ${esc(q.date)}">Remove</button></div>`).join(''):'<p class="sub">No BA quotes saved. Add a date-specific quote to compare a London connection.</p>';
  }
  $('mx-ba-form').addEventListener('submit',e=>{
   e.preventDefault();
   const q={id:String(Date.now()),d:$('mx-ba-direction').value,date:$('mx-ba-date').value,p:Number($('mx-ba-avios').value),tax:Number($('mx-ba-cash').value),currency:$('mx-ba-currency').value,s:Number($('mx-ba-seats').value),departTime:$('mx-ba-time').value,arrival:$('mx-ba-arrival').value,checked:new Date().toISOString()};
   if(!valid(q)||!$('mx-ba-cash').value){$('mx-ba-message').textContent='Enter a date in the search window, Avios, cash charges and seat count.';return;}
   if(q.departTime&&q.arrival){const hours=(clock(q.arrival)-clock(q.date+'T'+q.departTime))/3600000+(q.d==='out'?2:-2);if(hours<=0||hours>12){$('mx-ba-message').textContent='Check the flight times: use London local time for London and Israel local time for TLV.';return;}}
   quotes=quotes.filter(x=>!(x.d===q.d&&x.date===q.date&&x.departTime===q.departTime));quotes.push(q);persist();render();$('mx-london').checked=true;redraw();
  });
  $('mx-ba-quotes').addEventListener('click',e=>{const b=e.target.closest('[data-ba-remove]');if(!b)return;quotes=quotes.filter(q=>q.id!==b.dataset.baRemove);persist();render();redraw();});
  render();
  return {getLeads(){if(!$('mx-london').checked)return [];const result=[];const hours=Number($('mx-london-gap').value)||4;for(const long of window.tmLondonFlightLeads||[])for(const q of quotes){const f=combine(long,q,hours);if(f)result.push(f);}return result;},status(){return `${(window.tmLondonFlightLeads||[]).length.toLocaleString()} nonstop LAX ↔ Heathrow leads · ${quotes.length} BA quotes saved · prices and seats require live confirmation`;}};
 }
 window.tmLondon={init,combine,valid,sumTax};
})();
