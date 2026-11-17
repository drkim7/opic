const {fixture}=require('./test-game.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const now=date=>new Date(date+'T09:00:00+09:00').getTime();
const f=(date='2026-11-17',seed={})=>fixture(undefined,seed,now(date));
async function main(){
 const app=f();
 assert.equal(app.run("examDaysLeft()"),25);
 const bot=process.env.BOT_CONTENT ? JSON.parse(fs.readFileSync(process.env.BOT_CONTENT)).cards : require('./fixtures/bot-rotation.json');
 assert.deepEqual(app.json("botOrder().map(c=>c.title)"),bot.map(x=>x.title));
 assert.equal(app.run("todayStory().day"),28);
 assert.equal(app.run("todayStory().card.title"),'⛺ camping — 캠핑/폭우 에피소드');
 assert.equal(app.run("coreCards().length"),43);
 const expected=[['2026-11-18',28],['2026-11-20',30],['2026-11-22',32],['2026-11-24',34],['2026-11-26',36]];
 for(const [d,i] of expected) {
  const a=f(d); assert.equal(a.run("todayStory().card.title"),bot[i].title);
  assert.equal(a.run("mockQ(todayStory().card)"),bot[i].q);
 }
 const same=app.run("todayStory().card.title");
 app.run("examState.date='';"); assert.equal(app.run("todayStory().card.title"),same);
 const remember=f('2026-11-17', {opic_exam_v1:'{"date":""}'});
 assert.equal(remember.run('examDaysLeft()'),null);
 console.log('PASS all 137 shared stories, five confirmed dates, existing sequence, exam toggle and default');
 const initial=f(); assert.equal(initial.run('todayCardQueue()[0].set'),'v15');
 assert.equal(initial.run("exprRoutineQueue().filter(it=>it.cat==='repair').length"),1);
 assert(initial.run('exprRoutineQueue().length<=7'));
 for(const [d,limit] of [['2026-11-28',2],['2026-11-29',1],['2026-12-06',1],['2026-12-07',0],['2026-12-12',0]]) {
  const a=f(d); assert.equal(a.run('examNewLimit()'),limit);
  assert(a.run('todayCardQueue().filter(c=>!srsOf(ck(c)).box).length')<=limit);
 }
 const comeback=f('2026-12-09', {opic_daily_v1:'{"days":{"2026-12-05":{"a":1,"s":{"expr":true,"card":true}}}}'});
 assert.deepEqual(comeback.json('stepInfo().map(s=>s.id)'),['expr','card']); assert.equal(comeback.run('todayCardQueue().length'),0);
 console.log('PASS core-first queue, calm expression cap, D-13/D-5 boundaries including return');
 const short=f();short.run("mockStart('light')");
 assert(short.node('mockBody').innerHTML.includes('한 번 말했어요'));
 short.run('lightDone();lightRetry();lightDone()');
 assert.equal(short.run('dayRec().a'),1);assert.equal(short.run('dayRec().light'),true);
 assert.equal(short.run('examState.mocks.length'),0);assert(short.node('mockBody').innerHTML.includes('구체적인 디테일 하나'));
 short.run('goHome()');assert.equal(short.run('mock'),null);
 console.log('PASS score-free short practice, optional retry, one daily record');
 const m=f();for(let i=0;i<120;i++){
  const a=m.json("mockBuild('mini')"),b=m.json("mockBuild('full')");
  assert.equal(b.length,15);assert.equal(a.length,5);assert.equal(b[0].type,'intro');
  assert(a.concat(b).every(x=>x.q?.length>10));
 }
 const walk=m.json("mockCombo('walk',3)");
 assert(walk.every(x=>/walk|jog/.test(x.q.toLowerCase())));
 m.run("mockStart('mini');mockAsk();mockAnswer();mockStoreDraft('transcript one');");
 m.node('mockText').value='This is my first answer. I like this place because it feels quiet.';
 await m.run('mockNext()');
 m.run('mockAnswer()');assert.equal(m.run("mock.items[1].draft"),'');
 for(let i=1;i<5;i++){
  m.node('mockText').value='I went there with a friend. It was a nice place, and we enjoyed it.';
  await m.run('mockNext()');if(i<4)m.run('mockAnswer()');
 }
 assert.equal(m.run('examState.mocks[0].answered'),5);
 assert.equal(m.run('examState.mocks[0].grade'),'');
 assert(m.node('mockBody').innerHTML.includes('다음 연습 한 가지'));
 m.run('goHome()'); assert.equal(m.run('mock'),null);
 for(const oldTTS of m.timers){oldTTS();}
 assert.equal(m.run('mock'),null);
 console.log('PASS randomized mock lengths, topic alignment, complete mini mock, no stale callback on leaving');
}
main().catch(e=>{console.error(e);process.exitCode=1});
