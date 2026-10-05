// Serialized into the permitted Delta tab. No credentials, network APIs, eval or checkout actions.
async function deltaPage(command,job){
 let stage='account session';
 const visible=e=>!!e&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
 const all=s=>Array.from(document.querySelectorAll(s)).filter(visible);
 const norm=s=>(s||'').replace(/\s+/g,' ').trim();
 const name=e=>norm(e.getAttribute('aria-label')||e.innerText);
 const wait=async(fn,ms=15000)=>{const end=Date.now()+ms;while(Date.now()<end){const value=fn();if(value)return value;await new Promise(r=>setTimeout(r,150));}throw Error(`Delta did not show the expected control: ${stage}.`);};
 const button=regex=>all('button,[role="button"],[role="combobox"]').find(e=>regex.test(name(e)));
 const signed=()=>all('#mach-core-login-flyout-details').some(e=>/miles/i.test(name(e)+' '+e.innerText));
 const guard=()=>{
  if(location.origin!=='https://www.delta.com')throw Error('Wrong browser destination.');
  if(/Access Denied/i.test(document.querySelector('h1')?.innerText||''))throw Error('Delta returned Access Denied. Source paused.');
  if(!signed())throw Error('Delta sign-in required. Both cash and miles need your account session.');
 };
 const input=(e,value)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};
 try{
  if(location.origin!=='https://www.delta.com')throw Error('Wrong browser destination.');
  if(/Access Denied/i.test(document.querySelector('h1')?.innerText||''))throw Error('Delta returned Access Denied. Source paused.');
  if(command==='status'){
   // Give the header time to hydrate before deciding the session is gone.
   const end=Date.now()+12000;while(Date.now()<end&&!signed())await new Promise(r=>setTimeout(r,300));
   return {signed:signed()};
  }
  if(command==='login'){
   // Uses only what Chrome's own password manager has filled in. This code never reads, stores or sends the password.
   if(signed())return {signed:true};
   stage='log in button';
   (await wait(()=>all('#login-trigger')[0]||button(/^Log in$/i))).click();
   stage='saved login from Chrome';
   const pass=await wait(()=>all('#password-input,input[type="password"]')[0]);
   const user=all('#userId-input')[0];
   const filled=()=>{try{return pass.matches(':autofill')||pass.matches(':-webkit-autofill');}catch{return false;}};
   const end=Date.now()+6000;while(Date.now()<end&&!filled())await new Promise(r=>setTimeout(r,200));
   if(!filled()||(user&&!user.value&&!user.matches(':autofill')))throw Error('Delta sign-in required. Chrome has no saved Delta login to fill in.');
   const form=pass.closest('form');
   const submit=Array.from((form||document).querySelectorAll('button[type="submit"],button')).filter(visible).find(e=>/^Log In$/i.test(norm(e.innerText)));
   if(!submit)throw Error('Delta sign-in required. The Log In button was not found.');
   submit.click();
   return {submitted:true};
  }
  await wait(signed,20000).catch(()=>{throw Error('Delta sign-in required. Both cash and miles need your account session.');});guard();
  if(command==='prepare'){
   if(!location.pathname.includes('book-a-flight'))throw Error('Open Delta’s booking form first.');
   const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const label=key=>key[0].toUpperCase()+key.slice(1);
   const findField=key=>all('input').find(e=>e.getAttribute('aria-label')===label(key)||(e.labels&&Array.from(e.labels).some(l=>norm(l.innerText)===label(key)))||(/^predictive_search/.test(e.id)&&new RegExp(label(key),'i').test(e.getAttribute('aria-label')||e.placeholder||'')));
   const findControl=key=>all(`[id$="-ow-${key}-button"]`)[0]||all('button,[role="button"],[role="combobox"]').find(e=>new RegExp('^'+label(key)+'\\b','i').test(name(e)));
   for(const key of ['origin','destination']){
    stage=key+' airport';
    // Delta may open the next picker by itself after one airport is chosen. Take either state.
    await wait(()=>findField(key)||findControl(key),20000);
    let control=findControl(key);
    if(control&&new RegExp('\\b'+job[key]+'\\b').test(name(control)))continue;
    let field=findField(key);
    if(!field){
     control.click();
     field=await wait(()=>findField(key));
    }
    field.focus();
    await sleep(300);
    input(field,job[key]);
    const option=await wait(()=>all('[role="option"]').find(e=>new RegExp('^'+job[key]+'\\b').test(name(e))));
    option.click();
    stage=key+' airport (waiting for it to stick)';
    await wait(()=>{const c=findControl(key);return c&&new RegExp('\\b'+job[key]+'\\b').test(name(c));},6000).catch(()=>{});
    await sleep(600);
   }
   stage='round-trip selector';
   let trip=await wait(()=>button(/^Trip Type,/));
   if(!/Round Trip/.test(name(trip))){trip.click();(await wait(()=>all('[role="option"]').find(e=>/^Round Trip/.test(name(e))))).click();}
   stage='passenger count';
   const party=await wait(()=>button(/^Passenger Count,/));
   if(!new RegExp('Passenger Count, '+job.travelers+'(?:\\D|$)').test(name(party))){party.click();(await wait(()=>all('[role="option"]').find(e=>new RegExp('^'+job.travelers+' Passenger').test(name(e))))).click();}
   stage='opening date picker';
   (await wait(()=>button(/^Flight Date Field,/))).click();
   stage='date picker clear button';
   (await wait(()=>button(/Date Picker .* Clear Button/))).click();
   for(const value of [job.outbound,job.returnDate]){
    stage='calendar date '+value;
    const d=new Date(value+'T12:00:00Z');const label=d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});
    let cell;
    for(let i=0;i<24;i++){
     cell=all('[role="gridcell"]').filter(e=>name(e)===label||name(e).startsWith(label+',')).at(-1);
     if(cell)break;
     // Clearing selected dates retains the displayed month from the last search.
     // Navigate toward the requested date instead of always moving forward.
     const days=all('button[role="gridcell"][data-date-value]');
     const stamps=days.map(e=>{const [m,day,y]=e.getAttribute('data-date-value').split('-').map(Number);return Date.UTC(y,m-1,day,12);}).filter(Number.isFinite);
     if(!stamps.length)throw Error('Delta calendar dates could not be read.');
     const previous=d.getTime()<Math.min(...stamps);
     if(!previous&&d.getTime()<=Math.max(...stamps))throw Error('Requested date is unavailable in Delta’s calendar.');
     const arrow=await wait(()=>button(previous?/^Previous month,/:/^Next month,/));
     if(arrow.disabled||arrow.getAttribute('aria-disabled')==='true')throw Error('Travel date is outside Delta’s available calendar.');
     const before=days.map(e=>e.getAttribute('data-date-value')).join('|');
     arrow.click();
     await wait(()=>all('button[role="gridcell"][data-date-value]').map(e=>e.getAttribute('data-date-value')).join('|')!==before);
    }
    if(!cell)throw Error('Travel date is outside the visible calendar.');
    if(cell.disabled||cell.getAttribute('aria-disabled')==='true'||/unavailable/i.test(name(cell)))throw Error('Requested date is unavailable in Delta’s calendar.');
    cell.click();
   }
   stage='date picker done button';
   (await wait(()=>button(/Date Picker .* Done Button/))).click();
   for(const [selector,checked] of [['#shopWithMiles,#shopMiles',job.currency==='miles'],['#flexibleDate,#flexDates',false],['#basicFaresField',false],['#includeNearByAirport,#flexAirports',false]]){
    stage='fare setting '+selector;
    const e=await wait(()=>all(selector)[0]);if(e.checked!==checked)e.click();
   }
   guard();return {prepared:true};
  }
  if(command==='submit'){
   guard();const submit=button(/^Find Flights$/);if(!submit)throw Error('Find Flights is unavailable.');submit.click();return {submitted:true};
  }
  if(command!=='read')throw Error('Unsupported worker operation.');
  await wait(()=>all('[id^="flight-results-grid-"]').length||/Access Denied/i.test(document.querySelector('h1')?.innerText||''),20000);guard();
  const get=id=>{const e=document.getElementById(id);return e?name(e):'';};
  const currency=()=>{
   const selected=Array.from(document.querySelectorAll('[id^="show-price-in-tabs-"][role="tab"][aria-selected="true"]'))
    .map(e=>norm(e.textContent));
   const values=[...new Set(selected)];
   return values.length===1&&values[0]==='Miles'?'miles':values.length===1&&values[0]==='$USD'?'cash':'unknown';
  };
  // Result rows can render before the selected price tab finishes updating.
  await wait(()=>currency()!=='unknown'&&(!job||currency()===job.currency),20000)
   .catch(()=>{throw Error(`Delta price display could not be verified: expected ${job?.currency||'cash or miles'}, read ${currency()}.`);});
  const rows=all('[id^="flight-results-grid-"]');
  const full=norm(document.body.innerText);
  const raw={signedIn:true,roundTrip:/Round Trip/.test(get('mach-core-header-nav-slim-triptype')),
   route:get('mach-core-header-nav-slim-destination'),dates:get('mach-core-header-nav-slim-dates'),passengers:get('mach-core-header-nav-slim-passenger'),
   outbound:full.match(/Outbound\s+[A-Z]{3}\s+[A-Z]{3}\s+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+[A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/)?.[1]||'',
   currency:currency(),
   discountApplied:/TakeOff15: Your 15% Off Card Member Benefit Applied/.test(full),url:location.href,
   rows:rows.map(row=>{const labels=Array.from(row.querySelectorAll('[aria-label]')).map(e=>e.getAttribute('aria-label'));return {
    arrival:labels.find(s=>/^Confirmed:/.test(s))||'',layovers:[...new Set(labels.filter(s=>/^Layover at/.test(s)))],
    flights:[...new Set(Array.from(row.querySelectorAll('button,[role="button"]')).map(name).filter(s=>/^[A-Z0-9]{2}\d{1,4}(?:\s|,|$)/.test(s)))],
    operator:norm(row.innerText).match(/Operated by ([^.]+)\./)?.[1]||'Delta',
    fares:Array.from(row.querySelectorAll('[id$="-fare-cell-desktop-CMAIN"]')).filter(visible).map(cell=>({name:allIn(cell,'button,[role="button"]')[0]?name(allIn(cell,'button,[role="button"]')[0]):'',text:norm(cell.innerText)}))};})};
  return {raw};
 }catch(e){return {error:e.message||'Delta page could not be read.'};}
 function allIn(root,selector){return Array.from(root.querySelectorAll(selector)).filter(visible);}
}

