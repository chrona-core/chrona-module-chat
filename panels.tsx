import { useEffect, useState } from 'react';
import { useTranslation } from './locale';
import { Button } from './button';
import { Input } from './input';
import { Checkbox } from './elements/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './elements/collapsible';
import { ChevronDown } from 'lucide-react';
import { Alert, AlertDescription } from './elements/alert';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './elements/card';
import { Empty, EmptyHeader, EmptyTitle } from './elements/empty';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from './elements/field';
import { targetKey } from './tool-selection';
import type { Catalog, Conversation, ObservationScope } from './view-types';

export type Api = <T = Conversation>(tool: string, args?: Record<string, unknown>) => Promise<T>;
type Action = (fn: () => Promise<void>) => Promise<void>;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export function Tools({ conversation, catalog, busy, save }: {conversation: Conversation; catalog: Catalog; busy: boolean; save(next: Conversation['settings']): Promise<void>}) {
  const t = useTranslation();
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
  return <form onSubmit={e => {e.preventDefault(); void save({...conversation.settings, tools:value});}} aria-label={t("应用工具设置")}>
    <FieldGroup className="gap-4">
      <Field>
        <FieldLabel htmlFor="chat-tool-search">{t("搜索工具")}</FieldLabel>
        <Input id="chat-tool-search" placeholder={t("搜索应用或工具")} value={query} onChange={e => setQuery(e.target.value)} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm text-muted-foreground">{t('已选 {0}/{1}', selected.size, limit)}</span>
        <Button variant="outline" size="sm" type="button" onClick={() => setValue([])}>{t("全部关闭")}</Button>
        <Button variant="outline" size="sm" type="button" disabled={available.length > limit} onClick={() => setValue(available.map(t => t.target))}>{t("全部启用")}</Button>
      </div>
      <div className="max-h-[40dvh] divide-y divide-border overflow-auto overscroll-contain rounded-lg border border-input">
        {[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([app, entries]) => {
          const keys = new Set(entries.map(t => targetKey(t.target)));
          const additions = entries.filter(t => t.available !== false && !selected.has(targetKey(t.target)));
          const count = entries.filter(t => selected.has(targetKey(t.target))).length;
          return <Collapsible key={`${app}:${!!query.trim()}`} defaultOpen={!!query.trim()}>
            <CollapsibleTrigger render={<Button type="button" variant="ghost" className="w-full justify-between" />}><span className="truncate">{app}</span><span className="ml-auto text-muted-foreground">{count}/{entries.length}</span><ChevronDown data-icon="inline-end" /></CollapsibleTrigger>
            <CollapsibleContent className="px-2 py-2">
              <FieldSet className="gap-3">
                <FieldLegend className="sr-only">{t('{0} 的工具', app)}</FieldLegend>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={!additions.length || selected.size + additions.length > limit} onClick={() => setValue([...value, ...additions.map(t => t.target)])}>{t("启用本组")}</Button>
                  <Button type="button" size="sm" variant="outline" disabled={!count} onClick={() => setValue(value.filter(t => !keys.has(targetKey(t))))}>{t("关闭本组")}</Button>
                </div>
                <FieldGroup className="gap-3">
                  {entries.map(t => {
                    const key = targetKey(t.target), checked = selected.has(key);
                    const disabled = !checked && (t.available === false || selected.size >= limit);
                    const fieldId = `chat-tool-${encodeURIComponent(key)}`;
                    const description = t.reason || t.description;
                    return <Field key={key} orientation="horizontal" data-disabled={disabled || undefined}>
                      <Checkbox id={fieldId} checked={checked} disabled={disabled} aria-describedby={description ? `${fieldId}-description` : undefined} onCheckedChange={checked => setValue(checked === true ? [...value, t.target] : value.filter(candidate => targetKey(candidate) !== key))} />
                      <FieldContent className="min-w-0">
                        <FieldLabel htmlFor={fieldId} className="wrap-anywhere">{t.label || t.name}</FieldLabel>
                        {description && <FieldDescription id={`${fieldId}-description`} className="wrap-anywhere">{description}</FieldDescription>}
                      </FieldContent>
                    </Field>;
                  })}
                </FieldGroup>
              </FieldSet>
            </CollapsibleContent>
          </Collapsible>;
        })}
        {!groups.size && <Empty><EmptyHeader><EmptyTitle>{t("没有匹配的工具")}</EmptyTitle></EmptyHeader></Empty>}
      </div>
      <div className="flex justify-end"><Button type="submit" disabled={busy}>{t("保存工具")}</Button></div>
    </FieldGroup>
  </form>;
}

