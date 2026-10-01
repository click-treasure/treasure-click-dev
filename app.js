
// V88-70 shared sound settings
const CT_BGM_VOLUME_KEY="ct_bgm_volume";
const CT_SE_VOLUME_KEY="ct_se_volume";
function ctGetBgmVolume(){const r=localStorage.getItem(CT_BGM_VOLUME_KEY);if(r===null)return .15;const v=Number(r);return Number.isFinite(v)?Math.max(0,Math.min(100,v))/100:.15}
function ctGetSeVolume(){const r=localStorage.getItem(CT_SE_VOLUME_KEY);if(r===null)return 1;const v=Number(r);return Number.isFinite(v)?Math.max(0,Math.min(100,v))/100:1}
function ctApplyMediaSeVolume(){document.querySelectorAll('audio:not([data-ct-bgm])').forEach(a=>a.volume=ctGetSeVolume())}



// V44: dedicated 500-yen sound files.
function v44Play500Sound(name,volume=1){
  try{
    const a=new Audio(`sounds/${name}?v=45soundfix`);
    a.volume=volume*ctGetSeVolume();
    const q=a.play(); if(q&&q.catch)q.catch(()=>{});
  }catch(_){}
}

// V41: 500-yen special "puchun -> blackout -> jackpot" sequence.
function v41Jackpot500(){
 const root=document.getElementById("v41Jackpot"),coins=document.getElementById("v41Coins");
 if(!root)return;
 root.hidden=false;
 root.classList.remove("v42-cut","v42-dot","reveal","finish");
 void root.offsetWidth;

 // Short bright pre-flash. Then an abrupt "puchun" and a one-frame cut to black.
 setTimeout(()=>{
   v44Play500Sound("win_500_puchun.wav",.95);
   try{
     const c=v36ctx();
     if(c){
       const t=c.currentTime,o=c.createOscillator(),g=c.createGain();
       o.type="square";
       o.frequency.setValueAtTime(1050,t);
       o.frequency.exponentialRampToValueAtTime(72,t+.075);
       g.gain.setValueAtTime(.16,t);
       g.gain.exponentialRampToValueAtTime(.001,t+.085);
       o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+.09);
     }
   }catch(_){}
   root.classList.add("v42-cut");
 },120);

 // Stay completely black and visually silent, then reveal a tiny gold point.
 setTimeout(()=>root.classList.add("v42-dot"),1820);

 // Jackpot explosion.
 setTimeout(()=>{
   v44Play500Sound("win_500_jackpot.wav",1);
   root.classList.add("reveal");
   if(coins){
     coins.innerHTML="";
     for(let i=0;i<42;i++){
       const s=document.createElement("i");
       s.textContent=i%6===0?"◆":"●";
       s.style.setProperty("--x",(Math.random()*190-95)+"vw");
       s.style.setProperty("--d",(Math.random()*.65)+"s");
       s.style.setProperty("--r",(Math.random()*900-450)+"deg");
       coins.appendChild(s);
     }
   }
 },2420);

 setTimeout(()=>root.classList.add("finish"),5200);
 setTimeout(()=>{
   root.hidden=true;
   root.classList.remove("v42-cut","v42-dot","reveal","finish");
 },5750);
}

const URL="https://osawhwcddovhddrxgfju.supabase.co", KEY="sb_publishable_AMGEh3TguYyEpd7piWIjTQ_oHlYdG8f";
const $=id=>document.getElementById(id);
const POINTS_PER_YEN=10;
function points(n){return Number(n||0)*POINTS_PER_YEN}
function pointText(n){return points(n).toLocaleString("ja-JP")+"P"}
const META={
 easy:{name:"EASY",emoji:"🟢",hit:"★★★★★",high:"★☆☆☆☆"},
 normal:{name:"NORMAL",emoji:"🟡",hit:"★★★☆☆",high:"★★★☆☆"},
 hard:{name:"HARD",emoji:"🔴",hit:"★☆☆☆☆",high:"★★★★★"}
};
let accessToken=localStorage.getItem("v261_access_token")||"";
let refreshToken=localStorage.getItem("v261_refresh_token")||"";
let user=JSON.parse(localStorage.getItem("v261_user")||"null");
let latest={},cells=[],serverEnergy=0,nextSeconds=0,currentIsland=null,currentMeta=null,mapTimer=null,countTimer=null;
let debugNumbers=false,lastOpened=new Set(),syncBusy=false;
let myOwnOpenedCells=new Set();
let suppressLiveNoticeUntil=0;

function fail(e){$("error").hidden=false;$("error").textContent="エラー: "+(e?.message||e);}
async function req(path,options={},auth=true){
 const headers=Object.assign({"apikey":KEY,"Content-Type":"application/json"},options.headers||{});
 if(auth&&accessToken)headers.Authorization="Bearer "+accessToken;
 const r=await fetch(URL+path,Object.assign({},options,{headers}));
 const txt=await r.text();let data=null;try{data=txt?JSON.parse(txt):null}catch{data=txt}
 if(!r.ok)throw new Error((data&&data.message)||(data&&data.msg)||(data&&data.error_description)||txt||("HTTP "+r.status));
 return data;
}
async function auth(){
 try{
  if(accessToken){try{user=await req("/auth/v1/user");}catch{accessToken="";user=null}}
  if(!accessToken){
   $("session").textContent="匿名ログイン中…";
   const d=await req("/auth/v1/signup",{method:"POST",body:JSON.stringify({data:{source:"treasure-v30"}})},false);
   accessToken=d.access_token;refreshToken=d.refresh_token;user=d.user;
   localStorage.setItem("v261_access_token",accessToken);localStorage.setItem("v261_refresh_token",refreshToken);localStorage.setItem("v261_user",JSON.stringify(user));
  }
  // Dedicated Golden Island page only needs authentication + ticket state.
  // Do not touch homepage-only DOM nodes there.
  if(document.body.classList.contains("golden-page")){
    await loadGoldenTickets();
    paintGoldenTicketUI();
    return;
  }
  $("player").textContent="ゲスト "+user.id.slice(0,8);$("session").textContent="認証済み";
  await loadGoldenTickets();
  await Promise.all([status(),loadWinHistory(),loadLatest(),loadLoginBonus(),loadDailyMissions()]);
  await refreshHeaderNicknameV8852();
 }catch(e){
   console.error("auth:",e);
   if($("error"))fail(e);
   if($("session"))$("session").textContent="認証エラー";
 }
}
let bonusTaps=0;
let loginBonusState=null;

async function loadLoginBonus(){
 try{
  const d=await req("/rest/v1/rpc/get_login_bonus_status",{method:"POST",body:"{}"});
  const x=Array.isArray(d)?d[0]:d;if(!x)return;
  loginBonusState=x;bonusTaps=Number(x.bonus_taps||0);
  paintLoginBonus();paintEnergy();
 }catch(e){console.error("login bonus status:",e)}
}
function paintLoginBonus(){
 const box=$("loginBonus"), text=$("loginBonusText"), reward=$("loginBonusReward"), btn=$("loginBonusClaim"), streak=$("loginStreak");
 if(!box||!loginBonusState)return;
 const x=loginBonusState;
 reward.textContent=x.claimed_today?`✓ 今日 +${({1:5,2:5,3:7,4:7,5:10,6:10,7:20}[Number(x.streak)]||0)}回 受取済み`:`+${x.today_reward}回`;
 text.textContent=x.claimed_today?(bonusTaps>0?`受け取り済み ・ 上限超過分 +${bonusTaps}回`:`受け取り済み ・ 今日のボーナスを反映しました`):`${x.next_day}日目 ・ 受け取ると宝探し +${x.today_reward}回`;
 btn.disabled=!!x.claimed_today;btn.textContent=x.claimed_today?"✓ 受取済み":"受け取る";
 if(streak)[...streak.children].forEach((el,i)=>{el.classList.toggle("done",i<Number(x.streak||0));el.classList.toggle("next",!x.claimed_today&&i===Number(x.next_day||1)-1)});
}
function soundLoginBonus(){
 try{
  unlockGameAudio();
  v36tone(523,.08,"sine",.10,0);
  v36tone(659,.10,"sine",.11,.07);
  v36tone(784,.13,"triangle",.12,.14);
  v36tone(1047,.20,"sine",.10,.23);
 }catch(e){}
}
function animateLoginBonusGain(amount){
 const card=$("loginBonus"), energyCard=document.querySelector(".energy-card"), energy=$("energy");
 if(!card||!energyCard)return;
 card.classList.remove("login-bonus-claimed-pop");energyCard.classList.remove("energy-bonus-pop");
 void card.offsetWidth;card.classList.add("login-bonus-claimed-pop");
 const badge=document.createElement("div");badge.className="login-bonus-get-float";badge.textContent=`🎉 +${amount}回 GET！`;card.appendChild(badge);
 setTimeout(()=>{energyCard.classList.add("energy-bonus-pop");if(energy){energy.classList.remove("energy-number-pop");void energy.offsetWidth;energy.classList.add("energy-number-pop")}},360);
 setTimeout(()=>{badge.remove();card.classList.remove("login-bonus-claimed-pop");energyCard.classList.remove("energy-bonus-pop");energy?.classList.remove("energy-number-pop")},1700);
}
async function claimLoginBonus(){
 const btn=$("loginBonusClaim");if(!btn||btn.disabled)return;
 btn.disabled=true;btn.textContent="受け取り中…";
 try{
  const d=await req("/rest/v1/rpc/claim_daily_login_bonus",{method:"POST",body:"{}"});
  const x=Array.isArray(d)?d[0]:d;if(!x)return;
  if(x.success){soundLoginBonus();ctAnalytics?.event("login_bonus_claim",{reward_taps:Number(x.reward||0)});}
  await loadLoginBonus();
  if(x.success){animateLoginBonusGain(Number(x.reward||0));}
  $("message").textContent=x.success?`🎁 ログインボーナス +${x.reward}回GET！`:"今日のログインボーナスは受け取り済み";
 }catch(e){fail(e);await loadLoginBonus()}
}