const months={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
const iso=(y,m,d)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
function parseContext(raw){
 if(!raw.signedIn)throw Error('Delta sign-in is required for both cash and miles.');
 if(!raw.roundTrip)throw Error('A round-trip search is required.');
 const route=raw.route.match(/from ([A-Z]{3}) to ([A-Z]{3})/)||raw.route.match(/([A-Z]{3})\s*-\s*([A-Z]{3})/);
 const departure=raw.outbound.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+([A-Z][a-z]{2})\s+(\d{1,2}),?\s+(\d{4})/);
 const dates=raw.dates.match(/([A-Z][a-z]{2})\s+(\d{1,2})\s*[-–]\s*(?:([A-Z][a-z]{2})\s+)?(\d{1,2})/);
 const party=Number(raw.passengers.match(/\b([1-9])\s+Passenger/)?.[1]);
 if(!route||!departure||!dates||!party)throw Error('Search dates, route or party could not be verified.');
 const year=Number(departure[3]),month=months[departure[1]],returnMonth=months[dates[3]||dates[1]];
 if(!month||!returnMonth||months[dates[1]]!==month||Number(dates[2])!==Number(departure[2]))throw Error('Search dates changed while collecting.');
 const departureDate=iso(year,month,Number(departure[2]));
 const returnDate=iso(year+(returnMonth<month?1:0),returnMonth,Number(dates[4]));
 if(returnDate<=departureDate)throw Error('Return date could not be verified.');
 return {origin:route[1],destination:route[2],departureDate,returnDate,travelers:party};
}
function parseRows(raw,job=null,now=new Date().toISOString()){
 const c=parseContext(raw);
 if(job){
  const expected={origin:job.origin,destination:job.destination,departureDate:job.outbound,returnDate:job.returnDate,travelers:job.travelers,currency:job.currency};
  const actual={...c,currency:raw.currency};
  const mismatches=Object.keys(expected).filter(k=>expected[k]!==actual[k]);
  if(mismatches.length)throw Error('The visible search differs from the requested search: '+mismatches.map(k=>`${k} expected ${expected[k]}, saw ${actual[k]}`).join('; ')+'.');
 }
 if(!['cash','miles'].includes(raw.currency))throw Error('Unsupported or unverified price currency.');
 const quotes=[];
 for(const row of raw.rows){
  const arrival=row.arrival.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+([A-Z][a-z]{2})\s+(\d{1,2})/);
  if(!arrival||!months[arrival[1]])continue;
  let year=Number(c.departureDate.slice(0,4));const month=months[arrival[1]];
  if(month<Number(c.departureDate.slice(5,7)))year++;
  const arrivalDate=iso(year,month,Number(arrival[2]));
  if(arrivalDate<c.departureDate||arrivalDate>=c.returnDate)continue;
  for(const fare of row.fares){
   if(!/Main|Economy/i.test(fare.name)||/Premium|Comfort|Business|One/i.test(fare.name))continue;
   const text=fare.text.replace(/\s+/g,' ').trim();
   if(!/Round Trip/i.test(text)||/Sold Out/i.test(text))continue;
   let miles=0,cash=0;
   if(raw.currency==='miles'){
    // Use the displayed discount, never calculate TakeOff15 for partner flights.
    const discounted=text.match(/Discounted Fare\s*([\d,]+)\s*miles\s*\+\s*\$\s*([\d,.]+)/i);
    const normal=text.match(/(?:^|From\s+)([\d,]+)\s*miles\s*\+\s*\$\s*([\d,.]+)/i);
    const price=discounted||normal;if(!price)continue;
    miles=Number(price[1].replaceAll(',',''));cash=Number(price[2].replaceAll(',',''));
   }else{
    const price=text.match(/From\s*\$\s*([\d,.]+)/i);if(!price)continue;
    cash=Number(price[1].replaceAll(',',''));
   }
   if(!Number.isFinite(cash)||!Number.isInteger(miles))continue;
   quotes.push({...c,arrivalDate,source:'Delta · existing Chrome',sourceUrl:raw.url,
    airline:row.operator||'Delta',cashTotal:cash*c.travelers,milesTotal:miles*c.travelers,program:miles?'Delta':'Cash',
    stops:row.layovers.length,fare:/Basic|Light/i.test(fare.name)?'basic':/Main Classic/i.test(fare.name)?'standard':'unknown',
    completeRoundTrip:false,seatsConfirmed:false,takeoff15:!!raw.discountApplied,observedAt:now,window:job?.label||'Existing Chrome search',
    details:`Signed-in outbound lead. ${row.flights.join(', ')}. ${fare.name}. ${row.layovers.join('; ')}. ${raw.discountApplied?'TakeOff15 banner displayed. ':''}Displayed round-trip FROM price per person: ${miles?miles.toLocaleString()+' miles + ':''}$${cash}. Return selection and final party total remain unconfirmed.`});
   if(quotes.length===30)return quotes;
  }
 }
 if(!quotes.length)throw Error('No supported economy fare evidence found; no price was inferred.');
 return quotes;
}


