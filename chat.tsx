import { Popover, PopoverTrigger, PopoverContent } from './elements/popover';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUp, Brain, Check, ChevronDown, Ellipsis, Menu, Paperclip, Plus, Search, Settings2, Square, X } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './elements/dialog';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './elements/sheet';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from './elements/sidebar-menu';
import { Empty, EmptyTitle } from './elements/empty';
import { Alert, AlertDescription } from './elements/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './elements/collapsible';
import { NativeSelect, NativeSelectOption } from './elements/native-select';
import { Attachment, AttachmentAction, AttachmentActions, AttachmentGroup, AttachmentTitle } from './elements/attachment';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from './elements/input-group';
import { Command as ModelCommand, CommandEmpty, CommandInput, CommandItem, CommandList } from './elements/command';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from './elements/dropdown-menu';
import { Thread } from './thread';
import { Tools, Delivery, Scope, type Api } from './panels';
import type { Catalog, Conversation, ConversationSummary } from './view-types';

const conversationParam = 'conversation';
const draftKey = (id: string) => `chrona.chat.draft.${id}`;
const requestKey = (id: string) => `chrona.chat.request.${id}`;
type CreateRequest = { key: string; emptyTools: boolean; firstMessage?: string };
type Command = { id: string; key: string; kind: string; input: Record<string, unknown>; text?: string };
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

function selectedId() { return new URL(location.href).searchParams.get(conversationParam) ?? ''; }

