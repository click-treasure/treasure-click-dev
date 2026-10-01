
// V88-70 shared sound settings
const CT_BGM_VOLUME_KEY="ct_bgm_volume";
const CT_SE_VOLUME_KEY="ct_se_volume";
function ctGetBgmVolume(){const r=localStorage.getItem(CT_BGM_VOLUME_KEY);if(r===null)return .15;const v=Number(r);return Number.isFinite(v)?Math.max(0,Math.min(100,v))/100:.15}
function ctGetSeVolume(){const r=localStorage.getItem(CT_SE_VOLUME_KEY);if(r===null)return 1;const v=Number(r);return Number.isFinite(v)?Math.max(0,Math.min(100,v))/100*1.5:1.5}
function ctApplyMediaSeVolume(){document.querySelectorAll('audio:not([data-ct-bgm])').forEach(a=>a.volume=Math.min(1,ctGetSeVolume()))}

// V88-32 HARD island complete
const SUPABASE_URL="https://osawhwcddovhddrxgfju.supabase.co";
const SUPABASE_KEY="sb_publishable_AMGEh3TguYyEpd7piWIjTQ_oHlYdG8f";
const POINTS_PER_YEN=10;
const $=id=>document.getElementById(id);

let accessToken=localStorage.getItem("v261_access_token")||"";
let refreshToken=localStorage.getItem("v261_refresh_token")||"";
let user=JSON.parse(localStorage.getItem("v261_user")||"null");
let island=null,cells=[],serverEnergy=0,bonusTaps=0,nextSeconds=0;
let loading=false,digBusy=false,pollTimer=null,countTimer=null;
let knownOpened=new Set(),ownDigCell=null;
let battleEvents=[];
let playerNickname="";

const params=new URLSearchParams(location.search);
const wantedGeneration=Number(params.get("generation")||0);
const difficulty=(params.get("difficulty")||"easy").toLowerCase();
const THEMES={
  easy:{label:"EASY島",subtitle:"南の楽園の小さな島",hit:"🎯 当たりやすさ ★★★",reward:"💎 当たり報酬 ★☆☆",chest:"./assets/easy-chest-closed-v88.webp",open:"./assets/easy-chest-open-v88.webp",rewards:"🪙 10P　🪙 100P　🌟 1,000P"},
  normal:{label:"NORMAL島",subtitle:"海に浮かぶ古代遺跡の島",hit:"🎯 当たりやすさ ★★☆",reward:"💎 当たり報酬 ★★☆",chest:"./assets/normal-chest-closed-v88.webp",open:"./assets/normal-chest-open-v88.webp",rewards:"🪙 10P　🪙 100P　🌟 1,000P"},
  hard:{label:"HARD島",subtitle:"灼熱の溶岩に囲まれた魔城",hit:"🎯 当たりやすさ ★☆☆",reward:"💎 当たり報酬 ★★★",chest:"./assets/hard-chest-closed-v88.webp",open:"./assets/hard-chest-open-v88.webp",rewards:"🪙 10P　🪙 100P　🌟 1,000P　🔥 5,000P"}
};
const theme=THEMES[difficulty]||THEMES.easy;
ctAnalytics?.event("island_enter",{difficulty,generation:wantedGeneration});

function points(n){return Number(n||0)*POINTS_PER_YEN}
function pointText(n){return points(n).toLocaleString("ja-JP")+"P"}

async function req(path,options={},auth=true){
  const headers=Object.assign({"apikey":SUPABASE_KEY,"Content-Type":"application/json"},options.headers||{});
  if(auth&&accessToken)headers.Authorization="Bearer "+accessToken;
  const r=await fetch(SUPABASE_URL+path,Object.assign({},options,{headers}));
  const txt=await r.text();let data=null;
  try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!r.ok)throw new Error((data&&data.message)||(data&&data.msg)||(data&&data.error_description)||txt||("HTTP "+r.status));
  return data;
}

function showError(e){
  console.error(e);
  const t=$("errorToast");t.textContent="エラー: "+(e?.message||e);t.hidden=false;
  setTimeout(()=>t.hidden=true,4000);
}
function setMessage(s){$("message").textContent=s}