// V58 — daily missions
let dailyMissionState=null;
const DAILY_MISSIONS=[
 {id:"mission_5",icon:"🎁",title:"宝箱を5回開ける",reward:2,target:5,kind:"digs",complete:"mission_5_complete",claim:"mission_5_claimed"},
 {id:"mission_islands",icon:"🗺️",title:"2種類の島を探索する",reward:3,target:2,kind:"islands_used",complete:"mission_islands_complete",claim:"mission_islands_claimed"},
 {id:"mission_15",icon:"🎯",title:"宝箱を15回開ける",reward:5,target:15,kind:"digs",complete:"mission_15_complete",claim:"mission_15_claimed"}
];
async function loadDailyMissions(){
 try{
  const d=await req("/rest/v1/rpc/get_daily_mission_status",{method:"POST",body:"{}"});
  dailyMissionState=Array.isArray(d)?d[0]:d;paintDailyMissions();
 }catch(e){console.error("daily missions:",e)}
}
function paintDailyMissions(){
 const list=$("dailyMissionList"), summary=$("dailyMissionSummary"), allBtn=$("dailyAllClaim");
 if(!list||!dailyMissionState)return;
 const x=dailyMissionState;
 let cleared=0;
 list.innerHTML=DAILY_MISSIONS.map(m=>{
  const value=Math.min(m.target,Number(x[m.kind]||0));const ready=!!x[m.complete]||value>=m.target;const claimed=!!x[m.claim];if(claimed)cleared++;
  const label=claimed?"✓ 受取済み":ready?`+${m.reward}回 受取`:`${value}/${m.target}`;
  return `<div class="daily-mission-row ${claimed?'done':''}"><span class="daily-mission-icon">${m.icon}</span><div class="daily-mission-copy"><b>${m.title}</b><small>${value}/${m.target} ・ 報酬 +${m.reward}回</small><div class="daily-mission-progress"><i style="width:${Math.round(value/m.target*100)}%"></i></div></div><button type="button" data-mission="${m.id}" class="${ready&&!claimed?'ready':''}" ${ready&&!claimed?'':'disabled'}>${label}</button></div>`;
 }).join("");
 summary.textContent=`${cleared} / 3`;
 const allReady=!!x.all_clear_complete;
 allBtn.disabled=!allReady||!!x.all_clear_claimed;allBtn.classList.toggle("ready",allReady&&!x.all_clear_claimed);allBtn.textContent=x.all_clear_claimed?"✓ 受取済み":allReady?"+5回 受取":"未達成";
 allBtn.closest('.daily-all-clear')?.classList.toggle('claimed',!!x.all_clear_claimed);
}
async function claimDailyMission(id){
 try{
  const d=await req("/rest/v1/rpc/claim_daily_mission",{method:"POST",body:JSON.stringify({p_mission:id})});const x=Array.isArray(d)?d[0]:d;
  if(x?.success){soundLoginBonus();ctAnalytics?.event("mission_claim",{mission_id:id,reward_taps:Number(x.reward||0)});animateLoginBonusGain(Number(x.reward||0));await Promise.all([status(),loadLoginBonus(),loadDailyMissions()]);$("message").textContent=`🎯 ミッション報酬 +${x.reward}回GET！`;}
  else await loadDailyMissions();
 }catch(e){fail(e);await loadDailyMissions()}
}
document.getElementById("dailyMissionList")?.addEventListener("click",e=>{const b=e.target.closest("button[data-mission]");if(b&&!b.disabled)claimDailyMission(b.dataset.mission)});
document.getElementById("dailyAllClaim")?.addEventListener("click",e=>{if(!e.currentTarget.disabled)claimDailyMission("all_clear")});

async function status(){
 const d=await req("/rest/v1/rpc/get_player_status",{method:"POST",body:"{}"});
 const x=Array.isArray(d)?d[0]:d;if(!x)return;
 $("wallet").textContent=pointText(x.balance);serverEnergy=x.energy;nextSeconds=x.next_energy_seconds||0;paintEnergy();
}
function paintEnergy(){
 const total=Number(serverEnergy||0)+Number(bonusTaps||0);
 const mm=String(Math.floor(Math.max(0,nextSeconds)/60)).padStart(2,"0");
 const ss=String(Math.max(0,nextSeconds%60)).padStart(2,"0");
 $("energy").textContent=serverEnergy+" / 20";
 if(serverEnergy>=20){
  $("energyTimer").textContent=bonusTaps>0?`FULL ・ ボーナス +${bonusTaps}`:"FULL";
 }else{
  $("energyTimer").textContent=`次の回復 ${mm}:${ss}`;
 }
 if(cells.length)render();
}
function startCountdown(){
 if(countTimer)clearInterval(countTimer);
 countTimer=setInterval(async()=>{
  if(serverEnergy<20&&nextSeconds>0){nextSeconds--;paintEnergy();}
  if(serverEnergy<20&&nextSeconds<=0){try{await status()}catch(e){fail(e)}}
 },1000);
}
// V86 — SECRET Golden Island
let goldenTickets=0;
let goldenDigBusy=false;
async function loadGoldenTickets(){
 try{
  if(!user?.id)return;
  const d=await req("/rest/v1/golden_ticket_wallets?user_id=eq."+encodeURIComponent(user.id)+"&select=tickets,total_found,total_used");
  goldenTickets=Number(Array.isArray(d)&&d[0]?d[0].tickets:0);
  paintGoldenTicketUI();
 }catch(e){console.error("golden tickets:",e)}
}
function paintGoldenTicketUI(){
 const card=$("goldenIslandCard"),badge=$("goldenTicketBadge"),inside=$("goldenTicketsInGame");
 if(badge)badge.textContent=`GOLDEN TICKET　${goldenTickets}枚`;
 if(inside)inside.textContent=goldenTickets;
 if(card){
  const unlocked=goldenTickets>0;
  card.classList.toggle("locked",!unlocked);
  card.classList.toggle("unlocked",unlocked);
  card.classList.toggle("golden-locked",!unlocked);
  card.classList.toggle("golden-unlocked",unlocked);
  const level=card.querySelector(".island-level");
  if(level)level.innerHTML=`${unlocked?"✨ SECRET OPEN":"🔒 SECRET"} <small>${unlocked?"UNLOCKED":"LOCKED"}</small>`;
  const cta=card.querySelector(".island-cta");
  if(cta)cta.innerHTML=`${unlocked?"黄金島へ行く":"チケットが必要です"} <strong>›</strong>`;
 }
}
function goldenTicketEffect(){
 const d=document.createElement("div");d.className="golden-ticket-overlay";
 d.innerHTML='<div class="golden-ticket-shine">✦</div><small>SECRET TICKET</small><strong>🎫 GOLDEN TICKET</strong><b>黄金島の採掘権を発見！</b>';
 document.body.appendChild(d);setTimeout(()=>d.classList.add("show"),20);setTimeout(()=>d.remove(),2600);
 try{unlockGameAudio();v36tone(659,.10,"sine",.12,0);v36tone(880,.13,"triangle",.13,.10);v36tone(1175,.22,"sine",.12,.22)}catch(_){}
}
function renderGoldenMap(){
 const map=$("goldenMap");if(!map)return;map.innerHTML="";
 for(let i=0;i<50;i++){
  const b=document.createElement("button");b.type="button";b.className="golden-chest";b.setAttribute("aria-label",`黄金の宝箱 ${i+1}`);
  b.innerHTML=`<img src="./assets/golden-chest-closed-v88.webp" alt="">`;b.onclick=()=>digGoldenIsland(b);map.appendChild(b);
 }
}
function openGoldenIsland(){
 if(goldenTickets<=0){$("goldenTicketBadge").classList.remove("shake");void $("goldenTicketBadge").offsetWidth;$("goldenTicketBadge").classList.add("shake");return}
 $("islandSelect").hidden=true;$("game").hidden=true;$("goldenGame").hidden=false;$("goldenMessage").textContent="✨ 50個から黄金の宝箱を1つ選ぼう";renderGoldenMap();paintGoldenTicketUI();
}
async function digGoldenIsland(button){
 if(goldenDigBusy||goldenTickets<=0)return;goldenDigBusy=true;
 document.querySelectorAll(".golden-chest").forEach(b=>b.disabled=true);button.classList.add("chosen");$("goldenMessage").textContent="🔑 黄金の宝箱を開封中…";
 try{
  const d=await req("/rest/v1/rpc/dig_golden_island",{method:"POST",body:"{}"});const x=Array.isArray(d)?d[0]:d;
  if(!x?.success){
   if(x?.result==="no_ticket"){$("goldenMessage").textContent="🎫 黄金島チケットがありません";}
   else if(x?.result==="golden_budget_exhausted"){$("goldenMessage").textContent="🏝️ 黄金島は現在準備中です";}
   else $("goldenMessage").textContent="開封できませんでした";
   await loadGoldenTickets();renderGoldenMap();return;
  }
  goldenTickets=Number(x.tickets_left||0);paintGoldenTicketUI();
  const pp=Number(x.prize_points||0);button.classList.add("opened-gold");button.innerHTML=`<img src="./assets/golden-chest-open-v88.webp" alt=""><strong>${pp.toLocaleString("ja-JP")}P</strong>`;
  $("wallet").textContent=pointText(x.new_balance);$("goldenMessage").textContent=`🎉 ${pp.toLocaleString("ja-JP")}P GET！`;
  const ov=document.createElement("div");ov.className="golden-win-overlay"+(pp>=1000?" ultra":pp>=500?" rare":"");ov.innerHTML=`<small>GOLDEN TREASURE</small><strong>${pp.toLocaleString("ja-JP")}P</strong><b>GET!</b>`;document.body.appendChild(ov);setTimeout(()=>ov.remove(),2200);
  setTimeout(()=>{if(!$("goldenGame").hidden){renderGoldenMap();$("goldenMessage").textContent=goldenTickets>0?"🎫 次のチケットで挑戦できます":"🎫 チケットを探しに通常島へ戻ろう"}},2300);
  await Promise.all([status(),loadGoldenTickets()]);
 }catch(e){fail(e);renderGoldenMap()}
 finally{goldenDigBusy=false}
}
document.getElementById("goldenIslandCard")?.addEventListener("click",()=>{if(goldenTickets>0)location.href="./golden-island.html";});
document.getElementById("goldenBack")?.addEventListener("click",()=>{$("goldenGame").hidden=true;$("islandSelect").hidden=false;});

