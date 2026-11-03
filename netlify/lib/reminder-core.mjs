import { createHash, randomBytes, timingSafeEqual, createECDH } from 'node:crypto';

export const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export const hash = value => createHash('sha256').update(value).digest('hex');
export const newToken = () => randomBytes(32).toString('hex');
export function authorized(token,storedHash){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||typeof storedHash!=='string'||!/^[a-f0-9]{64}$/.test(storedHash))return false;
  return timingSafeEqual(Buffer.from(hash(token),'hex'),Buffer.from(storedHash,'hex'));
}
export function configuration(env=process.env){
  const publicKey=String(env.VAPID_PUBLIC_KEY||'').trim(),privateKey=String(env.VAPID_PRIVATE_KEY||'').trim(),subject=String(env.VAPID_SUBJECT||'').trim();
  if(!publicKey||!privateKey||!subject)return {ready:false,error:'Set all three VAPID variables in Netlify.'};
  if(!/^(https:\/\/|mailto:)/.test(subject))return {ready:false,error:'VAPID_SUBJECT must begin with https:// or mailto:.'};
  try{
    const priv=Buffer.from(privateKey,'base64url'),pub=Buffer.from(publicKey,'base64url');
    if(priv.length!==32||pub.length!==65||pub[0]!==4)throw Error('length');
    const pair=createECDH('prime256v1');pair.setPrivateKey(priv);
    if(!pair.getPublicKey().equals(pub))throw Error('mismatch');
  }catch{return {ready:false,error:'The two VAPID keys are invalid or do not match.'};}
  return {ready:true,publicKey,privateKey,subject};
}
export function validSubscription(s){
  if(typeof s?.endpoint!=='string'||typeof s?.keys?.p256dh!=='string'||typeof s?.keys?.auth!=='string'||s.endpoint.length>2048)return false;
  if(s.keys.p256dh.length>512||s.keys.auth.length>512)return false;
  try{
    const u=new URL(s.endpoint);if(u.protocol!=='https:')return false;
    return u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname==='push.services.mozilla.com'||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.push.apple.com')||u.hostname.endsWith('.notify.windows.com');
  }catch{return false;}
}
const dateRegex=/^\d{4}-\d{2}-\d{2}$/;
function strictDay(value){
  if(typeof value!=='string'||!dateRegex.test(value))return null;
  const d=new Date(value+'T12:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value?value:null;
}
export function addDays(day,amount){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+amount);return d.toISOString().slice(0,10);}
export function dayDifference(a,b){return Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);}
export function safeReminder(input){
  const nextDate=strictDay(input?.nextDate);
  const cycleDays=Number(input?.cycleDays),advanceDays=Number(input?.advanceDays),hour=Number(input?.hour);
  const timezone=String(input?.timezone||'');
  if(!nextDate||!Number.isInteger(cycleDays)||cycleDays<15||cycleDays>60||!Number.isInteger(advanceDays)||advanceDays<0||advanceDays>14||!Number.isInteger(hour)||hour<0||hour>23)return null;
  try{new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format();}catch{return null;}
  if(timezone.length>80)return null;
  return {nextDate,cycleDays,advanceDays,hour,timezone,style:input.style==='explicit'?'explicit':'private'};
}
export function localParts(now,timeZone){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const get=t=>parts.find(x=>x.type===t)?.value;
  return {date:`${get('year')}-${get('month')}-${get('day')}`,hour:Number(get('hour'))};
}
export function dueNotification(reminder,now=new Date(),lastSentKey=''){
  const local=localParts(now,reminder.timezone);
  let due=reminder.nextDate;
  // Keep a cycle estimate moving until the owner logs a more recent period.
  for(let i=0;i<240&&dayDifference(due,local.date)>0;i++)due=addDays(due,reminder.cycleDays);
  const target=addDays(due,-reminder.advanceDays);
  const key=`${due}:${reminder.advanceDays}`;
  if(local.date!==target||local.hour!==reminder.hour||lastSentKey===key)return {send:false,nextDate:due,key};
  const body=reminder.style==='explicit'?'Your period is estimated to begin '+(reminder.advanceDays===0?'today':`in ${reminder.advanceDays} day${reminder.advanceDays===1?'':'s'}`)+'. Log changes in Pretty Girl.':'You have a private check-in scheduled. Open Pretty Girl.';
  return {send:true,nextDate:due,key,payload:{title:reminder.style==='explicit'?'Pretty Girl · Cycle reminder':'Pretty Girl · Private reminder',body,tag:'pretty-girl-period-'+key,url:'/'}};
}
