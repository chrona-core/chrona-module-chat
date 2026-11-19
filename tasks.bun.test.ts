import {expect,test} from 'bun:test';
import {mindTaskCall} from './mind-tasks';
const wait=async(check:()=>boolean)=>{for(let i=0;i<200;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Task UI condition timeout');};

test('Chat task proxy rejects ordinary modules and keeps missing Mind errors understandable',async()=>{
 const deps={web:'web-id',mind:'mind-id'};let called=false;
 const call=async()=>{called=true;return {json:'{"items":[]}'}};
 await expect(mindTaskCall(call,deps,{kind:'module',moduleId:'agent-id'},'task-view',{})).rejects.toThrow('Web');expect(called).toBe(false);
 await expect(mindTaskCall(call,{web:'web-id'},{kind:'module',moduleId:'web-id'},'task-view',{})).rejects.toThrow('普通对话仍可使用');
 expect(await mindTaskCall(call,deps,{kind:'module',moduleId:'web-id'},'task-view',{})).toEqual({items:[]});
});