async function loadLatest(){
 const d=await req("/rest/v1/rpc/get_latest_islands",{method:"POST",body:"{}"});
 latest={};(d||[]).forEach(x=>latest[x.difficulty]=x);renderCards();
}
function renderCards(){
 const box=$("islandCards");box.innerHTML="";
 ["easy","normal","hard"].forEach(diff=>{
  const x=latest[diff],m=META[diff];if(!x)return;
  const b=document.createElement("button");b.className="island-card "+diff;
  if(x.island_status==="finished"){b.disabled=true;b.classList.add("finished")}
  b.innerHTML=`<div class="island-art" aria-hidden="true"><i></i><i></i><i></i></div><span class="island-level">${m.name} <small>#${x.generation}</small></span><b>${x.total_cells}<small>マス</small></b><div class="island-ratings"><div><span>当たりやすさ</span><strong>${m.hit}</strong></div><div><span>高額報酬期待度</span><strong>${m.high}</strong></div></div><em class="status-badge">${x.island_status==="finished"?"探索終了":"残り "+x.remaining_cells+"マス"}</em><i class="island-cta">この島で遊ぶ <strong>›</strong></i>`;
  b.onclick=()=>{
   ctAnalytics?.event("island_select",{difficulty:diff,generation:Number(x.generation||0)});window.location.href=`island.html?difficulty=${encodeURIComponent(diff)}&generation=${encodeURIComponent(x.generation)}&v=88-32`;
  };box.appendChild(b);
 });
 const g=document.createElement("button");g.id="goldenIslandCard";g.type="button";g.className="island-card golden "+(goldenTickets>0?"unlocked golden-unlocked":"locked golden-locked");
 g.innerHTML=`<div class="island-art golden-art" aria-hidden="true"><i></i><i></i><i></i></div><span class="island-level">${goldenTickets>0?"SECRET OPEN":"SECRET"} <small>${goldenTickets>0?"UNLOCKED":"LOCKED"}</small></span><b>黄金島</b><small class="island-desc">100P以上確定・高額報酬のチャンス</small><em id="goldenTicketBadge" class="status-badge">GOLDEN TICKET　${goldenTickets}枚</em><i class="island-cta">${goldenTickets>0?"黄金島へ行く":"チケットが必要です"} <strong>›</strong></i>`;
 g.onclick=()=>{if(goldenTickets>0){ctAnalytics?.event("golden_island_select",{tickets:goldenTickets});location.href="./golden-island.html";}};box.appendChild(g);
}
async function loadWinHistory(){
 const uid=encodeURIComponent(user.id);
 const [d,allWins]=await Promise.all([
  req("/rest/v1/treasure_wins?user_id=eq."+uid+"&select=prize,cell_index,island_id,won_at&order=won_at.desc&limit=10"),
  req("/rest/v1/treasure_wins?user_id=eq."+uid+"&select=id")
 ]);
 $("wins").textContent=(Array.isArray(allWins)?allWins.length:0)+"回";
 $("history").innerHTML=d?.length?d.map(x=>`<div class="row"><span>${x.island_id}・マス ${x.cell_index}</span><strong>+${pointText(x.prize)}</strong></div>`).join(""):"まだ獲得履歴はありません";
}
async function openIsland(x){
 if(x.island_status!=="active")return;
 currentIsland=x.island_id;currentMeta=x;cells=[];lastOpened=new Set();
 $("islandSelect").hidden=true;$("game").hidden=false;
 $("islandName").textContent=`${META[x.difficulty].emoji} ${META[x.difficulty].name} #${x.generation}`;
 $("islandState").textContent="🟢 探索中";$("islandState").classList.remove("finished");
 $("message").textContent="宝箱を準備中…";
 await Promise.all([load(),status()]);
 if(mapTimer)clearInterval(mapTimer);mapTimer=setInterval(()=>load(true),1000);
}
async function load(silent=false){
 if(!currentIsland||syncBusy)return;
 syncBusy=true;
 try{
  const d=await req("/rest/v1/treasure_cells?island_id=eq."+encodeURIComponent(currentIsland)+"&select=id,cell_index,opened,opened_at&order=cell_index.asc");
  const next=d||[];
  const allNewlyOpened=next.filter(c=>c.opened&&!lastOpened.has(c.cell_index)).map(c=>c.cell_index);
   const newlyOpened=(Date.now()<suppressLiveNoticeUntil)?[]:allNewlyOpened.filter(idx=>!myOwnOpenedCells.has(idx));
   for(const idx of allNewlyOpened)myOwnOpenedCells.delete(idx);
  cells=next;
  lastOpened=new Set(cells.filter(c=>c.opened).map(c=>c.cell_index));
  render();
  if(!silent)$("message").textContent="🟢 LIVE：ほかのプレイヤーの開封も自動反映";
  else if(newlyOpened.length&&currentIsland){
    $("message").textContent=`👥 ほかのプレイヤーが ${newlyOpened.length} 箱開けた！`;
  }
 }catch(e){fail(e)}
 finally{syncBusy=false}
}
function render(){
 if(!currentMeta)return;$("map").innerHTML="";
 for(const c of cells){
  const b=document.createElement("button");b.className="cell chest"+(c.opened?" opened":"");b.disabled=c.opened||serverEnergy<=0;b.title="宝箱 "+c.cell_index;
   b.innerHTML=`<img src="assets/${c.opened?"chest_empty.png":"chest_closed.png"}" alt="${c.opened?"開封済み":"未開封"}">${debugNumbers?`<small class="chest-no">${c.cell_index}</small>`:""}`;
   b.onclick=()=>dig(c.cell_index,b);$("map").appendChild(b);
 }
 const total=currentMeta.total_cells,o=cells.filter(c=>c.opened).length;
 $("remaining").textContent=`残り ${Math.max(0,total-o)}箱`;$("progress").textContent=Math.round((o/total)*100)+"%";
}


// V36.1 sound effects (Web Audio API; no external audio files)
let v36AudioCtx=null;
function v36ctx(){
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return null;
  if(!v36AudioCtx)v36AudioCtx=new AC();
  return v36AudioCtx;
}
function unlockGameAudio(){
  const c=v36ctx(); if(!c)return;
  if(c.state==="suspended")c.resume().catch(()=>{});
}
function v36tone(freq,duration,type="sine",gain=.09,delay=0){
  const c=v36ctx(); if(!c)return;
  if(c.state==="suspended")c.resume().catch(()=>{});
  const o=c.createOscillator(), g=c.createGain();
  o.type=type;o.frequency.value=freq;
  const t=c.currentTime+delay;
  g.gain.setValueAtTime(.0001,t);
  g.gain.exponentialRampToValueAtTime(gain,t+.012);
  g.gain.exponentialRampToValueAtTime(.0001,t+duration);
  o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+duration+.03);
}
function soundDig(){
  const c=v36ctx(); if(!c)return;
  if(c.state==="suspended")c.resume().catch(()=>{});
  // short earthy "zaku" noise
  const n=Math.floor(c.sampleRate*.11),buf=c.createBuffer(1,n,c.sampleRate),d=buf.getChannelData(0);
  for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n);
  const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();
  f.type="lowpass";f.frequency.value=900;g.gain.value=.16;
  s.buffer=buf;s.connect(f);f.connect(g);g.connect(c.destination);s.start();
  v36tone(135,.10,"triangle",.08,.01);
}
function soundMiss(){
  v36tone(170,.12,"triangle",.07,0);
  v36tone(120,.16,"triangle",.05,.08);
}
function soundHit(){
  v36tone(660,.13,"sine",.09,0);
  v36tone(880,.16,"sine",.10,.10);
  v36tone(1320,.22,"sine",.08,.20);
}


function burstConfetti(count=30){
 const layer=document.createElement("div");layer.className="win-confetti-layer";
 for(let n=0;n<count;n++){const s=document.createElement("i");s.style.left=(Math.random()*100)+"vw";s.style.setProperty("--dx",((Math.random()-.5)*320)+"px");layer.appendChild(s)}
 document.body.appendChild(layer);setTimeout(()=>layer.remove(),1700);
}
function prizeOverlay(prize){
 const d=document.createElement("div");
 d.className="prize-overlay "+(prize>=100?"prize-tier-mega":prize>=10?"prize-tier-big":"prize-tier-small");
 d.innerHTML=prize>=100?`<div class="prize-kicker">JACKPOT!</div><div class="prize-main">${pointText(prize)}！！！</div>`:
             prize>=10?`<div class="prize-kicker">当たり！</div><div class="prize-main">${pointText(prize)}！！！</div>`:
             `<div class="prize-main">${pointText(prize)} GET!</div>`;
 document.body.appendChild(d);setTimeout(()=>d.remove(),prize>=10?1450:800);
}
function soundBigHit(){v36tone(392,.11,"triangle",.12,0);v36tone(659,.15,"sine",.13,.07);v36tone(988,.22,"sine",.12,.16);v36tone(1319,.30,"sine",.09,.25)}
function soundMegaHit(){v36tone(330,.14,"square",.09,0);v36tone(523,.18,"triangle",.12,.06);v36tone(784,.24,"sine",.14,.14);v36tone(1047,.32,"sine",.13,.23);v36tone(1568,.42,"sine",.10,.34)}

