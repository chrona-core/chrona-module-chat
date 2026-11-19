import { readFileSync, writeFileSync } from 'node:fs';
const fake = `
const scenario=new URL(location.href).searchParams.get('scenario')||'empty';
const model='验收模型 / offline';
const transcript=[{kind:'text',at:'1',text:'已经整理了请求的内容。以下是本轮的实现检查与下一步。\\n\\n- 保留原始请求身份\\n- 核对执行状态和交付证据\\n- 在需要时展开工具详情'}, {kind:'result',at:'2',tool:'fixture.inspect',text:'隔离证据：非真实模型输出'}];
const c={id:'fixture',title:'新对话',draft:'',revision:0,updatedAt:'1',settings:{providerId:'pi',model:'',thinking:'',tools:[]},attachments:[],messages:[],operations:[],deliveries:[],active:null};
if(scenario==='long'||scenario==='running')for(let i=0;i<6;i++)c.messages.push({id:'u'+i,role:'user',text:'请检查当前工作进展，并说明还需要哪些证据。',attachments:[]},{id:'a'+i,role:'assistant',run:{transcript}});
if(scenario==='running'||scenario==='questions')c.active={runId:'fixture-run',status:'running',observedStatus:'running',settings:c.settings,transcript:[{kind:'text',text:'正在逐项核对材料，当前任务仍在运行…'}],events:[],interactions:[]};
if(scenario==='questions')c.active.interactions=[
  {id:'select',status:'pending',question:{title:'选择范围',message:'需要查看哪部分？',method:'select',options:['摘要','完整内容']}},
  {id:'editor',status:'pending',question:{title:'补充要求',message:'可编辑草稿',method:'editor',prefill:'保留这段草稿'}},
];
if(scenario==='markdown')c.messages=[{id:'markdown',role:'assistant',text:['示例','',String.fromCharCode(96).repeat(3)+'sh','printf hello',String.fromCharCode(96).repeat(3)].join(String.fromCharCode(10))}];
if(scenario==='error')c.operations=[{key:'rejected',kind:'send',status:'rejected',error:'提供方暂不可用。原始请求未受理，草稿已保留。',errors:[{code:'unavailable',message:'Provider unavailable'}]}];
const second={...structuredClone(c),archived:scenario==='archive',id:'second',title:'另一段会话',messages:[{id:'other',role:'user',text:'第二段对话的唯一内容'}],active:null};
const storageKey='fixture:'+scenario;
const records=JSON.parse(sessionStorage.getItem(storageKey)||'null') ?? (scenario.startsWith('first-message')?{}:{fixture:c,second});window.fixtureCalls=[];
const created={};
function create(args) {
  const row = created[args.requestKey] ??= {...structuredClone(c),id:crypto.randomUUID(),messages:[],active:null,operations:[]};
  records[row.id]=row;
  if(scenario==='first-message-retry'&&window.fixtureCalls.filter(call=>call.name==='create').length===1)throw Error('创建结果暂未收到');
  return row;
}
function send(row,args) {
  const prior=row.operations.find(op=>op.key===args.key);
  if(prior)return row;
  const input=args.input;
  if(args.kind==='stop'){row.active=null;row.operations.push({key:args.key,kind:args.kind,status:'succeeded'});return row;}
  if(args.kind==='message'){row.messages.push({id:args.key,role:'user',text:input.text});row.operations.push({key:args.key,kind:args.kind,status:'succeeded'});return row;}
  if(args.kind==='answer'&&scenario==='questions'){
    const question=row.active.interactions.find(item=>item.id===input.questionId);
    question.status=input.answer.decision==='submit'?'answered':'cancelled';
    row.revision++;
    row.operations.push({key:args.key,kind:args.kind,status:'succeeded'});
    return row;
  }
  const snapshot=input.snapshot;
  if(args.kind!=='send'||snapshot.revision!==row.revision)throw Error('发送的原始草稿与已保存版本不一致');
  row.messages.push({id:args.key,role:'user',text:snapshot.draft});
  row.active={runId:'fixture-run',observedStatus:'running',transcript:[{kind:'text',text:'收到，正在核对材料。'}],interactions:[]};
  row.draft='';row.revision++;
  row.operations.push({key:args.key,kind:args.kind,status:'succeeded'});
  return row;
}
const toolTrace=[{kind:'tool',tool:'read',callId:'a',args:'first.txt'},{kind:'tool',tool:'read',callId:'b',args:'second.txt'},{kind:'result',tool:'read',callId:'b',text:'second result'},{kind:'result',tool:'read',callId:'a',text:'first result'}];
let streamStep=0;
window.advanceFixtureStream=()=>streamStep++;
function stream(row) {
  if(streamStep<2) row.active={runId:'live-run',observedStatus:'running',liveReply:streamStep===0?'**正在生成第一段':'**正在生成第一段和第二段**',transcript:toolTrace};
  else if(row.active) {row.messages.push({id:'live-run',role:'assistant',run:{ended:true,transcript:[...toolTrace,{kind:'text',text:'最终正文'}]}});row.active=null;}
}
const catalog={providers:[{id:'pi',name:'Pi（隔离提供方）',available:true,capabilities:{conversation:true,images:true}}],configs:{pi:{models:[{value:'',label:'继承模型'},{value:'fixture/model',label:model}],thinking:['off','minimal','low','medium','high','xhigh','max'],warning:'选项来自隔离合同；不代表真实模型验收。'}},tools:[{module:'author',name:'submit',target:{moduleId:'author-fixture',tool:'submit'},description:'提交固定应用材料，返回真实候选回执。',available:true},{module:'notify',name:'send',target:{moduleId:'notify-fixture',tool:'send'},description:'通过用户选择的渠道发送通知。',available:true}]};
async function call(name,args={}){window.fixtureCalls.push({name,args});let result;const row=records[args.id];switch(name){case 'catalog':if(scenario==='load-error'&&window.fixtureCalls.filter(c=>c.name==='catalog').length===1)throw Error('暂时无法读取提供方');result=catalog;break;case 'list':result={items:Object.values(records)};break;case 'create':result=create(args);break;case 'execute':{const accepted=row.operations.some(op=>op.key===args.key);result=send(row,args);sessionStorage.setItem(storageKey,JSON.stringify(records));if(scenario==='first-message-retry'&&args.kind==='send'&&!accepted)throw Error('发送回执暂未收到');break;}case 'read':if(!row)throw Error('会话不存在');if(scenario==='stream'&&args.id==='fixture')stream(row);result=row;break;case 'draft':Object.assign(row,JSON.parse(args.patch));row.revision++;result=row;break;case 'upload':row.attachments.push({id:'fixture-image',name:args.name});row.revision++;result=row;break;case 'detach':row.attachments=row.attachments.filter(a=>a.id!==args.attachmentId);row.revision++;result=row;break;case 'edit':Object.assign(row,JSON.parse(args.patch));result=row;break;case 'delivery':result=row;break;case 'observation-scope':result={revision:1,enabled:true,conversation:{id:args.conversationId,excluded:false,private:false}};break;case 'image':result={mime:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8x0AAAAASUVORK5CYII='};break;case 'delete':delete records[args.id];result={deleted:args.id};break;default:throw Error('preview does not execute '+name);}sessionStorage.setItem(storageKey,JSON.stringify(records));return {json:JSON.stringify(result)};}
let locale = new URLSearchParams(location.search).get('locale') ?? 'zh-CN';
const localeListeners = new Set();
window.fixtureSetLocale = value => {
  locale = value;
  for (const listener of localeListeners) listener(value);
};
mountChat(document.querySelector('#chat-preview'), {
  call,
  get locale() { return locale; },
  subscribeLocale(listener) {
    localeListeners.add(listener);
    return () => localeListeners.delete(listener);
  },
});
`;
const hostStyle = readFileSync('test-support/host-style.css','utf8');
writeFileSync('browser-fixture.html', `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Chat · 宿主CSS隔离验收</title><style>${hostStyle}\n${readFileSync('dist/ui.css','utf8')}</style><body class="web-shell-app web-shell-workspace"><header><strong>Chrona</strong><nav aria-label="主导航"><a href="#">今天</a><a href="#">对话</a><a href="#">应用</a><a href="#">活动</a><a href="#">设置</a></nav><button>退出</button></header><main id="main"><div id="chat-preview"></div></main><script type="module">import mountChat from './dist/ui.js';\n${fake}</script></body></html>`);
