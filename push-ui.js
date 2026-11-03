/* Optional Web Push: explicit owner opt-in, no symptom/flow/mood entries uploaded. */
(()=>{
  'use strict';
  const DATA_KEY='pretty-girl-v2',TOKEN_KEY='pretty-girl-push-token';
  const $=s=>document.querySelector(s);
  let busy=false,lastFeedback='',lastError=false,connected=false,serverReady=false,failedSetup='',syncTimer;
  const read=()=>{try{return JSON.parse(localStorage.getItem(DATA_KEY))||{};}catch{return {};}};
  const token=()=>localStorage.getItem(TOKEN_KEY)||'';
  const keyBytes=encoded=>{const padded=encoded+'='.repeat((4-encoded.length%4)%4);return Uint8Array.from(atob(padded.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0));};
  const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const dateOf=s=>new Date(s+'T12:00:00');
  const addDays=(s,n)=>{const d=dateOf(s);d.setDate(d.getDate()+n);return iso(d);};
  const days=(a,b)=>Math.round((dateOf(b)-dateOf(a))/86400000);
  const nextEstimate=data=>{
    const starts=(data.periods||[]).map(p=>p.start).filter(s=>/^\d{4}-\d{2}-\d{2}$/.test(s)).sort();
    if(!starts.length)return null;
    const gaps=starts.slice(1).map((v,i)=>days(starts[i],v)).filter(n=>n>=15&&n<=60);
    const cycle=gaps.length?Math.round(gaps.slice(-6).reduce((a,b)=>a+b,0)/Math.min(6,gaps.length)):Number(data.settings?.cycle||28);
    if(!Number.isInteger(cycle)||cycle<15||cycle>60)return null;
    let predicted=starts.at(-1),i=0;
    while(predicted<iso(new Date())&&i++<1000)predicted=addDays(predicted,cycle);
    return {nextDate:predicted,cycleDays:cycle};
  };
  function reminder(){
    const data=read(),estimate=nextEstimate(data);
    if(!estimate)throw Error('Log a period first so Pretty Girl can estimate the next date.');
    const form=$('#pg-push-form'),advanceDays=Number(form?.querySelector('[name="advanceDays"]')?.value??data.settings?.remindDays??2);
    const hour=Number(form?.querySelector('[name="hour"]')?.value??data.settings?.remindHour??9);
    const style=form?.querySelector('[name="style"]')?.value??data.settings?.reminderType??'private';
    if(!Number.isInteger(advanceDays)||advanceDays<0||advanceDays>14||!Number.isInteger(hour)||hour<0||hour>23)throw Error('Choose a valid lead time and hour.');
    return {...estimate,advanceDays,hour,style:style==='explicit'?'explicit':'private',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'};
  }
  const feedback=(message,error=false)=>{lastFeedback=message;lastError=error;const node=$('#pg-push-message');if(node){node.textContent=message;node.style.color=error?'#ffb4bb':'#b9f3ce';}};
  async function request(body){
    const response=await fetch('/.netlify/functions/push-reminders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const json=await response.json().catch(()=>({}));
    if(!response.ok){const e=Error(json.error||`Notification server returned ${response.status}`);e.code=json.code;e.status=response.status;throw e;}
    return json;
  }
  async function currentSubscription(){const reg=await navigator.serviceWorker.ready;return reg.pushManager.getSubscription();}
  async function serverStatus(){
    try{const r=await fetch('/.netlify/functions/push-reminders',{cache:'no-store'});const v=await r.json();serverReady=Boolean(v.ready);failedSetup=v.error||'';return v;}
    catch{serverReady=false;failedSetup='Cannot reach the notification server.';return {ready:false};}
  }
  function setBusy(next){busy=next;$('#pg-push-form')?.querySelectorAll('button').forEach(b=>b.disabled=busy);}
  async function refresh(){
    if(!$('#pg-push-form'))return;
    await serverStatus();
    let sub=null,verified=false;
    try{if('serviceWorker' in navigator&&'PushManager' in window){sub=await currentSubscription();if(sub&&token()&&serverReady){const v=await request({action:'verify',subscription:sub.toJSON(),manageToken:token()});verified=v.enrolled===true;}}}catch{}
    connected=verified;
    const supported='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
    const status=$('#pg-push-status');
    if(status)status.textContent=!supported?'This browser does not support web push. On iPhone, install Pretty Girl to the Home Screen first.':!serverReady?'Setup needed: '+failedSetup:connected?'Push notifications connected to this device.':sub?'Subscription needs repair.':'Push notifications are off.';
    const enable=$('#pg-enable'),disable=$('#pg-disable'),test=$('#pg-test');
    if(enable){enable.textContent=sub&&!connected?'Repair push notifications':connected?'Update push subscription':'Enable push notifications';enable.disabled=!supported||!serverReady||busy||!nextEstimate(read());}
    if(disable)disable.disabled=busy||!sub;
    if(test)test.disabled=busy||!connected;
  }
  async function saveSchedule(){
    const value=reminder(),data=read();data.settings={...data.settings,remindDays:value.advanceDays,remindHour:value.hour,reminderType:value.style};localStorage.setItem(DATA_KEY,JSON.stringify(data));
    if(!token())return feedback('Preferences saved. Enable push notifications to receive reminders.');
    const sub=await currentSubscription();if(!sub)return feedback('Saved locally. Push is not currently subscribed on this phone.',true);
    const response=await request({action:'save',subscription:sub.toJSON(),manageToken:token(),reminder:value});
    localStorage.setItem(TOKEN_KEY,response.manageToken);connected=true;feedback('Schedule saved and synchronized with the notification server.');
  }
  async function enable(){
    // Permission request must happen immediately from this tap on iPhone.
    const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Notifications were not allowed in iPhone settings.');
    const server=await serverStatus();if(!server.ready)throw Error(server.error||'Netlify push is not configured.');
    const registration=await navigator.serviceWorker.ready;
    let sub=await registration.pushManager.getSubscription();
    const options={userVisibleOnly:true,applicationServerKey:keyBytes(server.publicKey)};
    if(sub){try{const got=await sub.options.applicationServerKey;const key=got?new Uint8Array(got):null;if(key&&key.length&&key.toString()!==options.applicationServerKey.toString()){await sub.unsubscribe();sub=null;localStorage.removeItem(TOKEN_KEY);}}catch{}}
    if(!sub)sub=await registration.pushManager.subscribe(options);
    let response;
    try{response=await request({action:'save',subscription:sub.toJSON(),manageToken:token(),reminder:reminder()});}
    catch(e){if(e.code==='REPAIR'){await sub.unsubscribe();localStorage.removeItem(TOKEN_KEY);sub=await registration.pushManager.subscribe(options);response=await request({action:'save',subscription:sub.toJSON(),reminder:reminder()});}else throw e;}
    localStorage.setItem(TOKEN_KEY,response.manageToken);connected=true;
    feedback('Push notifications enabled. Use Send test notification to confirm delivery.');
  }
  async function disable(){
    const sub=await currentSubscription();let remoteIssue=false;
    if(sub&&token()){try{await request({action:'disable',subscription:sub.toJSON(),manageToken:token()});}catch{remoteIssue=true;}}
    if(sub)await sub.unsubscribe();localStorage.removeItem(TOKEN_KEY);connected=false;
    feedback(remoteIssue?'Disabled on this phone, but server cleanup could not be confirmed.':'Push notifications disabled on this phone.',remoteIssue);
  }
  async function test(){const sub=await currentSubscription();if(!sub||!token())throw Error('Enable notifications first.');const result=await request({action:'test',subscription:sub.toJSON(),manageToken:token()});feedback(result.accepted?'Test accepted by the push provider. Check your iPhone notification tray.':'Test submitted.');}
  async function act(fn){if(busy)return;setBusy(true);try{await fn();}catch(e){feedback(e.message||'Notification action failed.',true);}finally{setBusy(false);await refresh();}}
  function mount(){
    const card=$('#push-reminder-card');if(!card||card.querySelector('#pg-push-form'))return;
    const data=read(),estimate=nextEstimate(data);
    const panel=document.createElement('div');panel.id='pg-push-form';panel.innerHTML=
      '<p class="muted">Real iPhone push notifications, including while the app is closed. No calendar export needed. Reminders are estimates.</p>'+
      '<p id="pg-push-status" class="muted" role="status">Checking push configuration…</p>'+
      '<label>Notify this many days before the estimated period</label><input name="advanceDays" type="number" min="0" max="14" step="1">'+
      '<label>Notification hour (your phone’s timezone)</label><select name="hour"></select>'+
      '<label>Lock-screen wording</label><select name="style"><option value="private">Private: Time for a check-in</option><option value="explicit">Period expected soon</option></select>'+
      '<div class="actions" style="margin-top:16px"><button id="pg-save" type="button">Save schedule</button><button id="pg-enable" type="button">Enable push notifications</button></div>'+
      '<div class="actions" style="margin-top:9px"><button id="pg-test" type="button">Send test notification</button><button id="pg-disable" type="button">Disable notifications</button></div>'+
      '<p id="pg-push-message" class="muted" role="status" aria-live="polite"></p>'+
      '<p class="muted">The server stores the estimated next period date, reminder preferences, and this device’s push subscription; it does not receive mood, flow, pain, or notes. Do not treat cycle estimates as contraception. Reminders are best effort and may arrive late.</p>';
    card.append(panel);
    panel.querySelector('[name="advanceDays"]').value=data.settings?.remindDays??2;
    const hours=panel.querySelector('[name="hour"]');for(let i=0;i<24;i++){const option=document.createElement('option');option.value=String(i);option.textContent=new Intl.DateTimeFormat(undefined,{hour:'numeric',hour12:true,timeZone:'UTC'}).format(new Date(Date.UTC(2020,0,1,i)));hours.append(option);}hours.value=String(data.settings?.remindHour??9);
    panel.querySelector('[name="style"]').value=data.settings?.reminderType==='explicit'?'explicit':'private';
    $('#pg-save').onclick=()=>act(saveSchedule);
    $('#pg-enable').onclick=()=>act(enable);
    $('#pg-disable').onclick=()=>act(disable);
    $('#pg-test').onclick=()=>act(test);
    if(lastFeedback)feedback(lastFeedback,lastError);
    if(!estimate)feedback('Log a period before enabling reminders.',true);
    refresh();
  }
  // The underlying app completely redraws Settings whenever its tab changes.
  const observer=new MutationObserver(()=>{if($('#push-reminder-card')&&!$('#pg-push-form'))mount();});observer.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('pretty-girl:data-changed',()=>{
    if(!token())return;
    clearTimeout(syncTimer);syncTimer=setTimeout(async()=>{
      try{const sub=await currentSubscription();if(!sub)return;const response=await request({action:'save',subscription:sub.toJSON(),manageToken:token(),reminder:reminder()});if(response.manageToken)localStorage.setItem(TOKEN_KEY,response.manageToken);}
      catch(e){console.warn('Reminder sync failed; open Settings to retry:',e.message);}
    },1500);
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
