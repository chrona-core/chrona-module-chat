import type { Store } from './state';
export function assertQqCaller(caller:any, modules:any[]) {
 const active=modules.find(m=>m.name==='qq'&&m.status==='active');
 if(caller?.kind!=='module'||caller.module!=='qq'||!active?.activeHash||caller.moduleId!==active.id||caller.hash!==active.activeHash)throw Object.assign(Error('仅当前 QQ 应用可同步'),{code:'forbidden'});
}
export function importQq(store:Store,input:string) {
 if(typeof input!=='string'||Buffer.byteLength(input)>4000000)throw Error('QQ 同步数据过大');
 const p=JSON.parse(input);
 if(!p||typeof p.session!=='string'||p.session.length>256||!Array.isArray(p.messages)||p.messages.length>100)throw Error('无效 QQ 会话');
 for(const m of p.messages)if(!m||typeof m.id!=='string'||m.id.length>256||!['user','assistant'].includes(m.role)||typeof m.text!=='string'||m.text.length>200000||typeof m.at!=='string'||!Number.isFinite(Date.parse(m.at))||typeof m.progress!=='string'||m.progress.length>2000)throw Error('无效 QQ 消息');
 return store.db.transaction(()=>{
  store.db.run('CREATE TABLE IF NOT EXISTS qq_mirrors (source TEXT PRIMARY KEY, conversation TEXT NOT NULL)');
  let row=store.db.query('SELECT conversation FROM qq_mirrors WHERE source=?').get(p.session) as any;
  let c:any;
  if(row){try{c=store.get(row.conversation);}catch{return {ignored:'deleted',id:row.conversation};}}
  else {c=store.create('',[]);c.title='QQ 私聊';c.source='qq';c.readOnly=true;store.db.query('INSERT INTO qq_mirrors VALUES (?,?)').run(p.session,c.id);}
  for(const m of p.messages){const message={id:'qq:'+m.id,role:m.role,text:m.text,at:m.at,attachments:[],source:'qq',progress:m.progress};const i=c.messages.findIndex((x:any)=>x.id===message.id);if(i<0)c.messages.push(message);else c.messages[i]=message;}
  c.messages.sort((a:any,b:any)=>a.at.localeCompare(b.at));
  c.sourceProgress=[...c.messages].reverse().find((m:any)=>m.role==='assistant')?.progress??'';
  store.save(c);return {id:c.id,count:c.messages.length};
 }).immediate();
}
