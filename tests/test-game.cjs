// State-level regression tests for the single-file app. No network, microphone or AI calls.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const baseline = require('./fixtures/v14-content.json');
const hash = value => require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex');
const file = process.argv[2] || path.join(root, 'index.html');
const FIXED_NOW = new Date('2026-10-23T09:00:00+09:00').getTime();
const passed = [], failed = [];
function fixture(filename = file, seed = {}, now = FIXED_NOW) {
  const nodes = new Map(), saved = new Map(Object.entries(seed)), timers = [], alerts = [];
  function node(id) {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, { innerHTML:'', textContent:'', value:'', style:{setProperty(){}}, dataset:{},
        classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>{if(on===undefined)on=!classes.has(x);on?classes.add(x):classes.delete(x);return on}},
        insertAdjacentHTML(where,html){this.innerHTML=where==='afterbegin'?html+this.innerHTML:this.innerHTML+html},
        scrollIntoView(){},querySelectorAll:()=>[],querySelector:()=>node(id+' child'),addEventListener(){},setAttribute(){},appendChild(){},remove(){},click(){} });
    }
    return nodes.get(id);
  }
  class Clock extends Date { constructor(...args){super(...(args.length?args:[now]))} static now(){return now} }
  const localStorage = {getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,String(v)),removeItem:k=>saved.delete(k),clear:()=>saved.clear()};
  class Reader { readAsText(file){this.result=file.content;this.onload()} }
  const ctx = vm.createContext({console,localStorage,document:{getElementById:node,querySelectorAll:()=>[],querySelector:node,createElement:node,body:node('body'),addEventListener(){}},
    window:{scrollTo(){},speechSynthesis:{getVoices:()=>[],cancel(){},speak(){}}},navigator:{},SpeechSynthesisUtterance:function(){},
    setTimeout:(f)=>{timers.push(f);return timers.length},clearTimeout(){},setInterval:()=>0,clearInterval(){},Date:Clock,Math,JSON,Set,Map,Blob,URL,FileReader:Reader,
    confirm:()=>true,alert:m=>alerts.push(m),prompt:()=>null});
  ctx.window.document=ctx.document;ctx.window.localStorage=localStorage;ctx.speechSynthesis=ctx.window.speechSynthesis;
  const html=fs.readFileSync(filename,'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],ctx,{filename});
  const run=s=>vm.runInContext(s,ctx);
  const json=s=>JSON.parse(JSON.stringify(run(s)));
  return {run,json,node,saved,ctx,timers,alerts};
}
async function test(name, fn) {try {await fn();passed.push(name);console.log('PASS',name)}catch(e){failed.push(name);console.error('FAIL',name,e.message)}}
const answer = 'Last weekend I visited a quiet park with my family. We enjoyed the fresh air and I felt relaxed. In the past I stayed home more often, but now I try to go outside because it helps me feel better. In the end we had a wonderful time.';
async function main() {
 await test('original 132 cards and 44 expressions unchanged from production v14.1',()=>{
   const a=fixture();
   assert.equal(a.run('DEFAULT_CARDS.length'),137);assert.equal(a.run('exAll().length'),49);
   assert.equal(hash(a.json('DEFAULT_CARDS.filter(c=>c.set!=="v15")')),baseline.cardsSha256);assert.equal(hash(a.json('exAll().filter(c=>c.cat!=="repair")')),baseline.expressionsSha256);
 });
 await test('original Telegram stories in relative order and Day3 unchanged',()=>{
   const f=fixture(),bot=baseline.botTitles;
   assert.deepEqual(f.json('botOrder().filter(c=>c.set!=="v15").map(c=>c.title)'),bot);
   assert.equal(f.run('todayStory().day'),3);assert.equal(f.run('todayStory().card.title'),bot[2]);
 });
 await test('default routine bounded to 3 cards and 2 new cards',()=>{
   const f=fixture();f.run('examState.date="";delete dayRec().qv');assert(f.run('todayCardQueue().length<=3'));assert(f.run('todayCardQueue().filter(c=>srsOf(ck(c)).box===0).length<=2'));
   assert.equal(f.run('ck(todayCardQueue()[0])'),f.run('ck(todayStory().card)'));
 });
 await test('v14.1 same-day queue migration caps workload and preserves completed card',()=>{
   const f=fixture();f.run(`{const r=dayRec();r.cq=CARD_DATA.filter(c=>ck(c)!==ck(todayStory().card)).slice(0,3).map(ck);r.cd=[r.cq[0]];delete r.qv;todayCardQueue()}`);
   assert(f.run('dayRec().cq.length<=3'));assert.equal(f.run('dayRec().cd.length'),1);assert(f.run('dayRec().cq.includes(dayRec().cd[0])'));
   assert(f.run('todayCardQueue().filter(c=>srsOf(ck(c)).box===0).length<=2'));
 });
 await test('finished same-day routine is not reopened or injected with cards',()=>{
   const f=fixture();f.run(`{const r=dayRec();r.s={expr:true,card:true,speak:true};r.cq=['kept'];r.cd=['kept'];delete r.qv;todayCardQueue()}`);
   assert.deepEqual(f.json('dayRec().cq'),['kept']);assert.equal(f.run('nextStepId()'),null);
 });
 await test('return day migrates old queue to one easy card and only two steps',()=>{
   const f=fixture();f.run(`daily={days:{'2026-10-20':{a:1,s:{}}}};{const r=dayRec();r.cq=CARD_DATA.slice(0,3).map(ck);r.cd=[];srs[r.cq[0]]={box:3,due:twTodayKey(),n:3};srs[r.cq[1]]={box:1,due:twTodayKey(),n:1};todayCardQueue()}`);
   assert(f.run('gameComeback()'));assert.equal(f.run('todayCardQueue().length'),1);assert.equal(f.run('srsOf(ck(todayCardQueue()[0])).box'),3);
   assert.equal(f.run('exprRoutineQueue().length'),3);assert.deepEqual(f.json('stepInfo().map(s=>s.id)'),['expr','card']);
   f.run(`completeStep('expr');completeStep('card')`);assert(f.run('dayFull(twTodayKey())'));assert.equal(f.run('nextStepId()'),null);assert(!f.run('!!dayRec().s.speak'));
 });
 await test('valid calendar dates only, including leap-year boundaries',()=>{
   const f=fixture();assert(f.run(`gameValidDate('2024-02-29')`));for(const d of ['2026-02-29','2026-02-31','2026-99-99','2026-00-00','garbage'])assert(!f.run(`gameValidDate('${d}')`));
   f.run(`gameState.startDate='2026-99-99'`);assert.equal(f.run('gameStartDate()'),'2026-10-21');assert(f.run('!!todayStory().card'));
 });
 await test('date correction preserves completed steps and card workload limit',()=>{
   const f=fixture();f.ctx.prompt=()=> '2026-10-20';f.run('gameSetStartDate()');assert.equal(f.run('todayStory().day'),4);assert(f.run('dayRec().cq.length<=3'));
   f.run('dayRec().s.card=true');const before=f.json('dayRec().cq');f.ctx.prompt=()=> '2026-10-19';f.run('gameSetStartDate()');assert.deepEqual(f.json('dayRec().cq'),before);
 });
 await test('30-second quest counts activity once without changing SRS',()=>{
   const f=fixture(),before=f.json('srs');f.run('gameQuestDone();gameQuestDone()');assert.equal(f.run('dayRec().a'),1);assert.deepEqual(f.json('srs'),before);assert(f.run('gameState.quest30[twTodayKey()]'));
 });
 await test('legacy v13/v14 memory records migrate without loss',()=>{
   const f=fixture();f.run(`localStorage.setItem(LS_PROG,JSON.stringify({[ck(CARD_DATA[0])]:'ok'}));localStorage.removeItem(LS_SRS);loadState();srsLoad()`);assert.equal(f.run('srsOf(ck(CARD_DATA[0])).box'),2);
   f.run(`localStorage.setItem(LS_MEM,JSON.stringify({v:140,cards:{keep:{parts:{0:{ok:2}},runs:3}},followups:[{key:ck(CARD_DATA[0]),kind:'next',at:Date.now()+100000,done:false}],expr:{keep:1}}));memLoad()`);
   assert.equal(f.run('memState.cards.keep.runs'),3);assert(f.run('memState.followups[0].done'));assert.equal(f.run('memState.expr.keep'),1);
 });
 await test('full routine; script hint holds promotion; final practice does not regrade',async()=>{
   const f=fixture();f.run(`startStep('expr');{let n=0;while(exCur&&n++<20){exReveal();exGrade(2)}}`);assert(f.run('dayRec().s.expr'));
   f.run(`startStep('card');globalThis.testKey=ck(memCard());openHint(3);memGradeWhole('ok')`);assert.equal(f.run('srsOf(testKey).box'),1);assert.equal(f.run('srsOf(testKey).nh'),0);
   f.run(`{let n=0;while(['parts','weak'].includes(memPhase)&&n++<50){if(memPartMode==='new'&&memPhase==='parts'&&memStage<3)memAdvance();else memPartGrade('ok',false)}}`);
   assert.equal(f.run('memPhase'),'whole2');f.run('memFinish()');assert.equal(f.run('srsOf(testKey).box'),1);
   f.run(`{let n=0;while(todayCardQueue().length&&n++<10)memGradeWhole('ok')}`);assert(f.run('dayRec().s.card'));
   f.run(`startStep('speak');twMode='text'`);f.node('twAnswer').value=answer;await f.run('submitTwist()');assert(!f.run('!!dayRec().s.speak'));
   f.run('twRetrySame()');f.node('twAnswer').value=answer;await f.run('submitTwist()');assert(f.run('dayFull(twTodayKey())'));
 });
 await test('early repeat never promotes; review chunks start in Korean; followup no rebooking',()=>{
   const f=fixture();f.run(`currentCat='all';cardIdx=0;showCard();globalThis.k=ck(memCard());srs[k]={box:3,due:dAdd(twTodayKey(),3),nh:2};srsGrade(k,'ok',0)`);assert.equal(f.run('srsOf(k).box'),3);
   f.run(`memGradeWhole('mid')`);assert.equal(f.run('memPartMode'),'review');assert.equal(f.run('memStage'),3);
   assert(!f.node('memBody').innerHTML.includes('class="mem-en"'));
   f.run(`memState.followups=[{key:k,kind:'10m',at:Date.now()-1000,done:false}];currentCat='mem';cardIdx=0;memResetSession();showCard();memGradeWhole('ok')`);
   assert.equal(f.run('memState.followups.length'),1);assert(f.run('memState.followups[0].done'));
 });
 await test('recall scheduling: 10 minutes plus >=3h evening; no late-night reservation',()=>{
   const f=fixture();f.run(`memState.followups=[];memSchedule('x',new Date(2026,9,23,8).getTime())`);assert.equal(f.run(`new Date(memState.followups.find(f=>f.kind==='night').at).getHours()`),20);
   f.run(`memState.followups=[];memSchedule('x',new Date(2026,9,23,21).getTime())`);assert.equal(f.run('memState.followups.length'),1);
 });
 await test('mission cannot pass keyword-only / angle-only / missing-angle answer',()=>{
   const f=fixture();f.run(`gameMissionStart('home')`);
   f.run(`gameMissionResult({checks:[{id:'angle',pass:true}]},{wc:3,isAI:false})`);assert(!f.run('!!gameState.missions.home'));
   f.run(`gameMissionResult({checks:[{id:'angle',pass:true}]},{wc:60,isAI:false})`);assert(!f.run('!!gameState.missions.home'));
   f.run(`gameMissionResult({checks:[{id:'detail',pass:true},{id:'reason',pass:true},{id:'closing',pass:true}]},{wc:60,isAI:false})`);assert(!f.run('!!gameState.missions.home'));
 });
 await test('45-second mission passes real structured answer; repeated submit has no extra celebration; reset 90sec',async()=>{
   const f=fixture();f.run(`gameMissionStart('home');twMode='text'`);assert.equal(f.run('TW_TOTAL'),45);
   f.node('twAnswer').value='If I could redesign one room I would choose my living room because we spend so much time there. I would add a comfortable sofa and could make a quiet reading corner for my family. In the end it would feel much more relaxing.';
   // Select a hypothetical mission independent of date while retaining real local scoring.
   f.run(`twTwist.id='hypo';gameMission.tid='hypo'`);await f.run('submitTwist()');assert(f.run('!!gameState.missions.home'));assert.equal(f.run('gameState.missions.home.mode'),'structure');
   const toastN=f.run('gameToastQ.length');await f.run('submitTwist()');assert.equal(f.run('gameToastQ.length'),toastN);
   f.run('twNewCombo()');assert.equal(f.run('TW_TOTAL'),90);assert.equal(f.run('twTimeLeft'),90);assert.equal(f.run('gameMission'),null);
 });
 await test('map stages and rewards persist after card regression; each place filters correctly',()=>{
   const f=fixture();f.run(`CARD_DATA.filter(c=>gamePlaceOf(c)==='home').slice(0,3).forEach(c=>srs[ck(c)]={box:3,nh:2,n:3});gameState.missions.home={day:twTodayKey()};gameCheck(true)`);assert.equal(f.run('gameState.places.home'),3);
   f.run(`gameState.rewards=[{id:'r1',text:'디저트',type:'conquer',n:1}];gameRewardCheck(true);gameRewardClaim('r1');srs={};gameCheck(true)`);assert.equal(f.run('gamePlaceStats().home.best'),3);assert(f.run('gameState.rewards[0].claimed'));
   f.run(`gameOpenPlace('home')`);assert(f.run(`filteredCards().every(c=>gamePlaceOf(c)==='home')`));assert(f.run(`filteredCards().length>0`));
 });
 await test('backups include game and exclude credentials; old restore clears stale badges and rewards',()=>{
   const f=fixture();assert(f.run('BACKUP_KEYS().includes(LS_GAME)'));assert(!f.run('BACKUP_KEYS().includes(LS_CFG)'));
   f.run(`gameState.places.home=3;gameState.rewards=[{id:'old',text:'old',type:'conquer',n:1}];gameSave();gameMissionStart('home')`);
   const data={opic_cardsrs_v1:'{}',opic_daily_v1:'{"days":{}}',opic_progress_v1:'{}',opic_usercards_v1:'[]',opic_twist_v1:'{"days":{}}',opic_expr_v1:'{}'};
   f.ctx.restoreInput={files:[{content:JSON.stringify({app:'opic-al-trainer',version:14,data})}],value:'x'};
   f.run('importAll(restoreInput)');assert.equal(f.run('gameState.rewards.length'),0);assert.equal(f.run('gameState.places.home||0'),0);assert.equal(f.run('gameMission'),null);
 });
 const report={passed,failed,total:passed.length+failed.length};
 fs.writeFileSync(path.join(root,'test-results.json'),JSON.stringify(report,null,2));
 console.log(`${passed.length}/${report.total} checks passed`);if(failed.length)process.exitCode=1;
}
if (require.main === module) main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={fixture};