async function ensureAuth(){
  if(accessToken){
    try{user=await req("/auth/v1/user");return}
    catch(_){accessToken="";user=null}
  }
  const d=await req("/auth/v1/signup",{method:"POST",body:JSON.stringify({data:{source:"treasure-island-v88"}})},false);
  accessToken=d.access_token;refreshToken=d.refresh_token;user=d.user;
  localStorage.setItem("v261_access_token",accessToken);
  localStorage.setItem("v261_refresh_token",refreshToken||"");
  localStorage.setItem("v261_user",JSON.stringify(user));
}

async function loadStatus(){
  const [sd,ld]=await Promise.all([
    req("/rest/v1/rpc/get_player_status",{method:"POST",body:"{}"}),
    req("/rest/v1/rpc/get_login_bonus_status",{method:"POST",body:"{}"}).catch(()=>null)
  ]);
  const s=Array.isArray(sd)?sd[0]:sd;
  const l=Array.isArray(ld)?ld[0]:ld;
  if(s){
    serverEnergy=Number(s.energy||0);
    nextSeconds=Number(s.next_energy_seconds||0);
    $("wallet").textContent=pointText(s.balance);
  }
  bonusTaps=Number(l?.bonus_taps||0);
  paintEnergy();
}
function paintEnergy(){
  const txt=serverEnergy+" / 20";
  $("energy").textContent=txt;$("energyBottom").textContent=txt;
  if(serverEnergy>=20)$("energyTimer").textContent=bonusTaps>0?`FULL ・ ボーナス +${bonusTaps}`:"FULL";
  else{
    const mm=String(Math.floor(Math.max(0,nextSeconds)/60)).padStart(2,"0");
    const ss=String(Math.max(0,nextSeconds%60)).padStart(2,"0");
    $("energyTimer").textContent=`次の回復 ${mm}:${ss}${bonusTaps>0?` ・ +${bonusTaps}`:""}`;
  }
}
function startCountdown(){
  clearInterval(countTimer);
  countTimer=setInterval(async()=>{
    if(serverEnergy<20&&nextSeconds>0){nextSeconds--;paintEnergy();paintEnergyEmptyModal()}
    if(serverEnergy<20&&nextSeconds<=0){try{await loadStatus()}catch(e){console.error(e)}}
  },1000);
}

async function resolveIsland(){
  const d=await req("/rest/v1/rpc/get_latest_islands",{method:"POST",body:"{}"});
  const found=(d||[]).find(x=>x.difficulty===difficulty);
  if(!found)throw new Error(theme.label+"が見つかりません");
  island=found;
  $("generation").textContent="#"+found.generation;
  document.body.dataset.difficulty=difficulty;
  $("difficultyTitle").textContent=theme.label;
  $("islandSubtitle").textContent=theme.subtitle;
  $("hitRateChip").textContent=theme.hit;
  $("rewardChip").textContent=theme.reward;
  $("rewardList").textContent=theme.rewards;
  document.title=theme.label+"｜CLICK TREASURE";
  if(wantedGeneration&&wantedGeneration!==Number(found.generation)){
    history.replaceState(null,"",`island.html?difficulty=${difficulty}&generation=${found.generation}`);
  }
}

async function loadCells(silent=false){
  if(!island||loading)return;
  loading=true;
  try{
    const d=await req("/rest/v1/treasure_cells?island_id=eq."+encodeURIComponent(island.island_id)+"&select=id,cell_index,opened,opened_at&order=cell_index.asc");
    const next=d||[];
    const openedNow=new Set(next.filter(c=>c.opened).map(c=>Number(c.cell_index)));
    let other=[];
    if(silent){
      other=[...openedNow].filter(i=>!knownOpened.has(i)&&i!==ownDigCell);
      if(other.length){
        setMessage(`⚔️ ほかのプレイヤーが ${other.length}箱発掘！`);
        // 名前のない仮ログは作らず、DBの battle_events からニックネーム付きログを取得する。
        await loadBattleEvents();
      }
    }
    cells=next;knownOpened=openedNow;ownDigCell=null;
    renderBoard();
    renderBattleFeed();
    if(other.length)flashRivalCells(other);
    if(!silent)setMessage("宝箱をタップして発掘！");
  }finally{loading=false}
}

