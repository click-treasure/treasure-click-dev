const URL="https://osawhwcddovhddrxgfju.supabase.co", KEY="sb_publishable_AMGEh3TguYyEpd7piWIjTQ_oHlYdG8f";
let accessToken=localStorage.getItem("v261_access_token")||"";
const $=id=>document.getElementById(id);
function fail(e){$("error").hidden=false;$("error").textContent="エラー: "+(e?.message||e)}
async function req(path,options={}){const headers=Object.assign({apikey:KEY,"Content-Type":"application/json"},options.headers||{});if(accessToken)headers.Authorization="Bearer "+accessToken;const r=await fetch(URL+path,Object.assign({},options,{headers}));const t=await r.text();let d=null;try{d=t?JSON.parse(t):null}catch{d=t}if(!r.ok)throw new Error((d&&d.message)||(d&&d.error_description)||t||("HTTP "+r.status));return d}
async function rpc(name,body={}){return req('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(body)})}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function yen(n){return Number(n||0).toLocaleString('ja-JP')+'円'}
function pt(n){return (Number(n||0)*10).toLocaleString('ja-JP')+'P'}
function ptYen(n){return pt(n)+'（'+yen(n)+'相当）'}

async function loadPool(){
  const rows=await rpc('admin_get_prize_pool_summary',{});
  const list=Array.isArray(rows)?rows:[];
  const total=list.reduce((s,x)=>s+Number(x.total_value||0),0);
  const unallocated=list.reduce((s,x)=>s+Number(x.unallocated_value||0),0);
  const allocated=list.reduce((s,x)=>s+Number(x.allocated_value||0),0);
  const discovered=list.reduce((s,x)=>s+Number(x.discovered_value||0),0);
  const count=list.reduce((s,x)=>s+Number(x.total_count||0),0);
  $("poolTotal").textContent=ptYen(total);
  $("poolUnallocated").textContent=ptYen(unallocated);
  $("poolAllocated").textContent=ptYen(allocated);
  $("poolDiscovered").textContent=ptYen(discovered);
  $("poolCount").textContent=count.toLocaleString('ja-JP')+'本';
  $("poolInventory").innerHTML=list.length?list.map(x=>`
    <div class="prize-stock">
      <div class="yen">${ptYen(x.denomination)}</div>
      <div class="count">${Number(x.total_count).toLocaleString('ja-JP')}本</div>
      <div class="stock-meta">
        未配置 ${Number(x.unallocated_count).toLocaleString('ja-JP')}本<br>
        配置中 ${Number(x.allocated_count).toLocaleString('ja-JP')}本<br>
        発掘済み ${Number(x.discovered_count).toLocaleString('ja-JP')}本
      </div>
    </div>`).join(''):'<div class="inventory-loading">賞金プールがありません。</div>';
}

async function load(){
  try{
    $("error").hidden=true;
    const [rows]=await Promise.all([rpc('admin_list_redemptions',{}),loadPool()]);
    $("gate").hidden=true;
    $("panel").hidden=false;
    const list=Array.isArray(rows)?rows:[];
    $("pendingCount").textContent=list.filter(x=>x.status==='pending').length+'件';
    $("paidCount").textContent=list.filter(x=>x.status==='completed').length+'件';

    $("requests").innerHTML=list.length?list.map(x=>`
      <article class="request">
        <div>
          <div class="meta">
            <span>#${x.id}</span>
            <span>${esc(new Date(x.created_at).toLocaleString('ja-JP'))}</span>
            <span>${pt(x.amount)} → PayPay ${x.amount}円分</span>
          </div>
          <div class="dest"><b>PayPay ID：</b>${esc(x.payout_destination)}</div>
          <div class="status ${x.status==='completed'?'paid':'pending'}">${x.status==='completed'?'✓ 支払済み':'● 処理待ち'}</div>
          ${x.status==='completed'&&x.completed_at?`<div class="paid-at">支払完了：${esc(new Date(x.completed_at).toLocaleString('ja-JP'))}</div>`:''}
        </div>
        ${x.status==='pending'?`<button class="paid-btn" data-id="${x.id}" data-amount="${x.amount}" data-dest="${esc(x.payout_destination)}">支払済みにする</button>`:''}
      </article>`).join(''):'<div class="card">交換申請はまだありません。</div>';

    document.querySelectorAll('.paid-btn').forEach(b=>b.onclick=()=>markPaid(Number(b.dataset.id),Number(b.dataset.amount),b.dataset.dest,b));
  }catch(e){
    $("gateMsg").textContent='管理者として確認できませんでした。';
    fail(e)
  }
}

async function markPaid(id,amount,dest,b){
  const ok=confirm(
    '支払済み処理の最終確認\n\n' +
    '申請 #'+id+'\n' +
    '交換：'+pt(amount)+' → PayPay '+amount+'円分\n' +
    'PayPay ID：'+dest+'\n\n' +
    'このPayPay IDへの送金が実際に完了していることを確認しましたか？\n\n' +
    '※「OK」を押すとCLICK TREASURE上で支払済みになります。'
  );
  if(!ok)return;
  b.disabled=true;
  try{await rpc('admin_mark_redemption_paid',{p_request_id:id});await load()}
  catch(e){fail(e);b.disabled=false}
}

$("reload").onclick=load;
$("poolReload").onclick=async()=>{try{$("error").hidden=true;await loadPool()}catch(e){fail(e)}};
load();

// V59.1 FIXED: local-only business simulator.
function updateSimulator(){
  const num=id=>Math.max(0,Number($(id)?.value)||0);
  const mau=num('simMau'), taps=num('simTaps'), ads=num('simAds'), affiliate=num('simAffiliate');
  const reward=num('simReward'), treasure=num('simTreasure'), cost=num('simCost');
  const revenue=mau*(ads+affiliate), rewards=mau*reward, costs=mau*cost, profit=revenue-rewards-costs;
  const margin=revenue>0?(profit/revenue*100):0;
  const monthlyTaps=taps*30;
  const ev=monthlyTaps>0?treasure/monthlyTaps:0;
  $('simRevenue').textContent=yen(revenue); $('simRewardsTotal').textContent=yen(rewards);
  $('simProfit').textContent=(profit>=0?'+':'')+yen(profit);
  $('simProfit').className=profit>=0?'sim-profit-positive':'sim-profit-negative';
  $('simMargin').textContent=margin.toFixed(1)+'%'; $('simBreakEven').textContent=yen(reward+cost);
  $('simTapEv').textContent=ev.toFixed(3)+'円';
}
['simMau','simTaps','simAds','simAffiliate','simReward','simTreasure','simCost'].forEach(id=>$(id)?.addEventListener('input',updateSimulator));
updateSimulator();