window.tmState=()=>({i:+localStorage.tmI||0,n:JSON.parse(localStorage.tmJobs).length,rows:JSON.parse(localStorage.tmOut||'[]').length});
window.tmA=async()=>{const jobs=JSON.parse(localStorage.tmJobs);const i=+localStorage.tmI||0;if(i>=jobs.length)return {done:true};const job=jobs[i];
 const r=await deltaPage('prepare',job);
 if(r.error){const log=JSON.parse(localStorage.tmLog||'[]');log.push([i,'prepare',r.error]);localStorage.tmLog=JSON.stringify(log);localStorage.tmI=i+1;return {i,skipped:r.error};}
 setTimeout(()=>{deltaPage('submit',job);},400);return {i,prepared:job.origin+' '+job.outbound+' '+job.returnDate+' '+job.currency};};
window.tmB=async()=>{const jobs=JSON.parse(localStorage.tmJobs);const i=+localStorage.tmI||0;if(i>=jobs.length)return {done:true};const job=jobs[i];
 if(!/search-results/.test(location.href))return {i,notOnResults:location.pathname};
 let err=null,quotes=[];
 try{const r=await deltaPage('read',job);if(r.error)throw Error(r.error);quotes=parseRows(r.raw,job);}catch(e){err=e.message;}
 if(err){const log=JSON.parse(localStorage.tmLog||'[]');log.push([i,'read',err]);localStorage.tmLog=JSON.stringify(log);localStorage.tmI=i+1;return {i,error:err};}
 const out=JSON.parse(localStorage.tmOut||'[]');
 for(const q of quotes){const fl=(q.details.match(/lead\. (.*?)\. (?:Delta )?Main/)||q.details.match(/lead\. (.*?)\. /)||[])[1]||'';const lay=(q.details.match(/Layover at[^.]*/g)||[]).join('; ');
  out.push([q.origin,q.departureDate,q.returnDate,q.arrivalDate,q.milesTotal/3,Math.round(q.cashTotal/3*100)/100,q.stops,q.fare[0],q.airline,q.takeoff15?1:0,fl,lay,q.details.match(/\. ([^.]*Main[^.]*)\./)?.[1]||'']);}
 localStorage.tmOut=JSON.stringify(out);localStorage.tmI=i+1;
 const m=quotes.filter(q=>q.fare!=='basic');const best=m.length?Math.min(...m.map(q=>q.milesTotal?q.milesTotal/3:q.cashTotal/3)):null;
 return {i,job:job.origin+' '+job.outbound+'>'+job.returnDate+' '+job.currency,quotes:quotes.length,best,t15:quotes[0]?.takeoff15};};
