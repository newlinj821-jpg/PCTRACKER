import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { configuration,dueNotification } from '../lib/reminder-core.mjs';

// Netlify calls this automatically every hour on the published production deploy.
export const config={schedule:'@hourly'};
export default async function handler(){
  const vapid=configuration();if(!vapid.ready){console.error('Pretty Girl push keys not configured');return;}
  webpush.setVapidDetails(vapid.subject,vapid.publicKey,vapid.privateKey);
  const store=getStore('pretty-girl-push-subscriptions');
  let scanned=0,sent=0,errors=0;
  for await(const page of store.list({paginate:true})){
    for(let i=0;i<page.blobs.length&&scanned<100;i+=4){
      const batch=page.blobs.slice(i,i+Math.min(4,100-scanned));
      await Promise.allSettled(batch.map(async({key})=>{
        if(!key.startsWith('device-'))return;
        try{
          const record=await store.get(key,{type:'json'});if(!record?.subscription?.endpoint||!record.reminder)return;
          const due=dueNotification(record.reminder,new Date(),record.lastSentKey||'');
          if(!due.send){if(due.nextDate!==record.reminder.nextDate)await store.setJSON(key,{...record,reminder:{...record.reminder,nextDate:due.nextDate}});return;}
          await webpush.sendNotification(record.subscription,JSON.stringify(due.payload),{TTL:6*3600,urgency:'normal'});
          // Save only after provider accepts the message. A subsequent failure may cause a duplicate.
          await store.setJSON(key,{...record,lastSentKey:due.key,reminder:{...record.reminder,nextDate:due.nextDate},lastDeliveredAt:Date.now()});sent++;
        }catch(e){errors++;if([404,410].includes(e.statusCode)){await store.delete(key);return;}console.error('Pretty Girl reminder failure',e.statusCode||String(e.message||'').slice(0,120));}
      }));scanned+=batch.length;
    }
    if(scanned>=100)break;
  }
  console.log(`Pretty Girl reminders: scanned=${scanned}, accepted=${sent}, errors=${errors}`);
}
