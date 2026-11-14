import {strict as assert} from 'node:assert';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Store} from './state';import {assertQqCaller,importQq} from './qq-sync';
export async function runQqChecks(){
 const root=mkdtempSync(join(tmpdir(),'chat-qq-'));let calls=0;const s=new Store(join(root,'data'),join(root,'content'),async()=>{calls++;throw Error('Host call forbidden');});
 try{
 const caller={kind:'module',module:'qq',moduleId:'qq-id',hash:'hash'},dir=[{name:'qq',id:'qq-id',activeHash:'hash',status:'active'}];
 assertQqCaller(caller,dir);for(const bad of [undefined,{kind:'owner'},{...caller,hash:'stale'},{...caller,moduleId:'fake'}])assert.throws(()=>assertQqCaller(bad,dir));
 const payload={session:'owner:session',messages:[{id:'1',role:'user',text:'你好',at:'2026-01-01T00:00:00Z',progress:''}]};
 const first=importQq(s,JSON.stringify(payload));importQq(s,JSON.stringify(payload));assert.equal(s.get(first.id).messages.length,1);
 payload.messages.push({id:'2',role:'assistant',text:'执行中',at:'2026-01-01T00:00:01Z',progress:'running'});importQq(s,JSON.stringify(payload));
 payload.messages[1].text='完成';payload.messages[1].progress='';importQq(s,JSON.stringify(payload));assert.equal(s.get(first.id).messages[1].text,'完成');assert.equal(s.get(first.id).sourceProgress,'');
 await assert.rejects(s.operate(first.id,'k','send',{}));assert.throws(()=>s.draft(first.id,{draft:'x'},0));assert.throws(()=>s.upload(first.id,{}));assert.throws(()=>s.newContext(first.id,true));assert.equal(calls,0);
 s.delete(first.id,true);assert.equal(importQq(s,JSON.stringify(payload)).ignored,'deleted');assert.equal(s.list().length,0);
 assert.throws(()=>importQq(s,JSON.stringify({...payload,messages:[{...payload.messages[0],role:'tool'}]})));
 return true;
 }finally{s.db.close();rmSync(root,{recursive:true,force:true});}
}