function playOriginal10Sound(){
 const a=document.getElementById("audio10old");
 if(!a)return;
 try{a.pause();a.currentTime=0;a.volume=1;const q=a.play();if(q&&q.catch)q.catch(()=>soundBigHit())}catch(e){soundBigHit()}
}
function playOriginal100Sound(){
 const a=document.getElementById("audio100old");
 if(!a)return;
 try{a.pause();a.currentTime=0;a.volume=1;const q=a.play();if(q&&q.catch)q.catch(()=>soundMegaHit())}catch(e){soundMegaHit()}
}
function originalCelebrate10(){
 const fx=document.getElementById("fx");if(!fx)return;
 for(let i=0;i<35;i++){
  const s=document.createElement("span");s.className="old-confetti";s.textContent=["✨","🎉","⭐"][i%3];
  s.style.left=Math.random()*100+"vw";s.style.animationDelay=Math.random()*.5+"s";s.style.fontSize=(16+Math.random()*25)+"px";
  fx.appendChild(s);setTimeout(()=>s.remove(),2500);
 }
 document.body.classList.add("win10");setTimeout(()=>document.body.classList.remove("win10"),1900);
}
function originalJackpot10(prize){
 const o=document.getElementById("jackpotOverlay");if(!o)return;
 document.getElementById("jackpotAmount").textContent=points(prize).toLocaleString("ja-JP");
 document.getElementById("jackpotLabel").textContent=prize>=100?"💎 超大当たり！！ 💎":"🔥 大当たり！！ 🔥";
 document.getElementById("jackpotBang").textContent=prize>=100?"！！！ JACKPOT ！！！":"！！！";
 o.classList.remove("show");void o.offsetWidth;o.classList.add("show");o.setAttribute("aria-hidden","false");
 if(prize>=100)playOriginal100Sound();else playOriginal10Sound();
 originalCelebrate10();
 setTimeout(()=>{o.classList.remove("show");o.setAttribute("aria-hidden","true")},2150);
}

// V43: 500-yen gemstone omen before the puchun blackout.
function v43GemOmen(button,after){
  const r=button?.getBoundingClientRect();
  const gem=document.createElement("div");
  gem.className="v43-gem-omen";
  gem.innerHTML='<span class="v43-gem">◆</span><i></i><b>！？</b>';
  if(r){gem.style.left=(r.left+r.width/2)+"px";gem.style.top=(r.top+r.height*.42)+"px";}
  else{gem.style.left="50vw";gem.style.top="50vh";}
  document.body.appendChild(gem);
  v44Play500Sound("win_500_gem.wav",.9);
  setTimeout(()=>gem.classList.add("charge"),180);
  setTimeout(()=>{gem.remove();if(after)after();},850);
}


// V56.2 — unmistakable wallet gain feedback. Visual only; no server writes.
function animateWalletGain(prize){
  const w=$("wallet");
  const card=w?.closest(".balance-card");
  if(!w||!card)return;

  w.classList.remove("wallet-pop","wallet-pop-big");
  card.classList.remove("wallet-gain-card","wallet-gain-card-big");
  void w.offsetWidth;
  w.classList.add(prize>=100?"wallet-pop-big":"wallet-pop");
  card.classList.add(prize>=100?"wallet-gain-card-big":"wallet-gain-card");

  card.querySelectorAll(".wallet-gain-float").forEach(el=>el.remove());
  const gain=document.createElement("span");
  gain.className="wallet-gain-float"+(prize>=100?" big":"");
  gain.textContent=`+${pointText(prize)}`;
  card.appendChild(gain);

  setTimeout(()=>{
    w.classList.remove("wallet-pop","wallet-pop-big");
    card.classList.remove("wallet-gain-card","wallet-gain-card-big");
  },1250);
  setTimeout(()=>gain.remove(),1450);
}

function playDigEffect(button,prize){
 if(!button)return;
 button.classList.remove("digging","dig-hit","dig-miss");void button.offsetWidth;button.classList.add("digging");
 setTimeout(()=>{
  button.classList.remove("digging");
  if(prize>0){
   button.classList.add("dig-hit");
   const chestImg=button.querySelector("img");
   if(chestImg){
     chestImg.classList.add("opening");
     const rewardSrc=prize>=500?"chest_500.png":prize>=100?"chest_100.png":prize>=10?"chest_10.png":prize>=1?"chest_1.png":"chest_empty.png";
     setTimeout(()=>{chestImg.src="assets/"+rewardSrc;chestImg.classList.remove("opening");chestImg.classList.add("revealed");},220);
   }
   if(prize>=500){v43GemOmen(button,()=>v41Jackpot500());}
   else if(prize<10)prizeOverlay(prize);
   if(prize>=10&&prize<500){
     const currentOverlay=document.querySelector(".prize-overlay");if(currentOverlay)currentOverlay.remove();
     originalJackpot10(prize);
   } else if(prize<500) soundHit();
  }else{
   button.classList.add("dig-miss");soundMiss();
   const f=document.createElement("span");f.className="dig-float miss";f.textContent="💨 ハズレ";button.appendChild(f);setTimeout(()=>f.remove(),900);
  }
 },260);
}

async function dig(i,b){
 suppressLiveNoticeUntil=Date.now()+4000;
 soundDig();
 if(serverEnergy<=0&&bonusTaps<=0){$("message").textContent="⚡ タップ回数切れ。回復を待とう";return}
 b.disabled=true;$("message").textContent="⛏️ サーバーで判定中…";
 try{
  const d=await req("/rest/v1/rpc/dig_treasure",{method:"POST",body:JSON.stringify({p_island_id:currentIsland,p_cell_index:i})});
  const x=Array.isArray(d)?d[0]:d;if(!x)return;
  serverEnergy=x.new_energy;paintEnergy();
  if(x.result==="no_energy"){$("message").textContent="⚡ エネルギー切れ";await status();return}
  if(x.result==="already_opened"){$("message").textContent="誰かに先を越された！エネルギー消費なし";await load(true);return}
  if(x.result==="island_finished"&&!x.success){$("message").textContent="🏁 この島は探索終了！";$("islandState").textContent="🏁 探索終了";$("islandState").classList.add("finished");await loadLatest();return}
  myOwnOpenedCells.add(i);
  $("wallet").textContent=pointText(x.new_balance);
  if(Number(x.prize||0)>0) animateWalletGain(Number(x.prize||0));
  b.classList.add("mine");playDigEffect(b,Number(x.prize||0));
  const gotGoldenTicket=x.result==="golden_ticket"||x.result==="island_finished_ticket";
  if(gotGoldenTicket){goldenTicketEffect();$("message").textContent="🎫 黄金島の採掘権を発見！";}
  else if(x.prize>0){$("message").textContent=`🎉 ${pointText(x.prize)} GET！`;$("amount").textContent=pointText(x.prize);setTimeout(()=>{$("overlay").hidden=false},520)}
  else $("message").textContent="💨 ハズレ！次のマスへ";
  if(x.result==="island_finished"||x.result==="island_finished_ticket"){$("islandState").textContent="🏁 探索終了";$("islandState").classList.add("finished");if(!gotGoldenTicket)$("message").textContent="🏁 最後の宝発見！この島の探索は終了！"}
  await Promise.all([load(true),loadWinHistory(),status(),loadLatest(),loadLoginBonus(),loadDailyMissions(),loadGoldenTickets()]);
 }catch(e){fail(e);b.disabled=false}
}
$("debugNumbers").onclick=()=>{debugNumbers=!debugNumbers;$("debugNumbers").textContent=debugNumbers?"🔢 番号表示 ON":"🔢 番号表示 OFF";$("map").classList.toggle("show-numbers",debugNumbers);render();};
$("back").onclick=async()=>{currentIsland=null;currentMeta=null;cells=[];lastOpened=new Set();myOwnOpenedCells=new Set();if(mapTimer){clearInterval(mapTimer);mapTimer=null};$("game").hidden=true;$("islandSelect").hidden=false;$("message").textContent="宝箱を選んでスタート！";await loadLatest()};
$("refresh").onclick=async()=>{try{await Promise.all([status(),loadWinHistory(),loadLatest(),currentIsland?load(true):Promise.resolve()])}catch(e){fail(e)}};
$("close").onclick=()=>{$("overlay").hidden=true;$("message").textContent="サーバー残高に保存済み！次の宝箱を選ぼう"};


// ===== V34 Safe guest -> existing/new Google migration =====
const MIGRATION_TOKEN_KEY = "treasure_migration_token_v34";
// V67: OAuth redirect follows the currently opened CLICK TREASURE URL.
// This prevents GitHub username / Pages URL changes from breaking Google login.
const OAUTH_REDIRECT = `${window.location.origin}${window.location.pathname}`;

function parseOAuthSession(){
  const raw = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  if(!raw) return false;

  const p = new URLSearchParams(raw);
  const at = p.get("access_token");
  const rt = p.get("refresh_token");
  const err = p.get("error_description") || p.get("error");

  window.history.replaceState(null, "", location.pathname + location.search);

  if(err){
    setTimeout(()=>fail(new Error(decodeURIComponent(err))), 0);
    return false;
  }
  if(!at) return false;

  localStorage.setItem("v261_access_token", at);
  if(rt) localStorage.setItem("v261_refresh_token", rt);
  return true;
}

