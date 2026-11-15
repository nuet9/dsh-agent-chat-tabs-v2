import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';
import {recentContext} from './index.js';
let plugin;vm.runInNewContext(fs.readFileSync(new URL('./client.js',import.meta.url),'utf8'),{TextEncoder,window:{__ModuleLoader__:{load(d){plugin=d.factory(()=>{});}}}});
const state={byId:{root:{},child:{title:'Updated title',running:false}},projectionsBySession:{root:{values:{subagentCatalog:[{id:'child',mode:'continuable',label:'新代理对话',activity:'running',name:'chat-1234abcd'}]}}}};
let row=plugin.deriveAgentTabs(state,'root').rows[1];assert.equal(row.label,'Updated title');assert.equal(row.activity,'running');
state.projectionsBySession.child={values:{title:'Newest projected title'}};
assert.equal(plugin.deriveAgentTabs(state,'root').rows[1].label,'Newest projected title');
delete state.byId.child;delete state.projectionsBySession.child;
assert.equal(plugin.deriveAgentTabs(state,'root').rows[1].label,'新代理对话');
const recent=recentContext([{role:'user',source:{kind:'agent-chat-context',form:'notice',summary:'context'},content:[{type:'text',text:'MUST-NOT-RECURSE'}]},{role:'user',source:{kind:'user'},content:[{type:'text',text:'real prompt'}]}]);
assert.equal(recent.messages,1);assert.doesNotMatch(recent.text,/MUST-NOT-RECURSE/);assert.match(recent.text,/real prompt/);
const source=fs.readFileSync(new URL('./client.js',import.meta.url),'utf8');assert.match(source,/currentRunning=props.useSession\(s=>s.running\)/);assert.match(source,/statuses.get\(r.id\)\?\.running\?\?\(r.activity/);
const element=(type,props,...children)=>({type,props,children});
for(const running of [true,false]){const icon=plugin.statusIcon(element,running,running?'进行中':'未运行');assert.equal(icon.props.role,'img');assert.equal(icon.props['aria-label'],running?'进行中':'未运行');assert.equal(icon.props['data-agent-chat-status'],running?'running':'idle');assert.equal(icon.children[0].props['aria-hidden'],true);assert.equal(icon.children[0].props.className,running?'agent-chat-tabs-status-running':undefined);assert.equal(icon.children[0].children[1]!==false,running);}
assert.match(plugin.statusIconCss,/prefers-reduced-motion:reduce/);assert.match(source,/statusIcon\(h,!!running,stateLabel\)/);assert.doesNotMatch(source,/h\('small',null,props.t\(.*running/);
console.log('PASS regression: accessible running/idle icons and reduced motion; live/projected title priority, catalog activity fallback, current running subscription, no recursive injected history. No browser or model call.');