function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function renderBattleFeed(){
  const feed=$("battleFeed");if(!feed)return;
  if(!battleEvents.length){feed.innerHTML="<span>👀 他プレイヤーの発掘を監視中…</span>";return}
  feed.innerHTML=battleEvents.map(e=>`<span class="battle-event">⚡ ${escapeHtml(e.time)}　<b>${escapeHtml(e.nickname)}</b> が No.${Number(e.cell)} を発掘！</span>`).join("");
}
function hasGoogleIdentity(u){
  if(!u || u.is_anonymous === true)return false;
  if(Array.isArray(u.identities)&&u.identities.some(x=>x.provider==="google"))return true;
  const providers=u.app_metadata&&u.app_metadata.providers;
  return Array.isArray(providers)&&providers.includes("google");
}
function guestNickname(){
  const raw=String(user?.id||"guest").replace(/-/g,"");
  return "ゲスト-"+raw.slice(-4).toUpperCase();
}
async function loadNickname(){
  if(!user?.id)return;
  if(!hasGoogleIdentity(user)){
    playerNickname=guestNickname();
    closeNicknameModal();
    return;
  }
  const rows=await req("/rest/v1/player_profiles?user_id=eq."+encodeURIComponent(user.id)+"&select=nickname&limit=1");
  playerNickname=String(rows?.[0]?.nickname||"").trim();
  if(!playerNickname)showNicknameModal();
  else closeNicknameModal();
}
function showNicknameModal(){const m=$("nicknameModal");if(!m)return;m.hidden=false;m.setAttribute("aria-hidden","false");setTimeout(()=>$("nicknameInput")?.focus(),80)}
function closeNicknameModal(){const m=$("nicknameModal");if(!m)return;m.hidden=true;m.setAttribute("aria-hidden","true")}
async function saveNickname(name){
  const clean=String(name||"").trim();
  if(clean.length<2||clean.length>12)throw new Error("ニックネームは2〜12文字で入力してください");
  if(/[<>]/.test(clean))throw new Error("< と > は使用できません");
  if(!hasGoogleIdentity(user))throw new Error("ゲストはニックネーム変更できません。Googleと連携してください");
  await req("/rest/v1/player_profiles?on_conflict=user_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({user_id:user.id,nickname:clean})});
  playerNickname=clean;closeNicknameModal();
}

function ctBattleIslandKey(){ return island?.island_id ? String(island.island_id) : null; }

async function loadBattleEvents(){
  if(!island)return;
  try{
    const battleIslandId=ctBattleIslandKey();
    if(!battleIslandId)return;
    const cutoff=new Date(Date.now()-30000).toISOString();
    const rows=await req("/rest/v1/battle_events?island_id=eq."+encodeURIComponent(battleIslandId)+
      "&created_at=gte."+encodeURIComponent(cutoff)+
      "&select=user_id,nickname,cell_index,created_at&order=created_at.desc&limit=5");
    battleEvents=(rows||[]).map(r=>({nickname:r.nickname||"冒険者",cell:r.cell_index,time:new Date(r.created_at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}));
    renderBattleFeed();
  }catch(e){console.warn("battle feed:",e)}
}
async function postBattleEvent(cellIndex,prize){
  if(!user?.id||!playerNickname||!island)return;
  try{await req("/rest/v1/battle_events",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,island_id:String(island.island_id),nickname:playerNickname,cell_index:Number(cellIndex),prize:Number(prize||0)})});await loadBattleEvents()}catch(e){console.warn("battle event:",e)}
}
function flashRivalCells(indices){
  indices.forEach(i=>{
    const b=document.querySelector(`.demo-chest[data-cell="${i}"]`);if(!b)return;
    b.classList.add("rival-opened");
    const tag=document.createElement("span");tag.className="rival-tag";tag.textContent="先に掘られた!";b.appendChild(tag);
    setTimeout(()=>b.classList.remove("rival-opened"),1500);
    setTimeout(()=>tag.remove(),1500);
  });
}