function hasGoogleIdentity(u){
  if(!u) return false;
  if(Array.isArray(u.identities) && u.identities.some(x => x.provider === "google")) return true;
  const providers = u.app_metadata && u.app_metadata.providers;
  return Array.isArray(providers) && providers.includes("google");
}

function updateAccountUI(){
  const state = document.getElementById("accountState");
  const btn = document.getElementById("googleLoginBtn");
  if(!state || !btn) return;

  if(hasGoogleIdentity(user)){
    state.textContent = user.email ? `Google連携済み ✓：${user.email}` : "Google連携済み ✓";
    btn.textContent = "ログアウト";
    btn.disabled = false;
  }else{
    state.textContent = user ? `ゲストでプレイ中：${user.id.slice(0,8)}` : "ゲストでプレイ中";
    btn.textContent = "G Googleと連携";
    btn.disabled = false;
  }
}

async function rpc(name, body={}){
  return await req(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(body)
  });
}

async function logoutToNewGuest(){
  const btn = document.getElementById("googleLoginBtn");
  try{
    if(btn){
      btn.disabled = true;
      btn.textContent = "ログアウト中…";
    }

    // Revoke the current Supabase session on the server when possible.
    if(accessToken){
      try{
        await fetch(`${URL}/auth/v1/logout`, {
          method: "POST",
          headers: {
            "apikey": KEY,
            "Authorization": `Bearer ${accessToken}`
          }
        });
      }catch(_){}
    }

    // Clear only this app's auth/migration state.
    localStorage.removeItem("v261_access_token");
    localStorage.removeItem("v261_refresh_token");
    localStorage.removeItem("v261_user");
    localStorage.removeItem(MIGRATION_TOKEN_KEY);

    accessToken = "";
    user = null;

    // Reload: the existing auth() flow will create a fresh anonymous account.
    location.replace(location.pathname + "?guest=" + Date.now());
  }catch(e){
    if(btn){
      btn.disabled = false;
      btn.textContent = "ログアウト";
    }
    fail(e);
  }
}

async function beginGoogleMigration(){
  const btn = document.getElementById("googleLoginBtn");
  try{
    if(!accessToken || !user) throw new Error("認証準備中です。ページを再読み込みしてください。");
    if(hasGoogleIdentity(user)) return;

    if(btn){
      btn.disabled = true;
      btn.textContent = "Google連携準備中…";
    }

    // Server proves this ticket belongs to the currently authenticated anonymous user.
    const token = await rpc("create_account_migration_ticket");
    if(!token || typeof token !== "string"){
      throw new Error("Google連携の準備ができませんでした。");
    }
    localStorage.setItem(MIGRATION_TOKEN_KEY, token);

    // Existing Google accounts must be allowed to sign in, so use normal OAuth sign-in here.
    const q = new URLSearchParams({
      provider: "google",
      redirect_to: OAUTH_REDIRECT,
      skip_http_redirect: "true"
    });

    // OAuth is a browser navigation, not a CORS fetch.
    // Navigating to Supabase lets Supabase redirect the browser to Google normally.
    location.href = `${URL}/auth/v1/authorize?${q.toString()}`;
    return;
  }catch(e){
    if(btn){
      btn.disabled = false;
      btn.textContent = "G Googleと連携";
    }
    fail(e);
  }
}

async function finishPendingMigration(){
  const token = localStorage.getItem(MIGRATION_TOKEN_KEY);
  if(!token || !hasGoogleIdentity(user)) return false;

  try{
    const result = await rpc("migrate_guest_account", {p_token: token});
    localStorage.removeItem(MIGRATION_TOKEN_KEY);

    const row = Array.isArray(result) ? result[0] : result;
    const amount = row?.migrated_balance ?? 0;
    alert(`Google連携が完了しました！\n引き継いだポイント：${pointText(amount)}\n次回から同じGoogleで続きから遊べます。`);

    // Refresh wallet/status using the new Google identity.
    await status();
    await loadWinHistory();
    return true;
  }catch(e){
    const msg=String(e?.message||e||"");
    if(msg.includes("already been linked")){
      localStorage.removeItem(MIGRATION_TOKEN_KEY);
      await Promise.all([status(),loadWinHistory()]);
      // Already linked: silently keep the existing Google account data.
      return true;
    }
    // Keep the token so a temporary failure can be retried within its 10-minute lifetime.
    fail(e);
    return false;
  }
}

document.addEventListener("pointerdown", unlockGameAudio, {once:true});
document.addEventListener("keydown", unlockGameAudio, {once:true});
document.addEventListener("DOMContentLoaded", ()=>{
  parseOAuthSession();
  const b = document.getElementById("googleLoginBtn");
  if(b) b.addEventListener("click", async ()=>{
    if(hasGoogleIdentity(user)){
      await logoutToNewGuest();
    }else{
      await beginGoogleMigration();
    }
  });
});

const originalAuth = auth;
auth = async function(){
  await originalAuth();
  updateAccountUI();
  await finishPendingMigration();
  updateAccountUI();
};

// V34 start
auth().then(startCountdown);

// V37 home-only presentation helpers. Existing server/game logic remains unchanged.
(function(){
  function refreshRewardHome(){
    const wallet=document.getElementById('wallet'), fill=document.getElementById('redeemFill'), text=document.getElementById('redeemText');
    if(!wallet||!fill||!text)return;
    const n=Math.max(0,parseInt((wallet.textContent||'0').replace(/[^0-9-]/g,''),10)||0);
    const pct=Math.min(100,n/10);
    fill.style.width=pct+'%';
    text.textContent=n>=1000?'🔒 交換機能は正式リリース準備中です':`あと${(1000-n).toLocaleString('ja-JP')}Pで交換機能は準備中です`;
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const wallet=document.getElementById('wallet');
    if(wallet)new MutationObserver(refreshRewardHome).observe(wallet,{childList:true,subtree:true,characterData:true});
    refreshRewardHome();
  });
})();

// Developer-only visual prize tester. No Supabase writes.
(function(){
  const toggle=document.getElementById("devToggle");
  const box=document.getElementById("devButtons");
  if(!toggle||!box)return;
  toggle.addEventListener("click",()=>{box.hidden=!box.hidden;});
  box.querySelectorAll("[data-test-prize]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const prize=Number(btn.dataset.testPrize);
      try{
        if(prize===500){
          v43GemOmen(null,()=>v41Jackpot500());
        }else if(prize>=10){
          const currentOverlay=document.querySelector(".prize-overlay");
          if(currentOverlay)currentOverlay.remove();
          originalJackpot10(prize);
        }else{
          prizeOverlay(prize);
          soundHit();
        }
      }catch(e){
        console.error("Prize test failed:",e);
        alert("演出テストでエラーが出ました。Consoleを確認してください。");
      }
    });
  });
})();

// V62 — cash redemption requires a permanent Google-linked account.
function requireGoogleForRedemption(){
  return;
  if(hasGoogleIdentity(user)) return true;
  const go=confirm("準備中にはGoogle連携が必要です。\n\n連携すると現在の残高・当選履歴がGoogleアカウントに保存され、次回から同じデータで続けられます。\n\nGoogleと連携しますか？");
  if(go) beginGoogleMigration();
  return false;
}

// V46 — server-backed 100 yen redemption requests.
(function(){
  const btn=document.getElementById('redeemBtn');
  const modal=document.getElementById('redeemModal');
  const close=document.getElementById('redeemModalClose');
  const submit=document.getElementById('redeemSubmit');
  const destination=document.getElementById('redeemDestination');
  if(!btn||!modal||!close||!submit||!destination)return;

  function walletAmount(){
    const w=document.getElementById('wallet');
    return Math.max(0,parseInt((w?.textContent||'0').replace(/[^0-9-]/g,''),10)||0);
  }
  function syncRedeemButton(){
  return;
    const ok=walletAmount()>=1000;
    btn.disabled=!ok;
    const menu=document.getElementById('redeemMenuState');
    if(menu)menu.textContent=ok?'交換機能は準備中です':'1,000P〜';
  }
  const wallet=document.getElementById('wallet');
  if(wallet)new MutationObserver(syncRedeemButton).observe(wallet,{childList:true,subtree:true,characterData:true});
  syncRedeemButton();

  btn.addEventListener('click',()=>{
    if(walletAmount()<1000)return;
    if(!requireGoogleForRedemption())return;
    modal.hidden=false;
    setTimeout(()=>destination.focus(),50);
  });
  close.addEventListener('click',()=>modal.hidden=true);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.hidden=true});

  submit.addEventListener('click',async()=>{
    const dest=destination.value.trim();
    if(!dest){destination.focus();return}
    if(dest.length>120)return;
    submit.disabled=true;submit.textContent='申請中…';
    try{
      // V47: match the RPC installed from the SQL shown in chat.
      // That function accepts p_payout_destination and returns the created request row.
      const d=await req('/rest/v1/rpc/request_redemption',{method:'POST',body:JSON.stringify({p_payout_destination:dest})});
      const row=Array.isArray(d)?d[0]:d;
      if(!row || !row.id)throw new Error('交換申請の保存を確認できませんでした');
      modal.hidden=true;destination.value='';
      await Promise.all([status(),loadWinHistory()]);
      if(window.loadRedemptionHistory)await window.loadRedemptionHistory();
      alert('1,000P → PayPay 100円分の交換申請を受け付けました！\n申請ID：'+row.id+'\n現在：処理待ち');
    }catch(e){fail(e)}
    finally{submit.disabled=false;submit.textContent='1,000Pを準備中'}
  });
})();


