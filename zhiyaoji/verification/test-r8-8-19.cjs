const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=process.env.ZHIYAOJI_TEST_APP||(fs.existsSync(path.join(__dirname,'r8_8_19'))?path.join(__dirname,'r8_8_19'):path.join(__dirname,'../app'));
const code=fs.readFileSync(path.join(base,'reading-continuity.js'),'utf8'),bundle=fs.readFileSync(path.join(base,'bundle.js'),'utf8');
let frames=[],now=0,saved=0,down=0,pulses=0,removed=0,body=null,overlay=null;
const canvas={getBoundingClientRect:()=>({left:0,right:500,top:50,bottom:600})},view={alive:true,visible:true,enabled:true,canvas,scroll:{isConnected:true,getBoundingClientRect:()=>({height:500})},down(e){down++;this.lastPointer=e.pointerId},invalidate(){}};
class Exam{
 constructor(){this.layers=new Map([['q',view]]);this.root={font:'18px',querySelectorAll:()=>[],style:{getPropertyValue:()=>this.root.font}};this.s={paused:false,finished:false};this.inkOn=true;this.selectedSize='18px';}
 applyPreferences(){this.root.font=this.selectedSize;}
 closeAnswerCard(){body=null;this.cardOpen=false;}
 openAnswerCard(){if(this.cardOpen){this.closeAnswerCard();return;}body={scrollTop:0,scrollLeft:0};this.cardOpen=true;}
 render(){}showPauseCover(){}capturePosition(){this.captured=true;}
 pulse(){pulses++;this.s.paused=true;this.s.pauseReason='idle';}
}
const S={ExamController:Exam,compactControlHit:()=>false,icon:()=>'<svg/>',$:(selector)=>selector.includes('answer-body')?body:selector==='.pause-overlay'?overlay:null,captureReadingAnchor(v){v.readingAnchor={node:{isConnected:true},offset:123};},restoreReadingAnchor(v){v.restored=v.readingAnchor.offset;},idleExpired:()=>true,resumeActiveClock(s){s.paused=false;s.pauseReason=null;now++},saveSoon(){saved++}};
const context=vm.createContext({window:{Study:S},document:{hidden:false},performance:{now:()=>100},Date,requestAnimationFrame:f=>frames.push(f)});vm.runInContext(code,context);
const exam=new Exam();exam.selectedSize='20px';view.visible=false;exam.applyPreferences();assert.equal(view.restored,123);assert.ok(exam.captured);for(let i=0;i<3;i++){const fs=frames;frames=[];fs.forEach(f=>f());}assert.equal(view.restored,123);view.visible=true;
exam.openAnswerCard();body.scrollTop=361;body.scrollLeft=12;exam.closeAnswerCard();exam.openAnswerCard();assert.equal(body.scrollTop,361);assert.equal(body.scrollLeft,12);for(const f of frames.splice(0))f();assert.equal(body.scrollTop,361);
let prevented=0,stopped=0;const event=target=>({type:'pointerdown',pointerType:'pen',pointerId:7,clientX:200,clientY:100,target,preventDefault(){prevented++},stopImmediatePropagation(){stopped++}});
// Late pen event before delayed timer fires: resume then allow the original canvas down.
assert.equal(S.resumeIdlePen(exam,event(canvas)),true);assert.equal(pulses,1);assert.equal(exam.s.paused,false);assert.equal(down,0);assert.equal(stopped,0);
// Timer already created an overlay: explicitly forward exactly one original event.
exam.s.paused=true;exam.s.pauseReason='idle';overlay={remove(){removed++}};assert.equal(S.resumeIdlePen(exam,event({})),true);assert.equal(down,1);assert.equal(view.lastPointer,7);assert.equal(stopped,1);assert.equal(removed,1);
for(const reason of ['manual','background','return']){exam.s.paused=true;exam.s.pauseReason=reason;assert.equal(S.resumeIdlePen(exam,event(canvas)),false);}assert.equal(down,1);
exam.s.pauseReason='idle';assert.equal(S.resumeIdlePen(exam,{...event(canvas),pointerType:'touch'}),false);exam.editBlocked=true;assert.equal(S.resumeIdlePen(exam,event(canvas)),false);exam.editBlocked=false;
assert.equal(S.resumeIdlePen(exam,event({closest:()=>({})})),false);assert.equal(down,1);
const button={dataset:{exam:'pen'},getBoundingClientRect:()=>({left:0,right:30,top:0,bottom:30})};assert.equal(S.compactControlHit(button,2,2),true);assert.equal(S.compactControlHit(button,31,2),false);button.dataset.exam='exclude';assert.equal(S.compactControlHit(button,2,2),false);
// Exercise the real Notebook/Router so recovery leaves first point, dot strokes,
// append/undo/redo, and original coordinates intact.
const start=bundle.indexOf('(function(root){',bundle.indexOf('/*')+1);const inkMarker=bundle.indexOf('root.InkCore={Notebook,Router');const begin=bundle.lastIndexOf('(function(root)',inkMarker);const end=bundle.indexOf('})(typeof window',inkMarker);const inkCode=bundle.slice(begin,bundle.indexOf('\n',end));
assert.ok(begin>=0);vm.runInContext(inkCode,context);const {Notebook,Router}=context.window.InkCore,book=new Notebook(),router=new Router(book),geo={pane:{left:0,top:0,width:500,height:500},regions:[{key:'q:1',left:0,right:500,top:0,bottom:500,anchor:{left:0,top:0,width:500,height:500}}]};
router.begin({clientX:100,clientY:100,timeStamp:1},geo);router.move({clientX:120,clientY:130,timeStamp:2});router.finish();assert.equal(book.rows('q:1').length,1);assert.equal(book.rows('q:1')[0].points[0].x,.2);book.undo('q:1');assert.equal(book.rows('q:1').length,0);book.redo('q:1');assert.equal(book.rows('q:1').length,1);router.begin({clientX:40,clientY:50,timeStamp:3},geo);router.finish();assert.equal(book.rows('q:1')[1].points.length,1);
const css=fs.readFileSync(path.join(base,'reading-continuity.css'),'utf8');assert.match(css,/width:30px!important/);assert.match(css,/gap:10px/);assert.doesNotMatch(css,/data-exam="exclude"/);
const previous=path.join(base,'../r8_8_18/training-controls.css');if(fs.existsSync(previous))assert.equal(fs.readFileSync(path.join(base,'training-controls.css'),'utf8'),fs.readFileSync(previous,'utf8'));
console.log('PASS: font anchor with ink hidden; answer-card scroll restore; delayed/already-paused idle pen first-event recovery; manual/background/touch/lock guards; 30px note hit/unchanged exclusions; real Router first points/dot/undo/redo');