function renderBoard(){
  const board=$("chestBoard");board.classList.remove("loading");board.innerHTML="";
  const byIndex=new Map(cells.map(c=>[Number(c.cell_index),c]));
  let opened=0;
  for(let pos=1;pos<=100;pos++){
    const c=byIndex.get(pos);
    const dug=!!c?.opened;
    if(dug)opened++;
    const b=document.createElement("button");
    b.type="button";
    b.className="demo-chest"+(dug?" demo-dug":"");
    b.dataset.cell=String(pos);
    b.setAttribute("aria-label",dug?`発掘済み ${pos}`:`宝箱 ${pos}`);
    if(!dug){
      b.innerHTML=`<img src="${theme.chest}" alt="未開封の宝箱" draggable="false">`;
      b.disabled=digBusy||(serverEnergy<=0&&bonusTaps<=0);
      b.onclick=()=>dig(pos,b);
    }else{
      b.disabled=true;
    }
    board.appendChild(b);
  }
  $("remaining").textContent=String(Math.max(0,100-opened));
}

function playOpenTransition(button){
  const img=button.querySelector("img");if(!img)return;
  button.classList.add("opening-now");
  img.src=theme.open;
}
function removeOpenedChest(button){
  button.classList.add("vanish");
  setTimeout(()=>{button.innerHTML="";button.className="demo-chest demo-dug";button.disabled=true},430);
}
function showReward(prize){
  const t=$("rewardToast");$("rewardAmount").textContent=pointText(prize);
  t.hidden=false;t.classList.remove("show");void t.offsetWidth;t.classList.add("show");
  setTimeout(()=>{t.classList.remove("show");t.hidden=true},1500);
}
function showTicket(){
  const t=$("ticketToast");t.hidden=false;t.classList.remove("show");void t.offsetWidth;t.classList.add("show");
  setTimeout(()=>{t.classList.remove("show");t.hidden=true},1900);
}


