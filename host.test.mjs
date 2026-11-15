import assert from 'node:assert/strict';
import {AgentChatCreation,apply,summarizeSnapshot,messageText,seedMessages,planSummary,splitUtf8,prepareSummaryPlan,runSummaryPlan,recentContext,quickContextPrompt} from './index.js';
const parent={id:'parent'};
let calls=0;
let spec;
const ctx={agents:{get(id){return id===parent.id ? parent : undefined;}},subagents:{rootOf(agent){return agent;},getProvider(){return {prepareContinuable(){},inheritsParentContext:true};},resolveMaxDepth(){return 1;},async startActivation(input){calls++;spec=input;return {childId:input.childId,result:Promise.reject(Error('mock settlement'))};}},logger:{warn(){}}};
const operation=new AgentChatCreation(ctx);
const childContext={...ctx,subagents:{...ctx.subagents,rootOf(){return {id:'real-root'};}}};
assert.throws(()=>new AgentChatCreation(childContext).create({parentSessionId:'parent',requestId:'root_test_123',text:'hello'},parent,new AbortController().signal),/main subagent tree root/);
const signal=new AbortController().signal;
const args={parentSessionId:'parent',requestId:'request_123',text:'User first message'};
assert.throws(()=>operation.create({...args,text:' '},parent,signal),/nonempty/);
assert.equal(calls,0);
assert.throws(()=>operation.create(args,{id:'parent'},signal),/exact live/);
const [a,b]=await Promise.all([operation.create(args,parent,signal),operation.create(args,parent,signal)]);
assert.deepEqual(a,b);assert.equal(calls,1);assert.equal(a.status,'created');
assert.equal(spec.provider,'fork');assert.equal(spec.delivery,'parent');assert.equal(spec.parent,parent);
assert.equal(spec.prompt[0].text,args.text);assert.equal(spec.maxDepth,1);
assert.throws(()=>operation.create({...args,text:'Other'},parent,signal),/different content/);
await operation.create(args,parent,signal);assert.equal(calls,1);
ctx.subagents.startActivation=async()=>{calls++;throw Error('unknown transport failure');};
const uncertainArgs={...args,requestId:'uncertain_123'};
const uncertain=await operation.create(uncertainArgs,parent,signal);
assert.equal(uncertain.status,'uncertain');assert.equal(uncertain.retryable,false);
await operation.create(uncertainArgs,parent,signal);assert.equal(calls,2);
const restarted=new AgentChatCreation(ctx);
const missing=await restarted.create({...args,queryOnly:true},parent,signal);
assert.equal(missing.status,'uncertain');assert.equal(missing.retryable,false);assert.equal(calls,2);
const queryKnown=await operation.create({...args,queryOnly:true},parent,signal);
assert.deepEqual(queryKnown,a);assert.equal(calls,2);
let command,tool;
apply({...ctx,commands:{register(x){command=x;}},tools:{register(x){tool=x;}}});
const blank=await command.handler({rawInput:JSON.stringify({...args,text:''}),agent:parent,signal});
assert.equal(blank.kind,'error');assert.equal(JSON.parse(blank.text).status,'rejected');
assert.equal(tool.name,'agent_chat_create');assert.equal(command.name,'agent-chat-create');
const autoArgs={parentSessionId:'parent',requestId:'auto_summary_123',autoSummary:true};
let summaryCalls=0,spawnCalls=0;
const autoContext={...ctx,subagents:{...ctx.subagents,async startActivation(input){spawnCalls++;spec=input;return {childId:input.childId,result:Promise.resolve({})};}}};
const autoOperation=new AgentChatCreation(autoContext,async()=>{summaryCalls++;return {text:'factual handoff',route:{provider:'same-provider',model:'same-model'},usage:{inputTokens:100,outputTokens:10},inputBytes:100,maxTokens:3000};});
const [autoA,autoB]=await Promise.all([autoOperation.create(autoArgs,parent,signal),autoOperation.create(autoArgs,parent,signal)]);
assert.equal(autoA.status,'created');assert.deepEqual(autoA,autoB);assert.equal(summaryCalls,1);assert.equal(spawnCalls,1);
assert.equal(spec.provider,'spawn');assert.equal(spec.delivery,'caller');assert.ok(spec.name.startsWith('chat-'));assert.match(spec.prompt[0].text,/factual handoff/);assert.match(spec.prompt[0].text,/Do NOT execute historical tasks/);assert.deepEqual(spec.agentOptions,{provider:'same-provider',model:'same-model'});
const failedOperation=new AgentChatCreation(autoContext,async()=>{summaryCalls++;throw Error('summary failed');});
assert.equal((await failedOperation.create(autoArgs,parent,signal)).status,'uncertain');
await failedOperation.create(autoArgs,parent,signal);assert.equal(summaryCalls,2);assert.equal(spawnCalls,1);
assert.equal((await new AgentChatCreation(autoContext).create({...autoArgs,queryOnly:true},parent,signal)).status,'uncertain');assert.equal(spawnCalls,1);
const content=messageText([{role:'tool',content:[{type:'text',text:'tool result'},{type:'image',attachment:{attachmentId:'image-ref'}},{type:'file',attachment:{name:'a.txt'}}]}]);
assert.match(content,/\[tool\]/);assert.match(content,/tool result/);assert.match(content,/reference only; not read/);assert.match(content,/image-ref/);assert.match(content,/a.txt/);
let generated,streamCalls=0;
const summaryParent={...parent,session:{header:{cwd:'C:/work'}},model:{current:()=>({provider:'p',model:'m'})}};
const summaryContext={subagents:{getProvider(name){return name==='fork'?{inheritsParentContext:true,async prepareContinuable(){return {seed:[{type:'turn/end'}]};}}:{inheritsParentContext:false,prepareContinuable(){return {};}};}},llm:{async prepareCall(config,_signal,configure){const final=configure(config,{defaultMaxTokens:4000});return {config:final,context:{contextWindow:100000},async *stream(options){generated=options;streamCalls++;yield {type:'text-delta',text:'summary'};yield {type:'usage',usage:{inputTokens:20,outputTokens:2}};yield {type:'finish',reason:{kind:'stop'}};}};}}};
const projected=async()=>[{role:'user',content:[{type:'text',text:'preserve goals'}]}];
const summary=await summarizeSnapshot(summaryContext,summaryParent,'child',signal,projected);
assert.equal(summary.text,'summary');assert.equal(summary.maxTokens,3000);assert.deepEqual(generated.tools,[]);assert.equal(generated.provider,'p');assert.equal(generated.model,'m');assert.match(generated.system,/untrusted DATA/);assert.equal(generated.sessionId,undefined);assert.equal(streamCalls,1);
const noRoute={...summaryParent,model:{current:()=>undefined}};
await assert.rejects(()=>summarizeSnapshot(summaryContext,noRoute,'child',signal,projected),/resolved model route/);
for(const finish of ['max-tokens','tool-calls','error']) {
 const bad={...summaryContext,llm:{async prepareCall(config){return {config,context:{contextWindow:100000},async *stream(){yield {type:'text-delta',text:'partial'};yield {type:'finish',reason:{kind:finish}};}};}}};
 await assert.rejects(()=>summarizeSnapshot(bad,summaryParent,'child',signal,projected),/Summary failed/);
}
for(const chunks of [[],[{type:'block-start',blockType:'tool-call'},{type:'text-delta',text:'fake summary'}]]) {
 const bad={...summaryContext,llm:{async prepareCall(config){return {config,context:{contextWindow:100000},async *stream(){yield* chunks;yield {type:'finish',reason:{kind:'stop'}};}};}}};
 await assert.rejects(()=>summarizeSnapshot(bad,summaryParent,'child',signal,projected),/Summary failed/);
}
const oversize={...summaryContext,llm:{async prepareCall(config){return {config,context:{contextWindow:4000},async *stream(){throw Error('must not dispatch');}};}}};
await assert.rejects(()=>summarizeSnapshot(oversize,summaryParent,'child',signal,async()=>[{role:'user',content:[{type:'text',text:'x'.repeat(10000)}]}]),/too small|16-call cap/);
const priorInstallAnchor=process.env.DSH_INSTALL_DIR;
delete process.env.DSH_INSTALL_DIR;
try {
  let projectionInput;
  class SnapshotSession {
    constructor(id,seed) {this.id=id;this.seed=seed;this.header={cwd:'C:/work'};}
    static create(id,seed) {projectionInput={id,seed};return new this(id,seed);}
    deriveMessages() {return [{role:'user',content:[{type:'text',text:'projected without environment'}]}];}
  }
  const sourceSession=new SnapshotSession('parent',[{type:'parent-original'}]);
  const sourceBefore=JSON.stringify(sourceSession);
  const seed=[{type:'snapshot-only'}];
  assert.match(seedMessages(seed,'child',sourceSession)[0].content[0].text,/without environment/);
  assert.equal(projectionInput.id,'child');assert.equal(projectionInput.seed,seed);
  assert.equal(JSON.stringify(sourceSession),sourceBefore);
  assert.throws(()=>seedMessages(seed,'child',{}),/public create API unavailable/);
  const sameSource={deriveMessages(){return [];},constructor:{create:()=>sameSource}};
  assert.throws(()=>seedMessages(seed,'child',sameSource),/Independent Session snapshot unavailable/);
  const defaultProjection=await summarizeSnapshot(summaryContext,{...summaryParent,session:sourceSession},'default-child',signal);
  assert.equal(defaultProjection.text,'summary');assert.match(generated.messages[0].content[0].text,/projected without environment/);
  assert.equal(JSON.stringify(sourceSession),sourceBefore);
  let prepared=0;
  const store={prepare(id,options){prepared++;assert.equal(id,'summary-store-child');assert.ok(options.seed.length);return new SnapshotSession(id,options.seed);},enter(){throw Error('must not enter');},announce(){throw Error('must not announce');},create(){throw Error('must not create live session');}};
  const viaStore=await summarizeSnapshot({...summaryContext,sessions:store},{...summaryParent,session:sourceSession},'store-child',signal);
  assert.equal(viaStore.text,'summary');assert.equal(prepared,1);assert.equal(JSON.stringify(sourceSession),sourceBefore);
  assert.throws(()=>seedMessages(seed,'child',sourceSession,{}),/snapshot prepare API unavailable/);
} finally {if(priorInstallAnchor===undefined) delete process.env.DSH_INSTALL_DIR;else process.env.DSH_INSTALL_DIR=priorInstallAnchor;}
// Hierarchical planner preserves every Unicode codepoint and never silently truncates.
for(const text of ['abc','中文😀𠮷\n'.repeat(100),'x'.repeat(30000)]){
 const chunks=splitUtf8(text,13);assert.equal(chunks.join(''),text);assert.ok(chunks.every(x=>Buffer.byteLength(x,'utf8')<=13));assert.ok(chunks.every(x=>!x.includes('\ufffd')));
}
const contextSize=12000;
const basis=planSummary('x',contextSize,3000);
const fullText=('中文😀AB\n').repeat(Math.ceil(basis.textCapacity*6/13));
const tree=planSummary(fullText,contextSize,3000);
assert.ok(tree.nodes.at(-1).level>=2);assert.ok(tree.summaryCalls<=16);assert.equal(tree.nodes.filter(n=>!n.children).map(n=>n.text).join(''),fullText);assert.ok(tree.outputByteCap*4<=tree.textCapacity);
assert.throws(()=>planSummary('x'.repeat(basis.textCapacity*20),contextSize,3000),/16-call cap/);
assert.throws(()=>planSummary('x',3500,3000),/too small/);
let modelCalls=0,childCalls=0,prepareCalls=0,observed=[];
let frozenText=fullText;
class PlanSession {constructor(){this.header={cwd:'C:/work'};}deriveMessages(){return [{role:'user',content:[{type:'text',text:frozenText}]}];}}
const longParent={id:'long-parent',session:new PlanSession(),model:{current:()=>({provider:'p',model:'m'})}};
let includeUsage=true,oversizedOutput=false,failStream=false;
const longCtx={agents:{get:id=>id===longParent.id?longParent:undefined},logger:{warn(){}},sessions:{prepare:()=>new PlanSession()},subagents:{rootOf:a=>a,getProvider:name=>name==='fork'?{inheritsParentContext:true,prepareContinuable:async()=>({seed:[{type:'turn/end'}]})}:{inheritsParentContext:false,prepareContinuable:()=>({})},resolveMaxDepth:()=>1,startActivation:async input=>{childCalls++;spec=input;return {childId:input.childId,result:Promise.resolve({})};}},llm:{prepareCall:async(config,_signal,configure)=>{
 prepareCalls++;const final=configure?configure(config,{defaultMaxTokens:4000}):config;let used=false;
 return {config:final,context:{contextWindow:contextSize},async *stream(options){assert.equal(used,false);used=true;modelCalls++;observed.push(options);assert.deepEqual(options.tools,[]);assert.equal(options.provider,'p');assert.equal(options.model,'m');assert.ok(Buffer.byteLength(options.system+options.messages[0].content[0].text,'utf8')+1024+options.maxTokens<=contextSize);if(failStream)throw Error('mock stream failed');yield {type:'text-delta',text:oversizedOutput?'x'.repeat(tree.outputByteCap+1):'s'.repeat(tree.outputByteCap)};if(includeUsage)yield {type:'usage',usage:{inputTokens:10,outputTokens:2}};yield {type:'finish',reason:{kind:'stop'}};}};
}}};
const longOp=new AgentChatCreation(longCtx);
const longArgs={parentSessionId:longParent.id,requestId:'long_summary_123',autoSummary:true};
const initialPromise=longOp.create(longArgs,longParent,signal);
assert.equal(longOp.create(longArgs,longParent,signal),initialPromise);
const confirmation=await initialPromise;
assert.equal(confirmation.status,'needs-confirmation');assert.equal(modelCalls,0);assert.equal(childCalls,0);assert.equal(confirmation.totalCalls,confirmation.summaryCalls+1);assert.equal(confirmation.summaryCalls,tree.summaryCalls);assert.equal(longOp.pendingCount,1);
assert.equal((await longOp.create({...longArgs,confirmPlanId:'wrong',queryOnly:true},longParent,signal)).planId,confirmation.planId);assert.equal(modelCalls,0);
assert.equal((await longOp.create({...longArgs,confirmPlanId:'wrong'},longParent,signal)).status,'needs-confirmation');assert.equal(modelCalls,0);
frozenText='CHANGED MAIN HISTORY MUST NEVER APPEAR';
const confirmedArgs={...longArgs,confirmPlanId:confirmation.planId,queryOnly:false};
const running=longOp.create(confirmedArgs,longParent,signal);
assert.equal(longOp.create(confirmedArgs,longParent,signal),running);
const created=await running;
assert.equal(created.status,'created');assert.equal(modelCalls,confirmation.summaryCalls);assert.equal(childCalls,1);assert.equal(created.actualCalls,confirmation.summaryCalls);assert.equal(created.plannedMaxCalls,confirmation.summaryCalls);assert.equal(created.summary.usage.inputTokens,10*confirmation.summaryCalls);assert.equal(longOp.pendingCount,0);assert.equal(longOp.pendingBytes,0);assert.equal(longOp.requests.get(longArgs.parentSessionId+':'+longArgs.requestId).plan,null);
assert.ok(observed.every(x=>!x.messages[0].content[0].text.includes('CHANGED MAIN HISTORY')));assert.equal(spec.provider,'spawn');assert.equal(spec.delivery,'caller');
await longOp.create(confirmedArgs,longParent,signal);assert.equal(childCalls,1);
const reloaded=new AgentChatCreation(longCtx);const noConfirm=await reloaded.create(confirmedArgs,longParent,signal);assert.equal(noConfirm.status,'uncertain');assert.equal(childCalls,1);assert.equal((await reloaded.create({...confirmedArgs,queryOnly:true},longParent,signal)).status,'uncertain');assert.equal(modelCalls,confirmation.summaryCalls);
// Frozen output cap violation and stream exceptions are terminal, never spawn or redispatch.
frozenText=fullText;oversizedOutput=true;
const overArgs={...longArgs,requestId:'output_oversize_123'};const overPlan=await longOp.create(overArgs,longParent,signal);const beforeOver=modelCalls;const over=await longOp.create({...overArgs,confirmPlanId:overPlan.planId},longParent,signal);assert.equal(over.status,'uncertain');assert.match(over.error,/frozen byte cap/);assert.equal(childCalls,1);await longOp.create({...overArgs,confirmPlanId:overPlan.planId},longParent,signal);assert.equal(modelCalls,beforeOver+1);assert.equal(longOp.pendingCount,0);
oversizedOutput=false;includeUsage=false;
const standalonePlan=await prepareSummaryPlan(longCtx,longParent,'no-usage',signal);const noUsage=await runSummaryPlan(standalonePlan,signal);assert.equal(noUsage.usageComplete,false);assert.equal(noUsage.usage,undefined);
// Short history stays one summary plus one child, with no confirmation.
frozenText='short main history';includeUsage=true;
const shortArgs={...longArgs,requestId:'short_summary_123'};const shortBefore=modelCalls;assert.equal((await longOp.create(shortArgs,longParent,signal)).status,'created');assert.equal(modelCalls,shortBefore+1);assert.equal(childCalls,2);
frozenText='x'.repeat(basis.textCapacity*20);const capBefore=modelCalls;const cap=await longOp.create({...longArgs,requestId:'plan_cap_123'},longParent,signal);assert.equal(cap.status,'uncertain');assert.match(cap.error,/16-call cap/);assert.equal(modelCalls,capBefore);assert.equal(childCalls,2);
// Cancel pending plans only; queryOnly never cancels, wrong token never releases.
frozenText=fullText;const cancelArgs={...longArgs,requestId:'cancel_plan_123'};
const cancelReceipt=await longOp.create(cancelArgs,longParent,signal);const cancelBefore=modelCalls;
assert.equal((await longOp.create({...cancelArgs,cancelPlanId:cancelReceipt.planId,queryOnly:true},longParent,signal)).status,'needs-confirmation');assert.equal(longOp.pendingCount,1);
assert.equal((await longOp.create({...cancelArgs,cancelPlanId:'wrong'},longParent,signal)).status,'needs-confirmation');assert.equal(longOp.pendingCount,1);
assert.equal((await longOp.create({...cancelArgs,cancelPlanId:cancelReceipt.planId},longParent,signal)).status,'cancelled');assert.equal(longOp.pendingCount,0);assert.equal(longOp.pendingBytes,0);assert.equal(modelCalls,cancelBefore);
assert.equal((await longOp.create({...cancelArgs,confirmPlanId:cancelReceipt.planId},longParent,signal)).status,'cancelled');assert.equal(modelCalls,cancelBefore);
assert.equal((await new AgentChatCreation(longCtx).create({...cancelArgs,cancelPlanId:cancelReceipt.planId},longParent,signal)).status,'uncertain');assert.equal(modelCalls,cancelBefore);
assert.equal(cap.actualCalls,0);assert.equal(over.actualCalls,1);assert.equal(over.usageComplete,false);
assert.equal(confirmation.totalCallsEstimated,true);assert.equal(longOp.preparingCount,0);
// One preparation reservation is acquired synchronously; no pile-up of large transient projections.
let releasePrepare;
const blockedCtx={...longCtx,llm:{prepareCall:async(...args)=>{await new Promise(resolve=>{releasePrepare=resolve;});return longCtx.llm.prepareCall(...args);}}};
frozenText='short';const reserved=new AgentChatCreation(blockedCtx);const reserving=reserved.create({...longArgs,requestId:'reserve_first_123'},longParent,signal);
await new Promise(resolve=>setImmediate(resolve));assert.equal(reserved.preparingCount,1);
assert.throws(()=>reserved.create({...longArgs,requestId:'reserve_second_123'},longParent,signal),/capacity exhausted/);
releasePrepare();assert.equal((await reserving).status,'created');assert.equal(reserved.preparingCount,0);
console.log('PASS hierarchical: Unicode coverage, all-node conservative budgets, fixed multi-level tree, max-output guard, zero-stream confirmation preflight, frozen history, exact call upperbound, duplicate/query/reload safety, short one-call summary, terminal memory release, missing usage omitted. No real model called.');
const history=Array.from({length:12},(_,i)=>({role:i%2?'assistant':'user',content:[{type:'text',text:'message-'+i}]}));history.push({role:'tool',content:[{type:'text',text:'TOOL-MUST-NOT-ENTER'}]});
const recent=recentContext(history);assert.equal(recent.messages,8);assert.ok(recent.text.includes('message-11'));assert.ok(!recent.text.includes('message-0'));assert.ok(!recent.text.includes('TOOL-MUST-NOT-ENTER'));assert.ok(recent.bytes<=12288);
const bounded=recentContext([{role:'assistant',content:[{type:'text',text:'中😀'.repeat(10000)},{type:'reasoning',text:'HIDDEN'}]}]);assert.ok(bounded.bytes<=12288);assert.ok(!bounded.text.includes('HIDDEN'));assert.ok(!bounded.text.includes('\ufffd'));
let quickSpawns=0,quickSpec,createdHook,injectedContext,hookDisposals=0;
 const quickOn=(event,handler)=>{assert.equal(event,'agent/created');createdHook=handler;return()=>{hookDisposals++;createdHook=undefined;};};