export function Scope({api, id, run, busy}: {api: Api; id: string; run: Action; busy: boolean}) {
  const t = useTranslation();
  const [value, setValue] = useState<ObservationScope>();
  const [error, setError] = useState('');
  async function load() {setValue(await api<ObservationScope>('observation-scope', {conversationId:id}));}
  useEffect(() => {void load().catch(e => setError(errorText(e)));}, [id, api]);
  if (!value) return error ? <Alert variant="destructive"><AlertDescription>{error}<Button disabled={busy} variant="outline" onClick={() => void run(load)}>{t("重试")}</Button></AlertDescription></Alert> : <p role="status">{t("正在读取学习范围…")}</p>;
  return <form aria-label={t("Mind 学习范围设置")} onSubmit={e => {
    e.preventDefault(); const data = new FormData(e.currentTarget);
    void run(async () => setValue(await api<ObservationScope>('observation-scope', {conversationId:id, expectedRevision:value.revision, enabled:data.has('enabled'), excluded:data.has('excluded'), private:data.has('private')})));
  }} key={value.revision}>
    <FieldSet>
      <FieldLegend className="sr-only">{t("学习权限")}</FieldLegend>
      <FieldGroup className="gap-3">
        <Field orientation="horizontal"><Checkbox id="chat-scope-enabled" name="enabled" defaultChecked={value.enabled} /><FieldLabel htmlFor="chat-scope-enabled">{t("允许 Mind 观察对话")}</FieldLabel></Field>
        <Field orientation="horizontal"><Checkbox id="chat-scope-excluded" name="excluded" defaultChecked={value.conversation?.excluded} /><FieldLabel htmlFor="chat-scope-excluded">{t("从学习范围排除此对话")}</FieldLabel></Field>
        <Field orientation="horizontal"><Checkbox id="chat-scope-private" name="private" defaultChecked={value.conversation?.private} /><FieldLabel htmlFor="chat-scope-private">{t("将此对话设为私密")}</FieldLabel></Field>
      </FieldGroup>
      <div className="flex justify-end"><Button type="submit" disabled={busy}>{t("保存范围")}</Button></div>
    </FieldSet>
  </form>;
}

export function Delivery({conversation, busy, refresh}: {conversation: Conversation; busy: boolean; refresh(): Promise<void>}) {
  const t = useTranslation();
  return <div className="grid gap-3">
    {!conversation.deliveries.length && <Empty><EmptyHeader><EmptyTitle>{t("尚无交付回执")}</EmptyTitle></EmptyHeader></Empty>}
    {conversation.deliveries.map(item => <Card key={item.receiptId} size="sm">
      <CardHeader>
        <CardTitle>{item.state}</CardTitle>
        {item.error && <CardDescription>{item.error}</CardDescription>}
      </CardHeader>
      {!!item.members?.length && <CardContent>{item.members.map(member => <p key={member.moduleId}>{member.name ?? member.moduleId} · {member.activation}</p>)}</CardContent>}
      <CardFooter className="flex-wrap gap-2">
        {item.approvalId && <a href={`/today?approval=${encodeURIComponent(item.approvalId)}`}>{t("打开审批")}</a>}
        <Collapsible><CollapsibleTrigger render={<Button variant="link" size="sm" />}>{t("查看回执编号")}</CollapsibleTrigger><CollapsibleContent><code className="wrap-anywhere">{item.receiptId}</code></CollapsibleContent></Collapsible>
      </CardFooter>
    </Card>)}
    <div className="flex justify-end"><Button variant="outline" disabled={busy} onClick={() => void refresh()}>{t("核对交付回执")}</Button></div>
  </div>;
}