// V88-26 — restored legacy prize sounds/effects
let legacyAudioCtx=null;
function legacyCtx(){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;if(!legacyAudioCtx)legacyAudioCtx=new AC();return legacyAudioCtx}
function unlockGameAudio(){const c=legacyCtx();if(c&&c.state==="suspended")c.resume().catch(()=>{})}
function legacyTone(freq,duration,type="sine",gain=.09,delay=0){const c=legacyCtx();if(!c)return;if(c.state==="suspended")c.resume().catch(()=>{});const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+delay;o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+duration+.03)}
function soundDig(){const c=legacyCtx();if(!c)return;const se=ctGetSeVolume();if(se<=0)return;const n=Math.floor(c.sampleRate*.11),buf=c.createBuffer(1,n,c.sampleRate),d=buf.getChannelData(0);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n);const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();f.type="lowpass";f.frequency.value=900;g.gain.value=.35*se;s.buffer=buf;s.connect(f);f.connect(g);g.connect(c.destination);s.start();legacyTone(135,.10,"triangle",.16*se,.01)}
function soundMiss(){legacyTone(170,.12,"triangle",.07);legacyTone(120,.16,"triangle",.05,.08)}
function playAudio(id,fallback){const a=$(id);if(!a)return fallback?.();try{a.pause();a.currentTime=0;a.volume=Math.min(1,ctGetSeVolume());const q=a.play();if(q&&q.catch)q.catch(()=>fallback?.())}catch(_){fallback?.()}}
function v44Play500Sound(name,volume=1){try{const a=new Audio(`sounds/${name}?v=88-26`);a.volume=Math.min(1,volume*ctGetSeVolume());const q=a.play();if(q&&q.catch)q.catch(()=>{})}catch(_){}}
function originalCelebrate10(){const fx=$("fx");if(!fx)return;for(let i=0;i<35;i++){const s=document.createElement("span");s.className="old-confetti";s.textContent=["✨","🎉","⭐"][i%3];s.style.left=Math.random()*100+"vw";s.style.animationDelay=Math.random()*.5+"s";s.style.fontSize=(16+Math.random()*25)+"px";fx.appendChild(s);setTimeout(()=>s.remove(),2500)}}
function originalJackpot10(prize){const o=$("jackpotOverlay");if(!o)return;$("jackpotAmount").textContent=points(prize).toLocaleString("ja-JP");$("jackpotLabel").textContent=prize>=100?"💎 超大当たり！！ 💎":"🔥 大当たり！！ 🔥";$("jackpotBang").textContent=prize>=100?"！！！ JACKPOT ！！！":"！！！";o.classList.remove("show");void o.offsetWidth;o.classList.add("show");o.setAttribute("aria-hidden","false");if(prize>=100)playAudio("audio100old");else playAudio("audio10old");originalCelebrate10();setTimeout(()=>{o.classList.remove("show");o.setAttribute("aria-hidden","true")},2150)}
function v41Jackpot500(){const root=$("v41Jackpot"),coins=$("v41Coins");if(!root)return;root.hidden=false;root.classList.remove("v42-cut","v42-dot","reveal","finish");void root.offsetWidth;setTimeout(()=>{v44Play500Sound("win_500_puchun.wav",.95);root.classList.add("v42-cut")},120);setTimeout(()=>root.classList.add("v42-dot"),1820);setTimeout(()=>{v44Play500Sound("win_500_jackpot.wav",1);root.classList.add("reveal");if(coins){coins.innerHTML="";for(let i=0;i<42;i++){const s=document.createElement("i");s.textContent=i%6===0?"◆":"●";s.style.setProperty("--x",(Math.random()*190-95)+"vw");s.style.setProperty("--d",(Math.random()*.65)+"s");s.style.setProperty("--r",(Math.random()*900-450)+"deg");coins.appendChild(s)}}},2420);setTimeout(()=>root.classList.add("finish"),5200);setTimeout(()=>{root.hidden=true;root.classList.remove("v42-cut","v42-dot","reveal","finish")},5750)}
function v43GemOmen(button,after){const r=button?.getBoundingClientRect(),gem=document.createElement("div");gem.className="v43-gem-omen";gem.innerHTML='<span class="v43-gem">◆</span><i></i><b>！？</b>';if(r){gem.style.left=(r.left+r.width/2)+"px";gem.style.top=(r.top+r.height*.42)+"px"}else{gem.style.left="50vw";gem.style.top="50vh"}document.body.appendChild(gem);v44Play500Sound("win_500_gem.wav",.9);setTimeout(()=>gem.classList.add("charge"),180);setTimeout(()=>{gem.remove();after?.()},850)}
function legacyPrizeEffect(button,prize){
  soundDig();
  if(prize<=0){setTimeout(soundMiss,260);return}
  if(prize>=500){v43GemOmen(button,()=>v41Jackpot500());return}
  if(prize>=10){setTimeout(()=>originalJackpot10(prize),260);return}
  setTimeout(()=>{playAudio("audio1old");showReward(prize)},260);
}
document.addEventListener("pointerdown",unlockGameAudio,{once:true});
document.addEventListener("keydown",unlockGameAudio,{once:true});


// V88-45 — energy empty recovery popup. Ad hook is reserved for the next step.
let energyEmptyShownForThisZero=false;
function energyRecoveryInfo(){
  const e=Math.max(0,Math.min(20,Number(serverEnergy||0)));
  const first=Math.max(0,Number(nextSeconds||0));
  const missing=Math.max(0,20-e);
  const fullSeconds=missing<=0?0:first+Math.max(0,missing-1)*15*60;
  const fullAt=new Date(Date.now()+fullSeconds*1000);
  const hh=String(fullAt.getHours()).padStart(2,"0"), mm=String(fullAt.getMinutes()).padStart(2,"0");
  return {first,fullAtText:`${hh}:${mm}ごろ`};
}
function paintEnergyEmptyModal(){
  const modal=$("energyEmptyModal");if(!modal||modal.hidden)return;
  const info=energyRecoveryInfo(),m=Math.floor(info.first/60),s=info.first%60;
  $("energyEmptyNext").textContent=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  $("energyEmptyFull").textContent=info.fullAtText;
}
function showEnergyEmptyModal(){
  const modal=$("energyEmptyModal");if(!modal||energyEmptyShownForThisZero)return;
  energyEmptyShownForThisZero=true;modal.hidden=false;modal.setAttribute("aria-hidden","false");paintEnergyEmptyModal();
}
function closeEnergyEmptyModal(){const modal=$("energyEmptyModal");if(!modal)return;modal.hidden=true;modal.setAttribute("aria-hidden","true")}
document.addEventListener("click",e=>{if(e.target?.id==="energyEmptyClose"||e.target?.classList?.contains("energy-empty-backdrop"))closeEnergyEmptyModal()});

