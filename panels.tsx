import { useEffect, useState } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Checkbox } from './elements/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './elements/collapsible';
import { ChevronDown } from 'lucide-react';
import { targetKey } from './tool-selection';
import type { Catalog, Conversation, ObservationScope } from './view-types';

export type Api = <T = Conversation>(tool: string, args?: Record<string, unknown>) => Promise<T>;
type Action = (fn: () => Promise<void>) => Promise<void>;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export function Tools({ conversation, catalog, busy, save }: {conversation: Conversation; catalog: Catalog; busy: boolean; save(next: Conversation['settings']): Promise<void>}) {
  const [value, setValue] = useState(conversation.settings.tools);
  const [query, setQuery] = useState('');
  const selected = new Set(value.map(targetKey));
  const tools = catalog.tools.filter(t => `${t.module} ${t.name} ${t.label ?? ''} ${t.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const groups = new Map<string, typeof tools>();
  for (const tool of tools) {
    const group = groups.get(tool.module) ?? [];
    group.push(tool);
    groups.set(tool.module, group);
  }
  const limit = catalog.toolLimit ?? 100;
  const available = catalog.tools.filter(t => t.available !== false);
  return <form className="chat-panel" onSubmit={e => {e.preventDefault(); void save({...conversation.settings, tools:value});}}>
    <Input aria-label="搜索工具" placeholder="搜索应用或工具" value={query} onChange={e => setQuery(e.target.value)} />
    <div className="chat-actions"><span>已选 {selected.size}/{limit}</span><Button variant="outline" size="sm" type="button" onClick={() => setValue([])}>全部关闭</Button><Button variant="outline" size="sm" type="button" disabled={available.length > limit} onClick={() => setValue(available.map(t => t.target))}>启用全部</Button></div>
    <div className="chat-tool-list">{[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([app, entries]) => {
      const keys = new Set(entries.map(t => targetKey(t.target)));
      const additions = entries.filter(t => t.available !== false && !selected.has(targetKey(t.target)));
      const count = entries.filter(t => selected.has(targetKey(t.target))).length;
      return <Collapsible key={`${app}:${!!query.trim()}`} defaultOpen={!!query.trim()}>
        <CollapsibleTrigger asChild><Button type="button" variant="ghost" size="sm" className="chat-tool-group"><strong>{app}</strong><span>{count}/{entries.length}</span><ChevronDown /></Button></CollapsibleTrigger>
        <CollapsibleContent>
        <div className="chat-actions"><Button type="button" size="sm" variant="ghost" disabled={!additions.length || selected.size + additions.length > limit} onClick={() => setValue([...value, ...additions.map(t => t.target)])}>启用本组</Button><Button type="button" size="sm" variant="ghost" disabled={!count} onClick={() => setValue(value.filter(t => !keys.has(targetKey(t))))}>关闭本组</Button></div>
        {entries.map(t => {
          const key = targetKey(t.target), checked = selected.has(key);
          return <label key={key}><Checkbox checked={checked} disabled={!checked && (t.available === false || selected.size >= limit)} onCheckedChange={checked => setValue(checked === true ? [...value, t.target] : value.filter(target => targetKey(target) !== key))} /><span>{t.label || t.name}<small>{t.reason || t.description}</small></span></label>;
        })}
        </CollapsibleContent>
      </Collapsible>;
    })}{!groups.size && <p>没有匹配的工具</p>}</div>
    <Button type="submit" disabled={busy}>保存工具</Button>
  </form>;
}

export function Scope({api, id, run, busy}: {api: Api; id: string; run: Action; busy: boolean}) {
  const [value, setValue] = useState<ObservationScope>();
  const [error, setError] = useState('');
  async function load() {setValue(await api<ObservationScope>('observation-scope', {conversationId:id}));}
  useEffect(() => {void load().catch(e => setError(errorText(e)));}, [id, api]);
  if (!value) return error ? <p role="alert">{error} <Button disabled={busy} onClick={() => void run(load)}>重试</Button></p> : <p role="status">正在读取学习范围…</p>;
  return <form className="chat-panel" onSubmit={e => {
    e.preventDefault(); const data = new FormData(e.currentTarget);
    void run(async () => setValue(await api<ObservationScope>('observation-scope', {conversationId:id, expectedRevision:value.revision, enabled:data.has('enabled'), excluded:data.has('excluded'), private:data.has('private')})));
  }} key={value.revision}>
    <label><Checkbox name="enabled" defaultChecked={value.enabled} />允许 Mind 观察对话</label>
    <label><Checkbox name="excluded" defaultChecked={value.conversation?.excluded} />从学习范围排除此对话</label>
    <label><Checkbox name="private" defaultChecked={value.conversation?.private} />将此对话设为私密</label>
    <Button type="submit" disabled={busy}>保存范围</Button>
  </form>;
}

export function Delivery({conversation, busy, refresh}: {conversation: Conversation; busy: boolean; refresh(): Promise<void>}) {
  return <div className="chat-panel"><div className="chat-actions"><Button variant="outline" disabled={busy} onClick={() => void refresh()}>核对交付回执</Button></div>
    {!conversation.deliveries.length && <p>尚无交付回执</p>}
    {conversation.deliveries.map(item => <section className="chat-delivery" key={item.receiptId}><strong>{item.state}</strong><p>{item.error}</p>{item.members?.map(member => <p key={member.moduleId}>{member.name ?? member.moduleId} · {member.activation}</p>)}{item.approvalId && <a href={`/today?approval=${encodeURIComponent(item.approvalId)}`}>打开审批</a>}<Collapsible><CollapsibleTrigger asChild><Button variant="link" size="sm">查看回执编号</Button></CollapsibleTrigger><CollapsibleContent><code>{item.receiptId}</code></CollapsibleContent></Collapsible></section>)}
  </div>;
}
