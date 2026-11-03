import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import {json,hash,newToken,authorized,configuration,validSubscription,safeReminder} from '../lib/reminder-core.mjs';

const store=()=>getStore('pretty-girl-push-subscriptions');
const sameEndpointAndKeys=(a,b)=>Boolean(a?.endpoint===b?.endpoint&&a?.keys?.auth&&a.keys.auth===b?.keys?.auth&&a?.keys?.p256dh&&a.keys.p256dh===b?.keys?.p256dh);
export default async function handler(req){
  const config=configuration();
  if(req.method==='GET')return json({ready:config.ready,publicKey:config.ready?config.publicKey:null,error:config.ready?null:config.error});
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  if(!config.ready)return json({error:config.error,code:'VAPID_SETUP'},503);
  const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'Cross-origin request rejected'},403);
  let body;try{const raw=await req.text();if(raw.length>12000)return json({error:'Request too large'},413);body=JSON.parse(raw);}catch{return json({error:'Invalid request'},400);}
  if(!validSubscription(body?.subscription))return json({error:'Invalid device push subscription. Try repairing notifications.'},400);
  const key='device-'+hash(body.subscription.endpoint),data=store();
  try{
    const prior=await data.get(key,{type:'json'}),owner=Boolean(prior&&authorized(body.manageToken,prior.manageHash));
    if(body.action==='verify')return json({enrolled:owner});
    if(body.action==='save'){
      const reminder=safeReminder(body.reminder);
      if(!reminder)return json({error:'Log a period and choose valid reminder settings first.'},400);
      if(prior&&!owner&&!sameEndpointAndKeys(prior.subscription,body.subscription))return json({error:'This subscription belongs to another device record. Repair notifications.',code:'REPAIR'},409);
      const manageToken=owner?body.manageToken:newToken();
      await data.setJSON(key,{subscription:body.subscription,manageHash:hash(manageToken),reminder,lastSentKey:prior?.lastSentKey||'',lastTestAt:prior?.lastTestAt||0,updatedAt:Date.now()});
      return json({ok:true,manageToken});
    }
    if(!owner)return json({error:'Subscription needs repair. Disable, then enable notifications again.',code:'REPAIR'},403);
    if(body.action==='disable'){await data.delete(key);return json({ok:true});}
    if(body.action==='test'){
      if(Date.now()-(prior.lastTestAt||0)<60000)return json({error:'Wait one minute between test notifications.'},429);
      try{
        webpush.setVapidDetails(config.subject,config.publicKey,config.privateKey);
        await webpush.sendNotification(prior.subscription,JSON.stringify({title:'Pretty Girl · Test notification',body:'Your private reminders are connected.',tag:'pretty-girl-test',url:'/'}),{TTL:120,urgency:'normal'});
      }catch(e){console.error('Pretty Girl test delivery:',e.statusCode||'local',String(e.message||'').slice(0,220));if([404,410].includes(e.statusCode)){await data.delete(key);return json({error:'Device subscription expired. Enable notifications again.',code:'REPAIR'},410);}if([401,403].includes(e.statusCode))return json({error:'Push provider rejected credentials. Confirm Netlify VAPID keys have not changed.'},502);return json({error:'Push provider could not accept the test. See Netlify function logs.'},502);}
      await data.setJSON(key,{...prior,lastTestAt:Date.now()});return json({ok:true,accepted:true});
    }
    return json({error:'Unsupported action'},400);
  }catch(e){console.error('Pretty Girl subscription storage:',String(e.message||'').slice(0,220));return json({error:'Notification storage temporarily unavailable. Check Netlify function logs.'},503);}
}