document.addEventListener("submit",async e=>{
  if(e.target?.id!=="nicknameForm")return;e.preventDefault();
  const err=$("nicknameError"),btn=e.target.querySelector("button");if(err)err.textContent="";if(btn)btn.disabled=true;
  try{await saveNickname($("nicknameInput")?.value);setMessage(`🏴‍☠️ ${playerNickname} として争奪戦に参加！`)}catch(ex){if(err)err.textContent=ex?.message||String(ex)}finally{if(btn)btn.disabled=false}
});

async function dig(cellIndex,button){
  if(digBusy||!island)return;
  if(serverEnergy<=0&&bonusTaps<=0){setMessage("⚡ タップ回数切れ。回復を待とう");return}
  digBusy=true;ownDigCell=cellIndex;
  unlockGameAudio();
  document.querySelectorAll(".demo-chest:not(.demo-dug)").forEach(b=>b.disabled=true);
  setMessage("⛏️ サーバーで判定中…");
  try{
    const d=await req("/rest/v1/rpc/dig_treasure",{method:"POST",body:JSON.stringify({p_island_id:island.island_id,p_cell_index:cellIndex})});
    const x=Array.isArray(d)?d[0]:d;if(!x)return;
    const energyBeforeDig=serverEnergy;
    serverEnergy=Number(x.new_energy??serverEnergy);
    const energyJustEmptied=energyBeforeDig>0&&serverEnergy<=0;
    paintEnergy();
    if(serverEnergy>0)energyEmptyShownForThisZero=false;

    if(x.result==="no_energy"){
      setMessage("⚡ エネルギー切れ");await loadStatus();return;
    }
    if(x.result==="already_opened"){
      setMessage("誰かに先を越された！エネルギー消費なし");
      await loadCells(true);return;
    }
    if(x.result==="island_finished"&&!x.success){
      setMessage("🏁 この島は探索終了！");
      await Promise.all([resolveIsland(),loadStatus()]);await loadCells();return;
    }

    playOpenTransition(button);
    const prize=Number(x.prize||0);
    legacyPrizeEffect(button,prize);
    postBattleEvent(cellIndex,prize);
    const gotTicket=x.result==="golden_ticket"||x.result==="island_finished_ticket";
    ctAnalytics?.event("treasure_open",{difficulty,generation:Number(island?.generation||wantedGeneration||0),result:String(x.result||"unknown"),hit:prize>0?"yes":"no",prize_points:points(prize),golden_ticket:gotTicket?"yes":"no"});
    if(prize>0)ctAnalytics?.event("treasure_win",{difficulty,prize_points:points(prize)});
    if(gotTicket)ctAnalytics?.event("golden_ticket_get",{difficulty});

    if(x.new_balance!=null)$("wallet").textContent=pointText(x.new_balance);
    if(gotTicket){setMessage("🎫 黄金島の採掘権を発見！");showTicket()}
    else if(prize>0){setMessage(`🎉 ${pointText(prize)} GET！`)}
    else setMessage("💨 ハズレ！次の宝箱へ");

    setTimeout(()=>removeOpenedChest(button),520);
    await new Promise(r=>setTimeout(r,700));
    await Promise.all([loadStatus(),loadCells(true)]);
    if(energyJustEmptied)showEnergyEmptyModal();

    if(x.result==="island_finished"||x.result==="island_finished_ticket"){
      setMessage(gotTicket?"🏁 黄金チケット発見！この島の探索は終了！":"🏁 最後の宝発見！この島の探索は終了！");
      setTimeout(()=>location.href="index.html#islandSelect",1800);
    }
  }catch(e){showError(e);setMessage("通信エラー。もう一度試してね")}
  finally{
    digBusy=false;
    renderBoard();
  }
}