// V54 — robust permanent redemption history card.
(function(){
  const box=document.getElementById('redeemHistory');
  const refresh=document.getElementById('redeemHistoryRefresh');
  if(!box)return;
  let loading=false;

  function maskDestination(value){
    const v=String(value||'');
    if(!v)return '—';
    if(v.length<=3)return v[0]+'**';
    return v.slice(0,4)+'****';
  }
  function fmtDate(value){
    if(!value)return '—';
    try{return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value))}catch(_){return String(value)}
  }
  function renderRows(rows){
    if(!rows||!rows.length){box.innerHTML='<div class="redeem-history-empty">まだ交換履歴はありません</div>';return}
    box.innerHTML=rows.map(r=>{
      const paid=r.status==='completed'||r.status==='paid';
      return `<div class="redeem-history-row ${paid?'is-paid':'is-pending'}">
        <div><b>${pointText(r.amount)} → PayPay ${Number(r.amount||0).toLocaleString("ja-JP")}円分</b><span>${paid?'✓ 支払済み':'● 処理待ち'}</span></div>
        <small>申請 #${r.id} ・ ${fmtDate(r.created_at)}</small>
        <small>受取先：${maskDestination(r.payout_destination)}</small>
        ${paid?`<small class="paid-at">支払完了：${fmtDate(r.completed_at)}</small>`:''}
      </div>`;
    }).join('');
  }
  async function loadRedemptionHistory(){
  return;
    if(loading)return;
    if(!user?.id||!accessToken){box.innerHTML='<div class="redeem-history-empty">ログイン情報を確認中…</div>';return}
    loading=true;
    if(refresh)refresh.disabled=true;
    box.innerHTML='<small>履歴を読み込み中…</small>';
    try{
      const path='/rest/v1/redemption_requests?select=id,amount,payout_method,payout_destination,status,created_at,completed_at&order=created_at.desc&limit=20';
      const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('交換履歴の取得がタイムアウトしました')),8000));
      const rows=await Promise.race([req(path),timeout]);
      renderRows(rows);
    }catch(e){
      console.error('redemption history:',e);
      box.innerHTML=`<div class="redeem-history-error">交換履歴を取得できませんでした<br><small>${String(e?.message||e)}</small><br><button type="button" id="redeemHistoryRetry">もう一度読み込む</button></div>`;
      document.getElementById('redeemHistoryRetry')?.addEventListener('click',loadRedemptionHistory,{once:true});
    }finally{
      loading=false;
      if(refresh)refresh.disabled=false;
    }
  }
  window.loadRedemptionHistory=loadRedemptionHistory;
  if(refresh)refresh.addEventListener('click',loadRedemptionHistory);

  // Wait for auth to finish instead of firing against a half-restored session.
  let tries=0;
  const waitForAuth=setInterval(()=>{
    tries++;
    if(user?.id&&accessToken){clearInterval(waitForAuth);setTimeout(loadRedemptionHistory,250)}
    else if(tries>=100){clearInterval(waitForAuth);box.innerHTML='<div class="redeem-history-error">ログイン情報を取得できませんでした</div>'}
  },100);
})();

// V55 — reliable admin shortcut. Hidden unless is_app_admin() explicitly confirms this account.
(function(){
  function adminResultIsTrue(result){
    if(result===true || result==='true') return true;
    if(Array.isArray(result)){
      if(result.length===0) return false;
      const v=result[0];
      if(v===true || v==='true') return true;
      if(v && typeof v==='object') return Object.values(v).some(x=>x===true || x==='true');
    }
    if(result && typeof result==='object') return Object.values(result).some(x=>x===true || x==='true');
    return false;
  }
  async function refreshAdminShortcut(){
    const a=document.getElementById('adminShortcut');
    const tester=document.getElementById('devPrizeTester');
    if(a) a.hidden=true;
    if(tester) tester.hidden=true;
    if(!user?.id || !accessToken) return;
    try{
      const result=await req('/rest/v1/rpc/is_app_admin',{method:'POST',body:'{}'});
      const isAdmin=adminResultIsTrue(result);
      if(a) a.hidden=!isAdmin;
      if(tester) tester.hidden=!isAdmin;
    }catch(e){
      console.error('admin UI check:',e);
      if(a) a.hidden=true;
      if(tester) tester.hidden=true;
    }
  }
  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    if(user?.id && accessToken){clearInterval(timer);setTimeout(refreshAdminShortcut,300)}
    else if(tries>=100) clearInterval(timer);
  },100);
  window.refreshAdminShortcut=refreshAdminShortcut;
})();
// V55 — compact home history / redemption panels. Presentation only.
(function(){
  const winMenu=document.getElementById('winHistoryMenu');
  const redeemMenu=document.getElementById('redeemMenu');
  const winPanel=document.getElementById('winHistoryPanel');
  const redeemPanel=document.getElementById('redeemPanel');
  const compactRedeem=document.getElementById('compactRedeemBtn');
  const mainRedeem=document.getElementById('redeemBtn');
  if(!winMenu||!redeemMenu||!winPanel||!redeemPanel)return;

  function setOpen(which){
    const openWin=which==='win' ? winPanel.hidden : false;
    const openRedeem=which==='redeem' ? redeemPanel.hidden : false;
    winPanel.hidden=!openWin;
    redeemPanel.hidden=!openRedeem;
    winMenu.classList.toggle('is-open',openWin);
    redeemMenu.classList.toggle('is-open',openRedeem);
    if(openRedeem&&window.loadRedemptionHistory)window.loadRedemptionHistory();
  }
  winMenu.addEventListener('click',()=>setOpen('win'));
  redeemMenu.addEventListener('click',()=>setOpen('redeem'));
  if(compactRedeem&&mainRedeem){
    const sync=()=>{compactRedeem.disabled=mainRedeem.disabled;compactRedeem.textContent=mainRedeem.disabled?'1,000Pから交換機能は準備中です':'1,000Pを準備中';};
    new MutationObserver(sync).observe(mainRedeem,{attributes:true,attributeFilter:['disabled']});
    sync();
    compactRedeem.addEventListener('click',()=>{if(!mainRedeem.disabled)mainRedeem.click();});
  }
})();

// V57 login bonus
document.getElementById("loginBonusClaim")?.addEventListener("click",claimLoginBonus);

// V64 — linked Google accounts resume silently; account status wording polished.

// V66 — player UI uses 10P per internal yen-equivalent unit.
document.addEventListener("DOMContentLoaded",()=>{
  const tester=document.getElementById("devPrizeTester");
  if(tester) tester.hidden=true;
});


// V78 — point offer category tabs (UI only)
document.addEventListener("DOMContentLoaded", () => {
  const tabs = [...document.querySelectorAll(".offer-tab")];
  const cards = [...document.querySelectorAll(".offer-card")];
  if (!tabs.length || !cards.length) return;
  tabs.forEach(tab => tab.addEventListener("click", () => {
    const filter = tab.dataset.offerFilter || "all";
    tabs.forEach(t => t.classList.toggle("active", t === tab));
    cards.forEach(card => { card.hidden = filter !== "all" && card.dataset.offerCategory !== filter; });
  }));
});