function Chat({ api, container }: { api: Api; container: HTMLElement }) {
  const [id, setId] = useState(selectedId);
  const [loaded, setLoaded] = useState<Conversation>();
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [catalog, setCatalog] = useState<Catalog>();
  const [error, setError] = useState('');
  const [readError, setReadError] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const [find, setFind] = useState<string | null>(null);
  const [panel, setPanel] = useState<'tools' | 'manage' | 'delivery' | 'scope' | 'image' | 'run' | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelProvider, setModelProvider] = useState('');
  const [image, setImage] = useState<{name: string; src: string}>();
  const [drafts, setDrafts] = useState<Record<string, string | undefined>>({});
  const [retry, setRetry] = useState<Command>();
  const selection = useRef(id);
  const action = useRef(false);
  const actionRevision = useRef(0);
  const createKey = useRef<CreateRequest | undefined>(undefined);
  const [retryCreate, setRetryCreate] = useState(() => !!sessionStorage.getItem('chrona.chat.create-pending'));
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const conversation = loaded?.id === id ? loaded : undefined;
  const text = drafts[id] ?? sessionStorage.getItem(draftKey(id)) ?? conversation?.draft ?? '';
  const active = conversation?.active;
  const currentRequest = retry?.id === id ? retry : undefined;
  const conversationReady = !!conversation;
  useEffect(() => { if (conversationReady && !matchMedia('(max-width: 720px)').matches) composerInput.current?.focus(); }, [id, conversationReady]);
  const pending = conversation?.operations.find(o => !['succeeded', 'rejected', 'failed'].includes(o.status));
  const available = catalog?.providers.filter(p => p.available && p.capabilities.conversation) ?? [];

  function select(next: string, push = true) {
    const url = new URL(location.href);
    if (next) url.searchParams.set(conversationParam, next);
    else url.searchParams.delete(conversationParam);
    if (url.pathname === '/p/chat/main') {
      if (next) sessionStorage.setItem('chrona.chat.lastConversation', next);
      else sessionStorage.removeItem('chrona.chat.lastConversation');
    }
    if (url.href !== location.href) history[push ? 'pushState' : 'replaceState'](history.state, '', url);
    selection.current = next;
    setId(next);
    setError('');
    setReadError('');
    setFind(null);
    setDrawer(false);
    setPanel(null);
    setModelOpen(false);
  }


  async function refreshList() { setItems((await api<{items: ConversationSummary[]}>('list')).items); }
  async function initialize() {
    setError('');
    await refreshList();
    setReady(true);
    setCatalog(await api<Catalog>('catalog'));
  }

  useEffect(() => {
    void initialize().catch(e => setError(messageOf(e)));
    const back = () => select(selectedId(), false);
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);

  useEffect(() => {
    if (!id) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const stored = sessionStorage.getItem(requestKey(id));
    setRetry(stored ? JSON.parse(stored) as Command : undefined);
    let running = false;
    async function read() {
      try {
        if (!action.current && !document.hidden) {
          const revision = actionRevision.current;
          const next = await api<Conversation>('read', { id, observe: true });
          if (live && selection.current === id && !action.current && revision === actionRevision.current) {
            running = !!next.active;
            setLoaded(next);
            setReadError('');
          }
        }
      } catch (e) {
        if (live) setReadError(messageOf(e));
      } finally {
        if (live) timer = setTimeout(read, running ? 400 : 1800);
      }
    }
    void read();
    return () => { live = false; clearTimeout(timer); };
  }, [id, api]);

  async function task(work: () => Promise<unknown>) {
    if (action.current) return;
    action.current = true;
    actionRevision.current++;
    setBusy(true);
    setError('');
    try { await work(); }
    catch (e) { setError(messageOf(e)); }
    finally { action.current = false; setBusy(false); }
  }

  function update(next: Conversation) {
    if (selection.current === next.id) setLoaded(next);
    setItems(previous => [{id: next.id, title: next.title, pinned: next.pinned, archived: next.archived}, ...previous.filter(c => c.id !== next.id)]);
  }

  function writeDraft(value: string) {
    sessionStorage.setItem(draftKey(id), value);
    setDrafts(previous => ({...previous, [id]: value}));
  }

  async function create(firstMessage?: string) {
    const stored = sessionStorage.getItem('chrona.chat.create-pending');
    createKey.current ??= stored ? JSON.parse(stored) as CreateRequest : { key: crypto.randomUUID(), firstMessage, emptyTools: (catalog?.tools.filter(t => t.available !== false).length ?? 0) > (catalog?.toolLimit ?? 100) };
    sessionStorage.setItem('chrona.chat.create-pending', JSON.stringify(createKey.current));
    setRetryCreate(true);
    const { key, emptyTools, firstMessage: submitted } = createKey.current;
    const origin = selection.current;
    const draft = submitted ?? (origin ? undefined : sessionStorage.getItem(draftKey('')) ?? undefined);
    const next = await api<Conversation>('create', { requestKey: key, emptyTools });
    createKey.current = undefined;
    sessionStorage.removeItem('chrona.chat.create-pending');
    setRetryCreate(false);
    if (draft !== undefined) {
      sessionStorage.setItem(draftKey(next.id), draft);
      if (sessionStorage.getItem(draftKey('')) === draft) {
        sessionStorage.removeItem(draftKey(''));
        setDrafts(previous => ({...previous, '': undefined}));
      }
    }
    if (selection.current !== origin || (submitted !== undefined && origin)) { update(next); return; }
    setArchived(false);
    select(next.id);
    update(next);
    if (submitted !== undefined) {
      if (next.settings.providerId) await sendMessage(next, submitted);
      else setModelOpen(true);
    }
    return next;
  }

  async function execute(command: Command) {
    const { id: target, key, kind, input } = command;
    sessionStorage.setItem(requestKey(target), JSON.stringify(command));
    setRetry(command);
    const next = await api<Conversation>('execute', { id: target, key, kind, input });
    update(next);
    const result = next.operations.find(o => o.key === key);
    if (!result || !['succeeded', 'failed', 'rejected'].includes(result.status)) {
      throw Error(result?.recoveryNotice ?? result?.error ?? '请求结果待确认，请核对原请求。');
    }
    sessionStorage.removeItem(requestKey(target));
    setRetry(undefined);
    if (result.status !== 'succeeded') throw Error(result.error ?? '操作失败');
    if (command.text !== undefined && sessionStorage.getItem(draftKey(target)) === command.text) {
      sessionStorage.setItem(draftKey(target), '');
      setDrafts(previous => ({...previous, [target]: ''}));
    }
  }

  function run(kind: string, input: Record<string, unknown> = {}, submitted?: string) {
    if (!conversation || currentRequest) return;
    void task(() => execute({ id, key: crypto.randomUUID(), kind, input, text: submitted }));
  }

  function sendMessage(target: Conversation, value: string) {
    return execute({ id: target.id, key: crypto.randomUUID(), kind: 'send', text: value, input: {
      snapshot: { draft: value, revision: target.revision, attachmentIds: target.attachments.map(a => a.id), settings: target.settings },
    } });
  }

  function send() {
    if (!id) {
      if (ready && catalog && !retryCreate && text.trim()) void task(() => create(text));
      return;
    }
    if (!conversation || (active && !active.runId) || pending || currentRequest || (!text.trim() && (!conversation.attachments.length || active))) return;
    if (!conversation.settings.providerId) { setModelOpen(true); return; }
    sessionStorage.setItem(draftKey(id), text);
    if (active) run('message', { text, runId: active.runId }, text);
    else void task(() => sendMessage(conversation, text));
  }

  function upload(files: FileList | File[]) {
    if (active || pending || currentRequest || !files.length || (!conversation && (!ready || !catalog || retryCreate))) return;
    void task(async () => {
      const oversized = [...files].find(file => file.size > 2 * 1024 * 1024);
      if (oversized) throw Error(`${oversized.name} 超过 2 MiB`);
      const target = conversation ?? await create();
      if (!target) return;
      for (const file of files) {
        const base64 = (await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        }));
        update(await api<Conversation>('upload', {id: target.id, name: file.name, mime: file.type, base64}));
      }
    });
  }

  const visible = useMemo(() => items.filter(c => c.archived === archived && c.title.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned)), [items, query, archived]);
  const provider = available.find(p => p.id === conversation?.settings.providerId);
  const contextProvider = conversation?.context?.providerId;
  const pickerProviders = contextProvider ? available.filter(p => p.id === contextProvider) : available;
  const pickerProvider = pickerProviders.find(p => p.id === modelProvider) ?? pickerProviders.find(p => p.id === provider?.id) ?? pickerProviders[0];
  const config = pickerProvider && catalog?.configs[pickerProvider.id];
  const models = [{value:'', label:'继承提供方设置'}, ...(config?.models ?? []).filter(model => model.value)];
  const effortLevels = provider ? catalog?.configs[provider.id]?.thinking ?? [] : [];
  const effort = conversation?.settings.thinking ?? '';
  const effortLabels: Record<string, string> = {off:'关闭', minimal:'最低', low:'低', medium:'中', high:'高', xhigh:'很高', max:'最高'};
  const settingsLocked = busy || !!active || !!pending || !!currentRequest || (!id && (!ready || !catalog || retryCreate));
  function saveSettings(patch: Partial<Conversation['settings']>, close?: () => void) {
    return task(async () => {
      const target = conversation ?? await create();
      if (!target) return;
      const settings = {...target.settings, ...patch};
      update(await api('draft', {id: target.id, revision: target.revision, patch: JSON.stringify({settings})}));
      close?.();
    });
  }
  const title = {tools: '应用工具', manage: '管理对话', run: '执行记录', delivery: '应用交付', scope: 'Mind 学习范围', image: image?.name ?? '附件'};
  const conversationList = <>
      <Button className="chat-new" disabled={busy} onClick={() => {select(''); requestAnimationFrame(() => composerInput.current?.focus());}}><Plus />新对话</Button>
      <div className="chat-sidebar-filter">
        <Input aria-label="搜索对话" placeholder="搜索对话" value={query} onChange={e => setQuery(e.target.value)} />
        <NativeSelect aria-label="筛选对话" value={archived ? 'archived' : 'current'} onChange={e => setArchived(e.target.value === 'archived')}>
          <NativeSelectOption value="current">当前</NativeSelectOption>
          <NativeSelectOption value="archived">已归档</NativeSelectOption>
        </NativeSelect>
      </div>
      <nav aria-label="会话列表">
        <SidebarMenu>{visible.map(c => <SidebarMenuItem key={c.id}><SidebarMenuButton type="button" title={c.title} isActive={id === c.id} aria-current={id === c.id ? 'page' : undefined} onClick={() => select(c.id)}>{c.pinned && <span aria-label="已置顶">↟</span>}<span>{c.title}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>
        {ready && !visible.length && <Empty className="chat-list-empty"><EmptyTitle>{query ? '没有匹配的对话' : archived ? '没有归档对话' : '还没有对话'}</EmptyTitle></Empty>}
      </nav>
  </>;
  return <div className="chat-layout">
    <aside className="chat-sidebar" aria-label="聊天导航"><strong className="chat-sidebar-heading">对话</strong>{conversationList}</aside>
    <main className="chat-main">
      <header className="chat-header">
        <Sheet open={drawer} onOpenChange={setDrawer} modal="trap-focus">
          <SheetTrigger render={<Button variant="ghost" size="icon-sm" aria-label="打开会话列表" className="chat-mobile" />}><Menu /></SheetTrigger>
          <SheetContent container={container} side="left" className="chat-sidebar chat-sidebar-sheet"><SheetTitle>对话</SheetTitle>{conversationList}</SheetContent>
        </Sheet>
        <h1>{conversation?.title ?? items.find(c => c.id === id)?.title ?? '对话'}</h1>
        {!!id && <Button className="chat-mobile" size="icon-sm" aria-label="新对话" disabled={busy} onClick={() => select('')}><Plus /></Button>}
        {conversation && <><span className="chat-run-status" role="status">{active ? active.stopRequested ? '正在停止' : '运行中' : ''}</span><Button variant="ghost" size="icon-sm" aria-label="搜索消息" onClick={() => setFind(find === null ? '' : null)}><Search /></Button><Button variant="ghost" size="icon-sm" aria-label="管理对话" onClick={() => setPanel('manage')}><Ellipsis /></Button></>}
      </header>
      {find !== null && <div className="chat-find"><Input autoFocus aria-label="搜索消息" placeholder="搜索本对话的消息" value={find} onChange={e => setFind(e.target.value)} /><Button variant="ghost" size="icon-sm" aria-label="关闭搜索" onClick={() => setFind(null)}><X /></Button></div>}
      {(error || readError || currentRequest || pending || retryCreate) && <Alert variant="destructive" className="chat-notice"><AlertDescription>{error || readError || pending?.recoveryNotice || '请求结果待确认'}</AlertDescription>{retryCreate && !currentRequest ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void task(() => create())}>核对新对话</Button> : currentRequest ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void task(() => execute(currentRequest))}>核对原请求</Button> : pending ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void task(async () => update(await api('read', {id})))}>核对请求</Button> : !ready || !catalog ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void task(initialize)}>重试</Button> : <Button variant="ghost" size="icon-sm" aria-label="关闭提示" onClick={() => {setError(''); setReadError('');}}><X /></Button>}</Alert>}
      {conversation ? <Thread key={id} conversation={conversation} query={find ?? ''} disabled={busy || !!currentRequest || !!pending} answer={(questionId, answer) => run('answer', {questionId, answer, runId: active?.runId})} showImage={attachment => void task(async () => {
        const data = await api<{ mime: string; base64: string }>('image', {id, attachmentId: attachment.id});
        setImage({ name: attachment.name, src: `data:${data.mime};base64,${data.base64}` }); setPanel('image');
      })} /> : id && <div className="chat-welcome" role="status">{readError ? '无法打开对话' : '正在读取对话…'}</div>}
      {(conversation || !id) && <form className={`chat-composer${id ? '' : ' chat-composer-start'}`} onDragOver={e => {if (e.dataTransfer.types.includes('Files')) e.preventDefault();}} onDrop={e => {if (e.dataTransfer.files.length) {e.preventDefault(); upload(e.dataTransfer.files);}}} onSubmit={e => {e.preventDefault(); send();}}>
        {!id && <h2>想做些什么？</h2>}
        <InputGroup className="chat-prompt">
          {!!conversation?.attachments.length && <InputGroupAddon align="block-start">
            <AttachmentGroup>{conversation.attachments.map(file => <Attachment key={file.id}>
              <Paperclip size={14} /><AttachmentTitle>{file.name}</AttachmentTitle>
              <AttachmentActions><AttachmentAction type="button" aria-label={`移除 ${file.name}`} disabled={busy || !!pending || !!currentRequest} onClick={() => void task(async () => update(await api('detach', {id, attachmentId: file.id})))}><X /></AttachmentAction></AttachmentActions>
            </Attachment>)}</AttachmentGroup>
          </InputGroupAddon>}
          <label className="sr-only" htmlFor="chat-message">消息</label>
          <InputGroupTextarea ref={composerInput} id="chat-message" value={text} onChange={e => writeDraft(e.target.value)} placeholder={active ? '给正在运行的 Agent 补充指令…' : id ? '输入消息，或粘贴图片…' : '输入第一条消息，或粘贴图片…'} onPaste={e => {
            const images = [...e.clipboardData.files].filter(file => file.type.startsWith('image/'));
            if (images.length && !settingsLocked) {e.preventDefault(); upload(images);}
          }} onKeyDown={e => {
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
            e.preventDefault(); e.currentTarget.form?.requestSubmit();
          }} />
          <InputGroupAddon align="block-end" className="chat-composer-bar">
            <Input ref={fileInput} type="file" hidden multiple accept="image/png,image/jpeg,image/gif,image/webp" onChange={e => {if (e.currentTarget.files) upload(e.currentTarget.files); e.currentTarget.value = '';}} />
            <InputGroupButton type="button" variant="ghost" size="icon-sm" aria-label="添加图片" disabled={settingsLocked} onClick={() => fileInput.current?.click()}><Paperclip /></InputGroupButton>
            <Popover open={modelOpen} onOpenChange={open => {setModelOpen(open); if (open) setModelProvider(conversation?.settings.providerId ?? '');}}>
              <PopoverTrigger asChild><InputGroupButton type="button" variant="ghost" size="sm" className="chat-model" aria-label="选择模型" disabled={settingsLocked}><span>{conversation?.settings.model || provider?.name || '选择模型'}</span><ChevronDown /></InputGroupButton></PopoverTrigger>
              <PopoverContent container={container} align="start" side="top" sideOffset={8} className="chat-model-picker" aria-label="模型选择" onOpenAutoFocus={event => {
                  const input = event.currentTarget instanceof HTMLElement ? event.currentTarget.querySelector('input') : null;
                  if (input) {event.preventDefault(); input.focus();}
                }}>
                  {pickerProviders.length > 1 && <NativeSelect aria-label="执行提供方" value={pickerProvider?.id ?? ''} onChange={e => setModelProvider(e.target.value)}>{pickerProviders.map(p => <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}</NativeSelect>}
                  {pickerProvider ? <ModelCommand key={pickerProvider.id} label="搜索模型" onKeyDown={event => {
                    if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.stopPropagation();
                  }}>
                    <CommandInput aria-label="搜索模型" placeholder="搜索模型" />
                    <CommandList className="max-h-[min(40dvh,260px)]">
                      <CommandEmpty>没有匹配的模型</CommandEmpty>
                      {models.map(model => {
                        const sameProvider = pickerProvider.id === conversation?.settings.providerId;
                        const selected = sameProvider && model.value === conversation?.settings.model;
                        return <CommandItem key={model.value} value={`model:${model.value}`} keywords={[model.label]} disabled={settingsLocked} onSelect={() => void saveSettings({
                          providerId: pickerProvider.id, model: model.value, thinking: sameProvider ? effort : '',
                        }, () => setModelOpen(false))}>
                          <span className="min-w-0 flex-1 wrap-anywhere">{model.label}</span>{selected && <Check aria-label="当前模型" />}
                        </CommandItem>;
                      })}
                    </CommandList>
                  </ModelCommand> : <p role="status">{catalog ? '没有可用的执行提供方' : '正在读取模型目录…'}</p>}
                  {!!config?.warning && <small>{config.warning}</small>}
                </PopoverContent>
            </Popover>
            {!!effortLevels.length && <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild><InputGroupButton type="button" variant="ghost" size="sm" aria-label="思考强度" className="chat-effort" disabled={settingsLocked}><Brain /><span>{effort ? effortLabels[effort] ?? effort : '默认'}</span><ChevronDown /></InputGroupButton></DropdownMenuTrigger>
              <DropdownMenuContent container={container} side="top" align="start" aria-label="思考强度">
                <DropdownMenuRadioGroup value={effort} onValueChange={thinking => void saveSettings({thinking})}>
                  <DropdownMenuRadioItem value="">继承提供方设置</DropdownMenuRadioItem>
                  {effortLevels.filter(Boolean).map(level => <DropdownMenuRadioItem key={level} value={level}>{effortLabels[level] ?? level}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>}
            <InputGroupButton type="button" variant="ghost" size="sm" className="chat-tools-button" aria-label={conversation ? `应用工具（已选 ${conversation.settings.tools.length}/${catalog?.toolLimit ?? 100}）` : '应用工具'} disabled={settingsLocked || !catalog} onClick={() => {
              if (conversation) setPanel('tools');
              else void task(async () => { if (await create()) setPanel('tools'); });
            }}><Settings2 /><span>应用工具</span>{conversation && <span>{conversation.settings.tools.length}/{catalog?.toolLimit ?? 100}</span>}</InputGroupButton>
            <div className="chat-spacer" />
            {active && <InputGroupButton type="button" variant="outline" size="icon-sm" aria-label="停止运行" disabled={busy || !active.runId || !!active.stopRequested || !!pending || !!currentRequest} onClick={() => run('stop', {runId: active.runId})}><Square /></InputGroupButton>}
            <InputGroupButton type="submit" size="icon-sm" aria-label={active ? '补充指令' : '发送消息'} disabled={busy || !!pending || !!currentRequest || (!id && (!ready || !catalog || retryCreate)) || (!!active && !active.runId) || (!text.trim() && (!!active || !conversation?.attachments.length))}><ArrowUp /></InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>}
    </main>
    {panel && <Dialog open modal="trap-focus" onOpenChange={open => {if (!open) setPanel(null);}}>
      <DialogContent container={container} className="chat-dialog">
        <DialogHeader><DialogTitle>{title[panel]}</DialogTitle></DialogHeader>
        {panel === 'tools' && conversation && catalog && <Tools key={id} conversation={conversation} catalog={catalog} busy={settingsLocked} save={settings => saveSettings(settings, () => setPanel(null))} />}
        {panel === 'run' && conversation && <div className="chat-panel">{active && <p>当前执行 · {active.observedStatus || '正在启动'}{active.runId && <><br /><code>{active.runId}</code></>}</p>}{!conversation.operations.length && <p>还没有执行记录</p>}{[...conversation.operations].reverse().map(op => <section className="chat-delivery" key={op.key}><strong>{{send:'发送', message:'补充', stop:'停止', answer:'回答'}[op.kind] ?? op.kind}</strong> · {{succeeded:'已受理', rejected:'已拒绝', failed:'失败'}[op.status] ?? '待确认'}{(op.error || op.recoveryNotice) && <p>{op.recoveryNotice || op.error}</p>}<Collapsible><CollapsibleTrigger asChild><Button variant="link" size="sm">请求编号</Button></CollapsibleTrigger><CollapsibleContent><code>{op.key}</code></CollapsibleContent></Collapsible></section>)}</div>}
        {panel === 'scope' && <Scope api={api} id={id} run={task} busy={busy} />}
        {panel === 'delivery' && conversation && <Delivery conversation={conversation} busy={busy} refresh={() => task(async () => update(await api('delivery', {id})))} />}
        {panel === 'image' && image && <img className="chat-image" src={image.src} alt={image.name} />}
        {panel === 'manage' && conversation && <div className="chat-panel">
          <form onSubmit={e => {e.preventDefault(); const title = String(new FormData(e.currentTarget).get('title')).trim(); void task(async () => {update(await api('edit', {id, patch: JSON.stringify({title})})); setPanel(null);});}}><label>名称<Input name="title" defaultValue={conversation.title} required maxLength={120} /></label><Button disabled={busy} type="submit">重命名</Button></form>
          <div className="chat-actions">
            {(['pinned', 'archived'] as const).map((field, i) => <Button key={field} variant="outline" disabled={busy} onClick={() => void task(async () => {update(await api('edit', {id, patch: JSON.stringify({[field]: !conversation[field]})})); setPanel(null);})}>{`${conversation[field] ? '取消' : ''}${['置顶', '归档'][i]}`}</Button>)}
            <Button variant="outline" onClick={() => setPanel('run')}>执行记录</Button><Button variant="outline" onClick={() => setPanel('delivery')}>应用交付</Button><Button variant="outline" onClick={() => setPanel('scope')}>Mind 学习范围</Button>
            <Button variant="outline" disabled={busy || !!active || !!pending} onClick={() => {if (confirm('开始新的执行上下文？现有消息仍保留。')) void task(async () => {update(await api('new-context', {id, confirmed: true})); setPanel(null);});}}>重置执行上下文</Button>
            <Button variant="destructive" disabled={busy || !!active || !!pending || !!currentRequest} onClick={() => {if (confirm(`删除「${conversation.title}」？`)) void task(async () => {await api('delete', {id, confirmed: true}); sessionStorage.removeItem(draftKey(id)); select(''); await refreshList();});}}>删除对话</Button>
          </div>
        </div>}
        {error && <p role="alert" className="chat-panel-error">{error}</p>}
      </DialogContent>
    </Dialog>}
  </div>;
}

export default function mount(element: HTMLElement, host: {call(name: string, args: Record<string, unknown>): Promise<{json: string}>}) {
  const container = document.createElement('div');
  container.dataset.chronaApp = 'chat';
  container.className = 'chat-workbench';
  element.append(container);
  function sizeWorkspace() {
    const viewport = window.visualViewport;
    const top = container.getBoundingClientRect().top;
    container.style.blockSize = `${Math.max(260, (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0) - Math.max(0, top))}px`;
  }
  sizeWorkspace();
  window.addEventListener('resize', sizeWorkspace);
  window.visualViewport?.addEventListener('resize', sizeWorkspace);
  const root = createRoot(container);
  const api: Api = async (name, args = {}) => JSON.parse((await host.call(name, args)).json);
  root.render(<Chat api={api} container={container} />);
  return () => {
    window.removeEventListener('resize', sizeWorkspace);
    window.visualViewport?.removeEventListener('resize', sizeWorkspace);
    root.unmount();
    container.remove();
  };
}