async function boot(){
  try{
    await ensureAuth();
    await Promise.all([resolveIsland(),loadStatus()]);
    await loadCells();
    await Promise.all([loadNickname(),loadBattleEvents()]);
    startCountdown();
    clearInterval(pollTimer);
    pollTimer=setInterval(()=>Promise.all([loadCells(true),loadBattleEvents()]).catch(console.error),1000);
    ctStartRealtime();
  }catch(e){showError(e);setMessage("島を読み込めませんでした")}
}
window.addEventListener("ct:bgm-volume",(e)=>{
  const a=ctEnsureBgm();
  const v=Math.max(0,Math.min(1,Number(e.detail)));
  a.volume=v;
  if(v<=0){a.pause();return;}
  ctBgmUnlocked=true;
  a.play().catch(()=>{});
});

document.addEventListener("visibilitychange",()=>{if(!document.hidden)Promise.all([loadStatus(),loadCells(true)]).catch(console.error)});
boot();


// V88-59: Supabase Realtime (treasure cells + battle events)
// Polling remains as fallback.
let ctRealtimeSocket=null;
let ctRealtimeHeartbeat=null;
let ctRealtimeRef=1;
let ctRealtimeTopic=null;

function ctRealtimeSend(event,payload={},topic=ctRealtimeTopic){
  if(!ctRealtimeSocket || ctRealtimeSocket.readyState!==WebSocket.OPEN || !topic)return;
  ctRealtimeSocket.send(JSON.stringify({
    topic,event,payload,
    ref:String(ctRealtimeRef++),
    join_ref:"1"
  }));
}
function ctStopRealtime(){
  if(ctRealtimeHeartbeat){clearInterval(ctRealtimeHeartbeat);ctRealtimeHeartbeat=null;}
  if(ctRealtimeSocket){try{ctRealtimeSocket.close()}catch{} ctRealtimeSocket=null;}
  ctRealtimeTopic=null;
}
function ctStartRealtime(){
  if(!island?.island_id || !accessToken)return;
  ctStopRealtime();

  const projectHost=String(SUPABASE_URL).replace(/^https?:\/\//,"").replace(/\/+$/,"");
  const wsUrl="wss://"+projectHost+"/realtime/v1/websocket?apikey="+encodeURIComponent(SUPABASE_KEY)+"&vsn=1.0.0";
  const socket=new WebSocket(wsUrl);
  ctRealtimeSocket=socket;
  const islandId=String(island.island_id);
  const topic="realtime:click-treasure-"+islandId;
  ctRealtimeTopic=topic;

  socket.onopen=()=>{
    socket.send(JSON.stringify({
      topic,
      event:"phx_join",
      payload:{
        config:{
          broadcast:{self:false},
          presence:{enabled:false},
          postgres_changes:[
            {event:"UPDATE",schema:"public",table:"treasure_cells",filter:"island_id=eq."+islandId},
            ...(ctBattleIslandKey()?[{event:"INSERT",schema:"public",table:"battle_events",filter:"island_id=eq."+ctBattleIslandKey()}]:[])
          ],
          private:false
        },
        access_token:accessToken
      },
      ref:"1",
      join_ref:"1"
    }));
    ctRealtimeHeartbeat=setInterval(()=>{
      if(socket.readyState===WebSocket.OPEN){
        socket.send(JSON.stringify({topic:"phoenix",event:"heartbeat",payload:{},ref:String(ctRealtimeRef++)}));
      }
    },25000);
  };

  socket.onmessage=async(ev)=>{
    let msg; try{msg=JSON.parse(ev.data)}catch{return}
    if(msg.event==="postgres_changes"){
      const data=msg.payload?.data || msg.payload;
      const table=data?.table || data?.relation?.table || data?.schema && data?.table;
      // Supabase protocol can omit table in some payload variants;
      // inspect record shape as a safe fallback.
      const rec=data?.record || data?.new || {};
      if(table==="battle_events" || ("nickname" in rec && "cell_index" in rec)){
        await loadBattleEvents().catch(console.error);
      }else{
        await loadCells(true).catch(console.error);
      }
    }
  };
  socket.onerror=(e)=>console.warn("Realtime socket error",e);
  socket.onclose=()=>{
    if(ctRealtimeHeartbeat){clearInterval(ctRealtimeHeartbeat);ctRealtimeHeartbeat=null;}
    // automatic reconnect while still on an island
    if(island?.island_id) setTimeout(()=>ctStartRealtime(),1800);
  };
}

window.addEventListener("load",()=>setTimeout(()=>{if(island?.island_id)ctStartRealtime()},1800));

// V88-63: remove stale battle messages even when no new dig occurs.
setInterval(()=>{
  if(!Array.isArray(battleEvents)||!battleEvents.length)return;
  const before=battleEvents.length;
  battleEvents=battleEvents.filter(e=>{
    if(!e.createdAt)return true;
    return Date.now()-new Date(e.createdAt).getTime()<=30000;
  }).slice(0,5);
  if(battleEvents.length!==before)renderBattleFeed();
},1000);


// V88-64: Island BGM
const CT_BGM_ENABLED_KEY="ct_bgm_enabled";
const CT_BGM_VOLUME=0.15;
const CT_BGM_TRACKS={
  easy:"./assets/bgm/easy.mp3",
  normal:"./assets/bgm/normal.mp3",
  hard:"./assets/bgm/hard.mp3"
};
let ctBgm=null;
let ctBgmUnlocked=false;

function ctBgmEnabled(){
  return localStorage.getItem(CT_BGM_ENABLED_KEY)!=="0";
}
function ctUpdateBgmButton(){
  const b=document.getElementById("ctBgmToggle");
  if(b)b.textContent=ctBgmEnabled()?"🔊 BGM ON":"🔇 BGM OFF";
}
function ctEnsureBgm(){
  if(ctBgm)return ctBgm;
  const src=CT_BGM_TRACKS[difficulty]||CT_BGM_TRACKS.easy;
  ctBgm=new Audio(src);
  ctBgm.loop=true;
  ctBgm.preload="auto";
  ctBgm.volume=ctGetBgmVolume();
  return ctBgm;
}
function ctTryStartBgm(){
  ctBgmUnlocked=true;
  if(!ctBgmEnabled())return;
  const a=ctEnsureBgm();
  a.volume=ctGetBgmVolume();
  a.play().catch(()=>{});
}
function ctToggleBgm(e){
  if(e){e.preventDefault();e.stopPropagation();}
  const next=!ctBgmEnabled();
  localStorage.setItem(CT_BGM_ENABLED_KEY,next?"1":"0");
  ctUpdateBgmButton();
  const a=ctEnsureBgm();
  if(next){
    ctBgmUnlocked=true;
    a.volume=ctGetBgmVolume();
    a.play().catch(()=>{});
  }else{
    a.pause();
  }
}
function ctInstallBgmUi(){
  if(document.getElementById("ctBgmToggle"))return;
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

  btn.addEventListener("click",ctToggleBgm);
  document.body.appendChild(btn);
  ctUpdateBgmButton();
  const a=ctEnsureBgm();
  if(ctBgmEnabled()){
    a.volume=ctGetBgmVolume();
    a.play().then(()=>{ ctBgmUnlocked=true; }).catch(()=>{});
  }
}
document.addEventListener("DOMContentLoaded",ctInstallBgmUi);

// ブラウザがページ表示直後の音声再生を止めた場合も、
// 最初の画面操作でBGMを自動開始する（BGMボタン操作は不要）。
document.addEventListener("pointerdown",ctTryStartBgm,{once:true,capture:true});
document.addEventListener("touchstart",ctTryStartBgm,{once:true,capture:true,passive:true});
document.addEventListener("click",ctTryStartBgm,{once:true,capture:true});
document.addEventListener("keydown",ctTryStartBgm,{once:true,capture:true});
document.addEventListener("visibilitychange",()=>{
  if(!ctBgm)return;
  if(document.hidden)ctBgm.pause();
  else if(ctBgmUnlocked&&ctBgmEnabled())ctBgm.play().catch(()=>{});
});


document.addEventListener("DOMContentLoaded",()=>{const b=document.getElementById("ctBgmToggle");if(b)b.remove();ctApplyMediaSeVolume();});
