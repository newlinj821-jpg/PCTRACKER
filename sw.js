const CACHE='pretty-girl-v3-push';
const STATIC=['/','/index.html','/app.js','/push-ui.js','/manifest.webmanifest','/icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||url.pathname.startsWith('/.netlify/'))return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;}).catch(()=>caches.match(event.request).then(r=>r||caches.match('/'))));
});
self.addEventListener('push',event=>{
  let data={title:'Pretty Girl · Private reminder',body:'Open Pretty Girl for your check-in.',url:'/'};
  try{if(event.data)data={...data,...event.data.json()};}catch{}
  event.waitUntil(self.registration.showNotification(String(data.title||'Pretty Girl'),{body:String(data.body||'You have a reminder.'),icon:'/icon.svg',badge:'/icon.svg',tag:String(data.tag||'pretty-girl'),data:{url:'/'}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async list=>{
    const active=list.find(c=>new URL(c.url).origin===self.location.origin);
    if(active){await active.focus();return;}
    return clients.openWindow('/');
  }));
});