const quickParent={id:'quick-parent',session:{header:{cwd:'C:/work'}}};
const quickCtx={on:quickOn,agents:{get:id=>id===quickParent.id?quickParent:undefined},sessions:{prepare:()=>({deriveMessages:()=>history})},llm:{prepareCall(){throw Error('quick path must never call LLM prepare');},stream(){throw Error('quick path must never summarize');}},subagents:{rootOf:a=>a,getProvider:name=>name==='fork'?{inheritsParentContext:true,prepareContinuable:async()=>({seed:[{type:'turn/end'}]})}:{inheritsParentContext:false,prepareContinuable:()=>({})},resolveMaxDepth:()=>1,startActivation:async input=>{quickSpawns++;quickSpec=input;createdHook({agent:{id:'unrelated',inject(){throw Error('wrong child');}}});const agent={id:input.childId,inject(message){assert.equal(injectedContext,undefined);injectedContext=message;}};createdHook({agent});createdHook({agent});return {childId:input.childId,result:Promise.resolve({})};}}};
const quickOp=new AgentChatCreation(quickCtx),quickArgs={parentSessionId:quickParent.id,requestId:'quick-request-123',quickContext:true,text:'The actual user request — preserve exactly.'};
const [qa,qb]=await Promise.all([quickOp.create(quickArgs,quickParent,signal),quickOp.create(quickArgs,quickParent,signal)]);assert.equal(qa.status,'created');assert.deepEqual(qa,qb);assert.equal(quickSpawns,1);assert.equal(quickSpec.provider,'spawn');assert.equal(quickSpec.delivery,'caller');assert.deepEqual(quickSpec.prompt,[{type:'text',text:quickArgs.text}]);assert.equal(quickSpec.label,quickArgs.text.slice(0,48));assert.equal(injectedContext.source.kind,'agent-chat-context');assert.equal(injectedContext.source.form,'notice');assert.match(injectedContext.content[0].text,/quick-parent/);assert.match(injectedContext.content[0].text,/PARTIAL historical context/);assert.ok(!injectedContext.content[0].text.includes('TOOL-MUST-NOT-ENTER'));assert.equal(hookDisposals,1);assert.equal(createdHook,undefined);
assert.equal((await quickOp.create({...quickArgs,queryOnly:true},quickParent,signal)).childId,qa.childId);assert.equal(quickSpawns,1);
assert.equal((await new AgentChatCreation(quickCtx).create({...quickArgs,queryOnly:true},quickParent,signal)).status,'uncertain');assert.equal(quickSpawns,1);
assert.throws(()=>quickOp.create({...quickArgs,requestId:'too-big-quick-123',text:'中'.repeat(3000)},quickParent,signal),/8 KiB/);assert.throws(()=>quickOp.create({...quickArgs,autoSummary:true},quickParent,signal),/cannot use summary/);
const noHook={...quickCtx,on:undefined};const noHookResult=await new AgentChatCreation(noHook).create({...quickArgs,requestId:'quick-no-hook-123'},quickParent,signal);assert.equal(noHookResult.status,'rejected');assert.match(noHookResult.error,/initialization hook unavailable/);assert.equal(quickSpawns,1);
console.log('PASS quick host: zero LLM prepare/stream, recent-only partial bounded UTF-8 context, no tool/reasoning text, exact current user block, spawn/caller, stable dedup and reload query-only.');
console.log('PASS Host: legacy fork; auto summary/spawn, same route/no tools, no parent mutation calls, failed summary zero child, request dedup/query-only, references, non-stop rejection and budget guard. Mock runtime only; no LLM call.');
