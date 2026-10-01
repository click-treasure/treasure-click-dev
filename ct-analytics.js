// CLICK TREASURE Analytics v1
// Shared GA4 event helper. Never sends email, nickname, Supabase user id, or prize balance.
(function(){
  const MID='G-S7C8F83L5W';
  const SURL='https://osawhwcddovhddrxgfju.supabase.co';
  const SKEY='sb_publishable_AMGEh3TguYyEpd7piWIjTQ_oHlYdG8f';
  let role='unknown';
  let ready=false;
  const queue=[];

  function ensureGA(){
    window.dataLayer=window.dataLayer||[];
    window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};
    if(!document.querySelector('script[src*="googletagmanager.com/gtag/js?id='+MID+'"]')){
      const s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+MID;document.head.appendChild(s);
      window.gtag('js',new Date());window.gtag('config',MID);
    }
  }
  function clean(v){return v===undefined?undefined:v}
  function send(name,params){
    ensureGA();
    const payload=Object.assign({user_role:role,is_admin:role==='admin'?'yes':'no'},params||{});
    Object.keys(payload).forEach(k=>payload[k]=clean(payload[k]));
    window.gtag('event',name,payload);
  }
  window.ctAnalytics={
    event(name,params){if(ready)send(name,params);else queue.push([name,params]);},
    getRole(){return role;},
    async identify(){
      ensureGA();
      const token=localStorage.getItem('v261_access_token')||'';
      const raw=localStorage.getItem('v261_user');
      let u=null;try{u=raw?JSON.parse(raw):null}catch(_e){}
      role=u?.is_anonymous===false?'user':'guest';
      if(token){
        try{
          const r=await fetch(SURL+'/rest/v1/rpc/is_app_admin',{method:'POST',headers:{apikey:SKEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});
          if(r.ok){const x=await r.json();const yes=x===true||x==='true'||(Array.isArray(x)&&x.some(v=>v===true||v?.is_app_admin===true));if(yes)role='admin';}
        }catch(_e){}
      }
      window.gtag('set','user_properties',{ct_user_role:role});
      ready=true;
      while(queue.length){const x=queue.shift();send(x[0],x[1]);}
      send('ct_session_ready',{page_type:document.body?.classList.contains('golden-page')?'golden_island':location.pathname.endsWith('/island.html')?'island':'home'});
      return role;
    }
  };
  ensureGA();
  window.addEventListener('load',()=>setTimeout(()=>window.ctAnalytics.identify(),250));
})();
