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
if(scenario==='error')c.operations=[{key:'rejected',kind:'send',status:'rejected',error:'提供方暂不可用。原始请求未受理，草稿已保留。',errors:[{code:'unavailable',message:'Provider unavailable'}]}];
if(scenario==='tasks')c.messages=[{id:'original',role:'user',text:'原始请求：请整理研究资料，后续进展保留在这段对话。',attachments:[]}];
const second={...structuredClone(c),id:'second',title:'另一段会话',messages:[{id:'other',role:'user',text:'第二段对话的唯一内容'}],active:null};
const records=scenario.startsWith('first-message')?{}:{fixture:c,second};window.fixtureCalls=[];
const created={};
function create(args) {
  const row = created[args.requestKey] ??= {...structuredClone(c),id:crypto.randomUUID(),messages:[],active:null,operations:[]};
  records[row.id]=row;
  if(scenario==='first-message-retry'&&window.fixtureCalls.filter(call=>call.name==='create').length===1)throw Error('创建结果暂未收到');
  return row;
}
function send(row,args) {
  const input=JSON.parse(args.input);
  if(args.kind==='answer'&&scenario==='questions'){
    const question=row.active.interactions.find(item=>item.id===input.questionId);
    question.status=input.answer.decision==='submit'?'answered':'cancelled';
    row.revision++;
    row.operations.push({key:args.key,kind:args.kind,status:'succeeded'});
    return row;
  }
  const snapshot=input.snapshot;
  if(args.kind!=='send'||snapshot.revision!==row.revision||snapshot.draft!==row.draft)throw Error('发送的原始草稿与已保存版本不一致');
  row.messages.push({id:'first-message',role:'user',text:snapshot.draft});
  row.draft='';row.revision++;
  row.operations.push({key:args.key,kind:args.kind,status:'succeeded'});
  return row;
}
const tasks=scenario==='tasks'?[{id:'page-task',revision:1,visibilityRevision:0,title:'改进应用中心：让应用列表更容易查找和操作',goal:'改进应用中心：让应用列表更容易查找和操作',status:'waiting',waitFor:'user',waitReason:'页面已更新，等待你在浏览器中验收',nextStep:'根据你的反馈继续调整筛选与操作布局',summary:'已检查源码、完成布局调整并核对构建结果，等待用户验收',lastActivity:'2026-11-15T10:00:00.000Z',operations:[{operation:'读取应用源码',status:'succeeded',at:'2026-11-15T09:40:00.000Z'},{operation:'检查应用材料',status:'succeeded',at:'2026-11-15T09:50:00.000Z'}],artifacts:[{ref:'artifact',title:'改进说明与验收步骤'}],details:{goal:'改进应用中心：让应用列表更容易查找和操作',runs:['run-1','run-2','run-3'],activeHash:'a'.repeat(64)}},{id:'chat-task',revision:1,visibilityRevision:0,title:'继续整理研究资料',goal:'继续整理研究资料',status:'waiting',waitFor:'user',waitReason:'等待确认研究范围',nextStep:'补充所需主题',summary:'已整理第一轮资料',lastActivity:'2026-11-15T09:00:00.000Z',conversationId:'fixture',artifacts:[],details:{goal:'继续整理研究资料'}}]:[];
const catalog={providers:[{id:'pi',name:'Pi（隔离提供方）',available:true}],configs:{pi:{models:[{value:'',label:'继承模型'},{value:'fixture/model',label:model}],thinking:['off','minimal','low','medium','high','xhigh','max'],warning:'选项来自隔离合同；不代表真实模型验收。'}},tools:[{module:'author',target:{moduleId:'author-fixture',tool:'submit'},description:'提交固定应用材料，返回真实候选回执。',available:true},{module:'notify',target:{moduleId:'notify-fixture',tool:'send'},description:'通过用户选择的渠道发送通知。',available:true}]};
async function call(name,args={}){window.fixtureCalls.push({name,args});let result;const row=records[args.id];switch(name){case 'task-view':if(scenario==='task-error')throw Error('Mind 尚未安装或绑定，普通对话仍可使用。');result=args.artifactRef?{title:'改进说明与验收步骤',body:'页面已调整。请检查筛选、卡片操作与手机布局，并补充你的反馈。'}:args.id?tasks.find(t=>t.id===args.id):{items:tasks};break;case 'task-control':{const input=JSON.parse(args.input),task=tasks.find(t=>t.id===input.id);task.revision++;if(input.operation==='pause')task.status='paused';else if(input.operation==='resume')task.status='waiting';else task.goal+='\\n补充要求：'+input.text;result={value:task};break;}case 'catalog':if(scenario==='load-error'&&window.fixtureCalls.filter(c=>c.name==='catalog').length===1)throw Error('暂时无法读取提供方');result=catalog;break;case 'list':result={items:Object.values(records)};break;case 'create':result=create(args);break;case 'execute':result=send(row,args);break;case 'read':result=row;break;case 'draft':Object.assign(row,JSON.parse(args.patch));row.revision++;result=row;break;case 'upload':row.attachments.push({id:'fixture-image',name:args.name});row.revision++;result=row;break;case 'detach':row.attachments=row.attachments.filter(a=>a.id!==args.attachmentId);row.revision++;result=row;break;case 'edit':Object.assign(row,JSON.parse(args.patch));result=row;break;case 'delivery':result=row;break;default:throw Error('preview does not execute '+name);}return {json:JSON.stringify(result)};}
mountChat(document.querySelector('#chat-preview'),{call});
`;
const hostStyle = readFileSync('test-support/host-style.css','utf8');
writeFileSync('browser-fixture.html', `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Chat · 宿主CSS隔离验收</title><style>${hostStyle}\n${readFileSync('dist/ui.css','utf8')}</style><body class="web-shell-app web-shell-workspace"><header><strong>Chrona</strong><nav aria-label="主导航"><a href="#">今天</a><a href="#">对话</a><a href="#">应用</a><a href="#">活动</a><a href="#">设置</a></nav><button>退出</button></header><main id="main"><div id="chat-preview"></div></main><script type="module">import mountChat from './dist/ui.js';\n${fake}</script></body></html>`);