/* V79: beta exchange lock */
(function () {
  const LOCK_MESSAGE = "交換機能は正式リリース準備中です。PayPayへの交換は現在ご利用いただけません。";

  function looksLikeExchange(el) {
  return;
    if (!el) return false;
    const text = ((el.textContent || "") + " " + (el.id || "") + " " + (el.className || "") + " " +
      (el.getAttribute?.("aria-label") || "")).toLowerCase();
    return /交換|paypay|redeem|redemption/.test(text);
  }

  function lockExchangeUI() {
  return;
    const notice = document.getElementById("exchangeBetaNotice");
    const exchangeCandidates = [...document.querySelectorAll("button, input[type='submit'], a, form, section, div")];
    const exchangeAreas = exchangeCandidates.filter(looksLikeExchange);

    // Put notice near the first visible exchange area.
    const anchor = exchangeAreas.find(el => el.offsetParent !== null && /交換|paypay|redeem|redemption/i.test(el.textContent || el.id || el.className || ""));
    if (notice) {
      notice.hidden = false;
      if (anchor && anchor.parentElement && !anchor.parentElement.contains(notice)) {
        anchor.parentElement.appendChild(notice);
      }
    }

    document.querySelectorAll("button, input[type='submit'], a").forEach(el => {
      if (!looksLikeExchange(el)) return;
      const t = (el.textContent || el.value || "").trim();
      // Keep accordion/header controls usable; only disable action-looking controls.
      if (/申請|準備中|redeem|submit|paypay.*交換/i.test(t + " " + (el.id||"") + " " + (el.className||""))) {
        if ("disabled" in el) el.disabled = true;
        el.setAttribute("aria-disabled", "true");
        el.classList.add("exchange-locked-control");
        if (el.tagName === "A") el.removeAttribute("href");
      }
    });
  }

  document.addEventListener("click", function (e) {
    const target = e.target.closest?.("button, input[type='submit'], a");
    if (!target) return;
    const s = ((target.textContent || target.value || "") + " " + (target.id || "") + " " + (target.className || "")).toLowerCase();
    if (/交換申請|準備中|redeem|redemption|paypay.*交換/.test(s)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      
    }
  }, true);

  document.addEventListener("submit", function (e) {
    const form = e.target;
    if (looksLikeExchange(form)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      
    }
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", lockExchangeUI);
  } else {
    lockExchangeUI();
  }
  setTimeout(lockExchangeUI, 800);
})();


/* V80: definitive exchange lock */
function applyV80ExchangeLock(){
  document.querySelectorAll("button").forEach(btn=>{
    const t=(btn.textContent||"").trim();
    if(t==="交換する" || t==="交換できます" || /PayPay.*交換/.test(t)){
      btn.textContent="準備中";
      btn.disabled=true;
      btn.setAttribute("aria-disabled","true");
      btn.classList.add("exchange-locked-control");
    }
  });
  document.querySelectorAll("*").forEach(el=>{
    if(el.children.length===0){
      const t=(el.textContent||"").trim();
      if(t==="1,000P達成！PayPay 100円分に交換できます"){
        el.textContent="🔒 交換機能は正式リリース準備中です";
      }
    }
  });
}
document.addEventListener("DOMContentLoaded", applyV80ExchangeLock);
new MutationObserver(applyV80ExchangeLock).observe(document.documentElement,{childList:true,subtree:true});


// V88-8: Golden Island artwork follows the rendered Golden Ticket count.
(function(){
  function goldenCard(){
    return document.querySelector('.island-card.golden, .island-card.secret, .golden-island-card');
  }
  function ticketTextNode(){
    const card = goldenCard();
    if (!card) return null;
    const candidates = [...card.querySelectorAll('*')];
    return candidates.find(el => /(?:GOLDEN\s*TICKET|チケット)/i.test(el.textContent || '') && /\d+/.test(el.textContent || '')) || null;
  }
  function syncGoldenArtwork(){
    const card = goldenCard();
    if (!card) return;
    const node = ticketTextNode();
    const text = node ? node.textContent : card.textContent;
    const m = String(text || '').match(/(?:GOLDEN\s*TICKET|チケット)[^\d]*(\d+)/i);
    const tickets = m ? Number(m[1]) : 0;
    card.classList.toggle('golden-unlocked', tickets > 0);
    card.classList.toggle('golden-locked', tickets <= 0);
  }
  document.addEventListener('DOMContentLoaded', () => {
    syncGoldenArtwork();
    const card = goldenCard();
    if (card) new MutationObserver(syncGoldenArtwork).observe(card, {subtree:true, childList:true, characterData:true});
  });
})();


// V88-34 — admin-only beta refill controls.
// Security is enforced again inside each RPC with is_app_admin().
(function(){
  async function runAdminRefill(kind){
    const statusEl=document.getElementById("adminRefillStatus");
    const ticketBtn=document.getElementById("adminAddGoldenTicket");
    const energyBtn=document.getElementById("adminAddEnergy");
    const btn=kind==="ticket"?ticketBtn:energyBtn;
    if(!btn||btn.disabled)return;
    const old=btn.textContent;
    btn.disabled=true;
    if(statusEl)statusEl.textContent="反映中…";
    try{
      if(kind==="ticket"){
        await req("/rest/v1/rpc/admin_add_golden_ticket",{method:"POST",body:JSON.stringify({p_amount:1})});
        await loadGoldenTickets();
        if(statusEl)statusEl.textContent=`🎫 黄金チケットを+1しました（現在 ${goldenTickets}枚）`;
      }else{
        await req("/rest/v1/rpc/admin_add_test_energy",{method:"POST",body:JSON.stringify({p_amount:5})});
        await status();
        if(statusEl)statusEl.textContent=`⚡ エネルギーを補充しました（現在 ${serverEnergy}/20）`;
      }
    }catch(e){
      console.error("admin refill:",e);
      if(statusEl)statusEl.textContent="⚠ 補充できませんでした。RPCのSQLを確認してください";
    }finally{
      btn.disabled=false;btn.textContent=old;
    }
  }
  document.getElementById("adminAddGoldenTicket")?.addEventListener("click",()=>runAdminRefill("ticket"));
  document.getElementById("adminAddEnergy")?.addEventListener("click",()=>runAdminRefill("energy"));
})();

// V88-35 dedicated Golden Island page bootstrap
window.addEventListener("DOMContentLoaded", async ()=>{
  if(!document.body.classList.contains("golden-page")) return;
  try{
    // auth() may still be restoring the saved Google session. Wait briefly for user.
    for(let i=0;i<40 && !user?.id;i++) await new Promise(r=>setTimeout(r,50));
    await loadGoldenTickets();
    paintGoldenTicketUI();
    const game=document.getElementById("goldenGame");
    if(game) game.hidden=false;
    renderGoldenMap();
    const msg=document.getElementById("goldenMessage");
    if(msg) msg.textContent=goldenTickets>0
      ?"✨ 50個から黄金の宝箱を1つ選ぼう"
      :"🎫 黄金島チケットがありません";
  }catch(e){console.error("golden page bootstrap",e);}
});

// V88-52: header nickname
function ctGuestNameV8852(u){
  const s=String(u?.id||"0000").replace(/-/g,"").slice(-4).toUpperCase();
  return `ゲスト-${s}`;
}
function ctIsGuestV8852(u){
  if(!u)return true;
  if(u.is_anonymous===true || u.app_metadata?.provider==="anonymous")return true;
  return !u.email && u.app_metadata?.provider!=="google";
}
async function refreshHeaderNicknameV8852(){
  const el=document.getElementById("headerNicknameValue");
  if(!el)return;
  if(!user){el.textContent="ゲスト";return;}
  if(ctIsGuestV8852(user)){el.textContent=ctGuestNameV8852(user);return;}
  try{
    const rows=await req("/rest/v1/player_profiles?user_id=eq."+encodeURIComponent(user.id)+"&select=nickname");
    el.textContent=(Array.isArray(rows)&&rows[0]?.nickname?.trim())||"未設定";
  }catch(e){
    console.warn("nickname:",e);
    el.textContent="未設定";
  }
}
window.addEventListener("load",()=>setTimeout(refreshHeaderNicknameV8852,1500));

// V88-55: reliable nickname change + header sync
(function(){
  function el(id){ return document.getElementById(id); }

  function isGuestUser(){
    if(!user) return true;
    if(user.is_anonymous === true) return true;
    const provider = user.app_metadata && user.app_metadata.provider;
    if(provider === "anonymous") return true;
    return !user.email && provider !== "google";
  }

  async function loadNicknameToHeader(){
    const header=el("headerNicknameValue");
    if(!header || !user) return;
    if(isGuestUser()){
      if(typeof ctGuestNameV8852 === "function") header.textContent=ctGuestNameV8852(user);
      return;
    }
    try{
      const rows=await req("/rest/v1/player_profiles?user_id=eq."+encodeURIComponent(user.id)+"&select=nickname");
      const name=Array.isArray(rows) && rows[0] && rows[0].nickname ? String(rows[0].nickname).trim() : "";
      header.textContent=name || "未設定";
    }catch(e){ console.warn("nickname load",e); }
  }

  function syncNicknameMenu(){
    const b=el("nicknameMenuBtn");
    if(b) b.hidden=isGuestUser();
  }

  function closeNicknameModal(){
    const m=el("homeNicknameModal");
    if(m) m.hidden=true;
    const e=el("homeNicknameError");
    if(e) e.textContent="";
  }

  async function openNicknameModal(){
    if(isGuestUser()){ syncNicknameMenu(); return; }
    await loadNicknameToHeader();
    const m=el("homeNicknameModal"), input=el("homeNicknameInput");
    if(!m || !input) return;
    const now=(el("headerNicknameValue")?.textContent || "").trim();
    input.value=(now==="未設定" || now==="---") ? "" : now;
    m.hidden=false;
    requestAnimationFrame(()=>input.focus());
  }

  async function saveNickname(){
    const input=el("homeNicknameInput"), error=el("homeNicknameError"), save=el("homeNicknameSave");
    if(!input || !user) return;
    const nickname=input.value.trim();
    if(nickname.length < 2 || nickname.length > 12){
      if(error) error.textContent="ニックネームは2〜12文字で入力してください。";
      return;
    }
    if(save) save.disabled=true;
    if(error) error.textContent="";
    try{
      const rows=await req("/rest/v1/player_profiles?user_id=eq."+encodeURIComponent(user.id)+"&select=user_id");
      if(Array.isArray(rows) && rows.length){
        await req("/rest/v1/player_profiles?user_id=eq."+encodeURIComponent(user.id),{
          method:"PATCH",
          headers:{"Prefer":"return=minimal"},
          body:JSON.stringify({nickname,updated_at:new Date().toISOString()})
        });
      }else{
        await req("/rest/v1/player_profiles",{
          method:"POST",
          headers:{"Prefer":"return=minimal"},
          body:JSON.stringify({user_id:user.id,nickname})
        });
      }
      // Immediate UI sync; then verify from DB.
      const header=el("headerNicknameValue");
      if(header) header.textContent=nickname;
      closeNicknameModal();
      await loadNicknameToHeader();
    }catch(e){
      console.error("nickname save",e);
      if(error) error.textContent="変更できませんでした。もう一度お試しください。";
    }finally{
      if(save) save.disabled=false;
    }
  }

  // Delegation works even if elements are created/initialized after this script runs.
  document.addEventListener("click",function(ev){
    const nick=ev.target.closest && ev.target.closest("#nicknameMenuBtn");
    if(nick){
      ev.preventDefault();
      ev.stopPropagation();
      openNicknameModal();
      return;
    }
    if(ev.target.closest && ev.target.closest("[data-close-nickname]")){
      closeNicknameModal();
      return;
    }
    if(ev.target.closest && ev.target.closest("#homeNicknameSave")){
      ev.preventDefault();
      saveNickname();
    }
  });

  document.addEventListener("keydown",function(ev){
    if(ev.key==="Escape") closeNicknameModal();
    if(ev.key==="Enter" && document.activeElement===el("homeNicknameInput")){
      ev.preventDefault(); saveNickname();
    }
  });

  window.addEventListener("load",function(){
    syncNicknameMenu();
    loadNicknameToHeader();
    setTimeout(syncNicknameMenu,800);
    setTimeout(loadNicknameToHeader,900);
  });
})();


// V88-66: Home BGM - 港町
(() => {
  const CT_BGM_ENABLED_KEY="ct_bgm_enabled";
  const CT_HOME_BGM_VOLUME=0.12;
  let bgm=null;
  let unlocked=false;

  function enabled(){
    return localStorage.getItem(CT_BGM_ENABLED_KEY)!=="0";
  }
  function ensure(){
    if(bgm) return bgm;
    bgm=new Audio("./assets/bgm/home.mp3");
    bgm.loop=true;
    bgm.preload="auto";
    bgm.volume=ctGetBgmVolume();
    return bgm;
  }
  function updateButton(){
    const b=document.getElementById("ctBgmToggle");
    if(b) b.textContent=enabled()?"🔊 BGM ON":"🔇 BGM OFF";
  }
  function start(){
    unlocked=true;
    if(!enabled()) return;
    const a=ensure();
    a.volume=ctGetBgmVolume();
    a.play().catch(()=>{});
  }
  function toggle(e){
    if(e){ e.preventDefault(); e.stopPropagation(); }
    const next=!enabled();
    localStorage.setItem(CT_BGM_ENABLED_KEY,next?"1":"0");
    updateButton();
    const a=ensure();
    if(next){
      unlocked=true;
      a.volume=ctGetBgmVolume();
      a.play().catch(()=>{});
    }else{
      a.pause();
    }
  }
  function install(){
    if(!document.getElementById("ctBgmToggle")){
      const btn=document.createElement("button");
      btn.id="ctBgmToggle";
      btn.type="button";
      btn.setAttribute("aria-label","BGMのオン・オフ");
      Object.assign(btn.style,{
        position:"fixed",right:"14px",bottom:"14px",zIndex:"9998",
        border:"1px solid rgba(255,255,255,.35)",borderRadius:"999px",
        padding:"9px 13px",background:"rgba(12,18,28,.82)",color:"#fff",
        fontWeight:"800",cursor:"pointer",backdropFilter:"blur(8px)",
        boxShadow:"0 4px 18px rgba(0,0,0,.25)"
      });
      btn.addEventListener("click",toggle);
      document.body.appendChild(btn);
    }
    updateButton();
    const a=ensure();
    if(enabled()){
      a.volume=ctGetBgmVolume();
      a.play().then(()=>{unlocked=true;}).catch(()=>{});
    }
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",install);
  else install();

  document.addEventListener("pointerdown",start,{once:true,capture:true});
  document.addEventListener("touchstart",start,{once:true,capture:true,passive:true});
  document.addEventListener("click",start,{once:true,capture:true});
  document.addEventListener("keydown",start,{once:true,capture:true});

  window.addEventListener("ct:bgm-volume",(e)=>{
    const a=ensure();
    const v=Math.max(0,Math.min(1,Number(e.detail)));
    a.volume=v;
    if(v<=0){ a.pause(); return; }
    if(enabled()){ unlocked=true; a.play().catch(()=>{}); }
  });

  document.addEventListener("visibilitychange",()=>{
    if(!bgm) return;
    if(document.hidden) bgm.pause();
    else if(unlocked&&enabled()) bgm.play().catch(()=>{});
  });
})();


// V88-70 compact menu sound UI generated by JS (does not alter page layout HTML)
document.addEventListener("DOMContentLoaded",()=>{
  const old=document.getElementById("ctBgmToggle"); if(old)old.remove();
  const btn=document.getElementById("ctSoundSettingsBtn");
  if(!btn)return;
  let panel=null;
  const makePanel=()=>{
    if(panel)return panel;
    panel=document.createElement("div");
    panel.id="ctSoundSettings";
    panel.style.cssText="grid-column:1/-1;padding:10px 12px;border-top:1px solid rgba(127,127,127,.16);";
    panel.innerHTML=`
      <label style="display:grid;grid-template-columns:76px 1fr 34px;gap:8px;align-items:center;margin:5px 0;font-size:13px;font-weight:700">
        <span>🎵 BGM</span><input id="ctBgmVolume" type="range" min="0" max="100" step="1"><output id="ctBgmVolumeValue"></output>
      </label>
      <label style="display:grid;grid-template-columns:76px 1fr 34px;gap:8px;align-items:center;margin:5px 0;font-size:13px;font-weight:700">
        <span>🔊 効果音</span><input id="ctSeVolume" type="range" min="0" max="100" step="1"><output id="ctSeVolumeValue"></output>
      </label>`;
    btn.parentElement.appendChild(panel);
    panel.hidden=true;
    const bg=panel.querySelector("#ctBgmVolume"),se=panel.querySelector("#ctSeVolume");
    const bv=panel.querySelector("#ctBgmVolumeValue"),sv=panel.querySelector("#ctSeVolumeValue");
    bg.value=String(Math.round(ctGetBgmVolume()*100));bv.value=bg.value;
    se.value=String(Math.round(ctGetSeVolume()*100));sv.value=se.value;
    bg.addEventListener("input",()=>{localStorage.setItem(CT_BGM_VOLUME_KEY,bg.value);bv.value=bg.value;window.dispatchEvent(new CustomEvent("ct:bgm-volume",{detail:ctGetBgmVolume()}));});
    se.addEventListener("input",()=>{localStorage.setItem(CT_SE_VOLUME_KEY,se.value);sv.value=se.value;ctApplyMediaSeVolume();});
    return panel;
  };
  btn.addEventListener("click",(e)=>{
    e.preventDefault();e.stopPropagation();
    const p=makePanel();
    p.hidden=!p.hidden;
  });
  // first click should open it
  btn.addEventListener("click",()=>{}, {once:true});
  ctApplyMediaSeVolume();
});


// V88-71: one-time defaults + live preview
document.addEventListener("DOMContentLoaded",()=>{
  const MIGRATION_KEY="ct_sound_defaults_v8871";
  if(localStorage.getItem(MIGRATION_KEY)!=="1"){
    localStorage.setItem(CT_BGM_VOLUME_KEY,"15");
    localStorage.setItem(CT_SE_VOLUME_KEY,"100");
    localStorage.setItem(MIGRATION_KEY,"1");
  }

  const bg=document.getElementById("ctBgmVolume");
  const se=document.getElementById("ctSeVolume");
  const bgv=document.getElementById("ctBgmVolumeValue");
  const sev=document.getElementById("ctSeVolumeValue");

  // UI may be created only after opening the sound panel, so wire dynamically.
  document.addEventListener("input",(e)=>{
    const t=e.target;
    if(t && t.id==="ctBgmVolume"){
      localStorage.setItem(CT_BGM_VOLUME_KEY,t.value);
      const o=document.getElementById("ctBgmVolumeValue"); if(o)o.value=t.value;
      window.dispatchEvent(new CustomEvent("ct:bgm-volume",{detail:ctGetBgmVolume()}));
    }
    if(t && t.id==="ctSeVolume"){
      localStorage.setItem(CT_SE_VOLUME_KEY,t.value);
      const o=document.getElementById("ctSeVolumeValue"); if(o)o.value=t.value;
      ctApplyMediaSeVolume();
      // lightweight live preview tone while dragging (throttled)
      const now=performance.now();
      if(!window.__ctLastSePreview || now-window.__ctLastSePreview>90){
        window.__ctLastSePreview=now;
        try{
          const C=window.AudioContext||window.webkitAudioContext;
          window.__ctPreviewCtx=window.__ctPreviewCtx||new C();
          const c=window.__ctPreviewCtx;
          if(c.state==="suspended")c.resume().catch(()=>{});
          const o=c.createOscillator(),g=c.createGain();
          o.type="sine";o.frequency.value=660;
          const v=ctGetSeVolume();
          g.gain.setValueAtTime(Math.max(.0001,v*.09),c.currentTime);
          g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.07);
          o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.075);
        }catch(_){}
      }
    }
  },true);

  // Refresh values whenever the sound-settings button is opened.
  const b=document.getElementById("ctSoundSettingsBtn");
  if(b)b.addEventListener("click",()=>{
    setTimeout(()=>{
      const x=document.getElementById("ctBgmVolume"),y=document.getElementById("ctSeVolume");
      const xo=document.getElementById("ctBgmVolumeValue"),yo=document.getElementById("ctSeVolumeValue");
      if(x){x.value=String(Math.round(ctGetBgmVolume()*100));if(xo)xo.value=x.value;}
      if(y){y.value=String(Math.round(ctGetSeVolume()*100));if(yo)yo.value=y.value;}
      try{if(typeof bgm!=="undefined"&&bgm)bgm.volume=ctGetBgmVolume();}catch(_){}
      ctApplyMediaSeVolume();
    },0);
  });
});


/* V88-82 — acquisition history beside exchange */
(()=>{
  const btn=document.getElementById("historyMenu");
  const panel=document.getElementById("winHistoryPanel");
  const redeemBtn=document.getElementById("redeemMenu");
  const redeemPanel=document.getElementById("redeemPanel");
  if(!btn||!panel)return;

  btn.addEventListener("click",()=>{
    const willOpen=panel.hidden;
    panel.hidden=!willOpen;
    btn.classList.toggle("is-open",willOpen);

    if(willOpen){
      if(redeemPanel) redeemPanel.hidden=true;
      if(redeemBtn) redeemBtn.classList.remove("is-open");
      const refresh=document.getElementById("refresh");
      if(refresh) refresh.click();
      panel.scrollIntoView({behavior:"smooth",block:"nearest"});
    }
  });
})();

// Analytics v1 UI interactions
document.getElementById("redeemBtn")?.addEventListener("click",()=>ctAnalytics?.event("exchange_open",{}));
document.getElementById("menuToggle")?.addEventListener("click",()=>ctAnalytics?.event("menu_open",{}));
