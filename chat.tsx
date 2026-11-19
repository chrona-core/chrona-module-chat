import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatLocale, type Locale, useTranslation } from './locale';
import { ArrowUp, Brain, ChevronDown, Ellipsis, Menu, Paperclip, Plus, Search, Settings2, Square, X } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './elements/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './elements/alert-dialog';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './elements/sheet';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from './elements/sidebar-menu';
import { Empty, EmptyTitle } from './elements/empty';
import { Alert, AlertDescription } from './elements/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './elements/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './elements/tabs';
import { Attachment, AttachmentAction, AttachmentActions, AttachmentGroup, AttachmentTitle } from './elements/attachment';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from './elements/input-group';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './elements/command';
import { Card, CardContent, CardHeader, CardTitle } from './elements/card';
import { Field, FieldGroup, FieldLabel } from './elements/field';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem } from './elements/dropdown-menu';
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
  const t = useTranslation();
  const [id, setId] = useState(selectedId);
  const [loaded, setLoaded] = useState<Conversation>();
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [catalog, setCatalog] = useState<Catalog>();
  const [error, setError] = useState('');
  const [readError, setReadError] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [drawerContainer, setDrawerContainer] = useState<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const [find, setFind] = useState<string | null>(null);
  const [panel, setPanel] = useState<'tools' | 'manage' | 'rename' | 'confirm' | 'delivery' | 'scope' | 'image' | 'run' | null>(null);
  const [confirmation, setConfirmation] = useState<'delete' | 'new-context' | null>(null);
  const confirmationTrigger = useRef<HTMLButtonElement>(null);
  const cancelConfirmation = useRef<HTMLButtonElement>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const modelSearch = useRef<HTMLInputElement>(null);
  const modelTrigger = useRef<HTMLButtonElement>(null);
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
    setConfirmation(null);
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
      throw Error(result?.recoveryNotice ?? result?.error ?? t('请求结果待确认，请核对原请求。'));
    }
    sessionStorage.removeItem(requestKey(target));
    setRetry(undefined);
    if (result.status !== 'succeeded') throw Error(result.error ?? t('操作失败'));
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
      if (oversized) throw Error(t('{0} 超过 2 MiB', oversized.name));
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
  const effortLevels = provider ? catalog?.configs[provider.id]?.thinking ?? [] : [];
  const effort = conversation?.settings.thinking ?? '';
  const effortLabels: Record<string, string> = {off:t('关闭'), minimal:t('最低'), low:t('低'), medium:t('中'), high:t('高'), xhigh:t('很高'), max:t('最高')};
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
  const canChangeContext = !busy && !active && !pending;
  function confirmConversationChange() {
    if (!confirmation || !canChangeContext || (confirmation === 'delete' && currentRequest)) return;
    const action = confirmation;
    setConfirmation(null);
    void task(async () => {
      if (action === 'delete') {
        await api('delete', {id, confirmed: true});
        sessionStorage.removeItem(draftKey(id));
        select('');
        await refreshList();
      } else {
        update(await api('new-context', {id, confirmed: true}));
      }
      setPanel(null);
    });
  }

  function openConversationPanel(row: ConversationSummary, nextPanel: 'manage' | 'rename' | 'run' | 'scope' | 'delivery', action?: 'delete' | 'new-context') {
    if (selection.current !== row.id) select(row.id);
    setDrawer(false);
    setPanel(action ? 'confirm' : nextPanel);
    if (action) {
      confirmationTrigger.current = null;
      setConfirmation(action);
    }
  }

  function toggleConversation(row: ConversationSummary, field: 'pinned' | 'archived') {
    return task(async () => update(await api('edit', {id: row.id, patch: JSON.stringify({[field]: !row[field]})})));
  }

  const title = {tools: t('应用工具'), manage: t('管理对话'), rename: t('重命名对话'), run: t('执行记录'), delivery: t('应用交付'), scope: t('Mind 学习范围'), image: image?.name ?? t('附件')};
  const confirmationDialog = conversation && (<AlertDialog open={confirmation !== null} onOpenChange={open => {if (!open) {setConfirmation(null); if (panel === 'confirm') setPanel(null);}}}>
          <AlertDialogContent container={container} initialFocus={cancelConfirmation} finalFocus={confirmationTrigger}>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmation === 'delete' ? t('删除对话？') : t('重置执行上下文？')}</AlertDialogTitle>
              <AlertDialogDescription>{confirmation === 'delete' ? t('将删除「{0}」及其附件。此操作无法撤销。', conversation.title) : t('后续执行将使用新的上下文，现有对话消息会保留。')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel ref={cancelConfirmation}>{t("取消")}</AlertDialogCancel>
              <AlertDialogAction variant={confirmation === 'delete' ? 'destructive' : 'default'} disabled={!canChangeContext || (confirmation === 'delete' && !!currentRequest)} onClick={confirmConversationChange}>
                {confirmation === 'delete' ? t('删除对话') : t('重置执行上下文')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>);
  const conversationList = <>
      <Button className="chat-new" disabled={busy} onClick={() => {select(''); requestAnimationFrame(() => composerInput.current?.focus());}}><Plus />{t("新对话")}</Button>
      <Input aria-label={t("搜索对话")} placeholder={t("搜索对话")} value={query} onChange={e => setQuery(e.target.value)} />
      <Tabs className="min-h-0 flex-1" value={archived ? 'archived' : 'current'} onValueChange={value => setArchived(value === 'archived')}>
        <TabsList aria-label={t("筛选对话")} className="min-h-10 w-full shrink-0" activateOnFocus>
          <TabsTrigger value="current" className="data-active:font-semibold">{t("未归档")}</TabsTrigger>
          <TabsTrigger value="archived" className="data-active:font-semibold">{t("已归档")}</TabsTrigger>
        </TabsList>
        {(['current', 'archived'] as const).map(value => <TabsContent key={value} value={value} className="min-h-0 overflow-y-auto">
          {(value === 'archived') === archived && (
            <nav aria-label={t("会话列表")}>
              <SidebarMenu>{visible.map(row => <SidebarMenuItem key={row.id} className="flex items-center gap-1">
                <SidebarMenuButton type="button" className="chat-conversation-title min-w-0 flex-1" title={row.title} isActive={id === row.id} aria-current={id === row.id ? 'page' : undefined} onClick={() => select(row.id)}>
                  {row.pinned && <span aria-label={t("已置顶")}>↟</span>}<span className="truncate">{row.title}</span>
                </SidebarMenuButton>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger render={<Button type="button" size="icon-sm" variant="ghost" aria-label={t('操作：{0}', row.title)} />}><Ellipsis /></DropdownMenuTrigger>
                  <DropdownMenuContent container={drawer ? drawerContainer ?? container : container} align="end" aria-label={t('{0}的操作', row.title)}>
                    <DropdownMenuItem onClick={() => openConversationPanel(row, 'rename')}>{t("重命名")}</DropdownMenuItem>
                    <DropdownMenuItem disabled={busy} onClick={() => void toggleConversation(row, 'pinned')}>{row.pinned ? t('取消置顶') : t('置顶')}</DropdownMenuItem>
                    <DropdownMenuItem disabled={busy} onClick={() => void toggleConversation(row, 'archived')}>{row.archived ? t('取消归档') : t('归档')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openConversationPanel(row, 'run')}>{t("执行记录")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openConversationPanel(row, 'delivery')}>{t("应用交付")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openConversationPanel(row, 'scope')}>{t("Mind 学习范围")}</DropdownMenuItem>
                    <DropdownMenuItem disabled={busy} onClick={() => openConversationPanel(row, 'manage', 'new-context')}>{t("重置执行上下文")}</DropdownMenuItem>
                    <DropdownMenuItem disabled={busy} variant="destructive" onClick={() => openConversationPanel(row, 'manage', 'delete')}>{t("删除对话")}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>)}</SidebarMenu>
              {ready && !visible.length && <Empty className="chat-list-empty"><EmptyTitle>{query ? t('没有匹配的对话') : archived ? t('没有归档对话') : t('还没有对话')}</EmptyTitle></Empty>}
            </nav>
          )}
        </TabsContent>)}
      </Tabs>
  </>;
  return <div className="chat-layout">
    <aside className="chat-sidebar" aria-label={t("聊天导航")}><strong className="chat-sidebar-heading">{t("对话")}</strong>{conversationList}</aside>
    <main className="chat-main">
      <header className="chat-header">
        <Sheet open={drawer} onOpenChange={setDrawer} modal="trap-focus">
          <SheetTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("打开会话列表")} className="chat-mobile" />}><Menu /></SheetTrigger>
          <SheetContent ref={setDrawerContainer} container={container} side="left" className="chat-sidebar chat-sidebar-sheet"><SheetTitle>{t("对话")}</SheetTitle>{conversationList}</SheetContent>
        </Sheet>
        <h1>{conversation?.title ?? items.find(c => c.id === id)?.title ?? t('对话')}</h1>
        {!!id && <Button className="chat-mobile" size="icon-sm" aria-label={t("新对话")} disabled={busy} onClick={() => select('')}><Plus /></Button>}
        {conversation && <><span className="chat-run-status" role="status">{active ? active.stopRequested ? t('正在停止') : t('运行中') : ''}</span><Button variant="ghost" size="icon-sm" aria-label={t("搜索消息")} onClick={() => setFind(find === null ? '' : null)}><Search /></Button><Button variant="ghost" size="icon-sm" aria-label={t("管理对话")} onClick={() => setPanel('manage')}><Ellipsis /></Button></>}
      </header>
      {find !== null && <div className="chat-find"><Input autoFocus aria-label={t("搜索消息")} placeholder={t("搜索本对话的消息")} value={find} onChange={e => setFind(e.target.value)} /><Button variant="ghost" size="icon-sm" aria-label={t("关闭搜索")} onClick={() => setFind(null)}><X /></Button></div>}
      {(error || readError || currentRequest || pending || retryCreate) && <Alert variant="destructive" className="chat-notice"><AlertDescription>{error || readError || pending?.recoveryNotice || t('请求结果待确认')}</AlertDescription>{retryCreate && !currentRequest ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void task(() => create())}>{t("核对新对话")}</Button> : currentRequest ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void task(() => execute(currentRequest))}>{t("核对原请求")}</Button> : pending ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void task(async () => update(await api('read', {id})))}>{t("核对请求")}</Button> : !ready || !catalog ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void task(initialize)}>{t("重试")}</Button> : <Button variant="ghost" size="icon-sm" aria-label={t("关闭提示")} onClick={() => {setError(''); setReadError('');}}><X /></Button>}</Alert>}
      {conversation ? <Thread key={id} conversation={conversation} query={find ?? ''} disabled={busy || !!currentRequest || !!pending} answer={(questionId, answer) => run('answer', {questionId, answer, runId: active?.runId})} showImage={attachment => void task(async () => {
        const data = await api<{ mime: string; base64: string }>('image', {id, attachmentId: attachment.id});
        setImage({ name: attachment.name, src: `data:${data.mime};base64,${data.base64}` }); setPanel('image');
      })} /> : id && <div className="chat-welcome" role="status">{readError ? t('无法打开对话') : t('正在读取对话…')}</div>}
      {(conversation || !id) && <form className={`chat-composer${id ? '' : ' chat-composer-start'}`} onDragOver={e => {if (e.dataTransfer.types.includes('Files')) e.preventDefault();}} onDrop={e => {if (e.dataTransfer.files.length) {e.preventDefault(); upload(e.dataTransfer.files);}}} onSubmit={e => {e.preventDefault(); send();}}>
        {!id && <h2>{t("想做些什么？")}</h2>}
        <InputGroup className="chat-prompt overflow-hidden bg-background dark:bg-background">
          {!!conversation?.attachments.length && <InputGroupAddon align="block-start">
            <AttachmentGroup>{conversation.attachments.map(file => <Attachment key={file.id} size="sm">
              <Paperclip size={14} /><AttachmentTitle>{file.name}</AttachmentTitle>
              <AttachmentActions><AttachmentAction type="button" aria-label={t('移除 {0}', file.name)} disabled={busy || !!pending || !!currentRequest} onClick={() => void task(async () => update(await api('detach', {id, attachmentId: file.id})))}><X /></AttachmentAction></AttachmentActions>
            </Attachment>)}</AttachmentGroup>
          </InputGroupAddon>}
          <label className="sr-only" htmlFor="chat-message">{t("消息")}</label>
          <InputGroupTextarea className="min-h-16 max-h-[24dvh] p-3" ref={composerInput} id="chat-message" value={text} onChange={e => writeDraft(e.target.value)} placeholder={active ? t('给正在运行的 Agent 补充指令…') : id ? t('输入消息，或粘贴图片…') : t('输入第一条消息，或粘贴图片…')} onPaste={e => {
            const images = [...e.clipboardData.files].filter(file => file.type.startsWith('image/'));
            if (images.length && !settingsLocked) {e.preventDefault(); upload(images);}
          }} onKeyDown={e => {
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
            e.preventDefault(); e.currentTarget.form?.requestSubmit();
          }} />
          <InputGroupAddon align="block-end" className="gap-1 border-t border-input bg-muted px-2 py-2">
            <Input ref={fileInput} type="file" hidden multiple accept="image/png,image/jpeg,image/gif,image/webp" onChange={e => {if (e.currentTarget.files) upload(e.currentTarget.files); e.currentTarget.value = '';}} />
            <InputGroupButton type="button" variant="outline" size="icon-sm" className="rounded-full" aria-label={t("添加图片")} disabled={settingsLocked} onClick={() => fileInput.current?.click()}><Plus /></InputGroupButton>
            <Dialog open={modelOpen} onOpenChange={setModelOpen} modal="trap-focus">
              <DialogTrigger render={<InputGroupButton ref={modelTrigger} type="button" variant="ghost" size="sm" className="min-w-0 max-w-[min(38vw,350px)] shrink" aria-label={t("选择模型")} disabled={settingsLocked} />}>
                <span className="truncate">{conversation?.settings.model || provider?.name || t('选择模型')}</span><ChevronDown />
              </DialogTrigger>
              <DialogContent container={container} initialFocus={modelSearch} finalFocus={modelTrigger} showCloseButton={false} aria-describedby={undefined} className="p-0">
                <DialogTitle className="sr-only">{t('模型选择')}</DialogTitle>
                <Command className="**:data-[slot=command-input-wrapper]:h-auto">
                  <CommandInput ref={modelSearch} aria-label={t("搜索模型")} placeholder={t("搜索模型")} onKeyDown={event => {
                    if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.stopPropagation();
                  }} />
                  <CommandList className="max-h-[min(50dvh,320px)]">
                    <CommandEmpty>{!catalog ? t('正在读取模型目录…') : pickerProviders.length ? t('没有匹配的模型') : t('没有可用的执行提供方')}</CommandEmpty>
                    {pickerProviders.map(candidate => {
                      const config = catalog?.configs[candidate.id];
                      const sameProvider = candidate.id === conversation?.settings.providerId;
                      const models = [{value:'', label:t('继承提供方设置')}, ...(config?.models ?? []).filter(model => model.value)];
                      return <CommandGroup key={candidate.id} heading={candidate.name} className="[&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:gap-1">
                        {models.map(model => <CommandItem key={model.value} className="min-h-11 cursor-pointer border border-transparent px-3 data-[selected=true]:border-input" value={JSON.stringify([candidate.id, model.value])} keywords={[candidate.name, model.label]} disabled={settingsLocked} data-checked={sameProvider && model.value === conversation?.settings.model} onSelect={() => void saveSettings({
                          providerId: candidate.id, model: model.value, thinking: sameProvider ? effort : '',
                        }, () => setModelOpen(false))}>
                          <span className="min-w-0 flex-1 truncate">{model.label}</span>
                        </CommandItem>)}
                        {config && models.length === 1 && <p className="px-2 py-1 text-xs text-muted-foreground">{t('提供方未返回可选模型')}</p>}
                        {config?.warning && <p className="px-2 py-1 text-xs text-muted-foreground wrap-anywhere">{config.warning}</p>}
                      </CommandGroup>;
                    })}
                  </CommandList>
                  {error && <p role="alert" className="px-3 pb-2 text-sm text-destructive">{error}</p>}
                </Command>
              </DialogContent>
            </Dialog>
            {!!effortLevels.length && <DropdownMenu modal={false}>
              <DropdownMenuTrigger render={<InputGroupButton type="button" variant="ghost" size="sm" aria-label={t("思考强度")} className="chat-effort" disabled={settingsLocked} />}><Brain /><span>{effort ? effortLabels[effort] ?? effort : t('默认')}</span><ChevronDown /></DropdownMenuTrigger>
              <DropdownMenuContent container={container} side="top" align="start" aria-label={t("思考强度")}>
                <DropdownMenuRadioGroup value={effort} onValueChange={thinking => void saveSettings({thinking})}>
                  <DropdownMenuRadioItem closeOnClick value="">{t("继承提供方设置")}</DropdownMenuRadioItem>
                  {effortLevels.filter(Boolean).map(level => <DropdownMenuRadioItem closeOnClick key={level} value={level}>{effortLabels[level] ?? level}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>}
            <InputGroupButton type="button" variant="ghost" size="sm" className="chat-tools-button" aria-label={conversation ? t('应用工具（已选 {0}/{1}）', conversation.settings.tools.length, catalog?.toolLimit ?? 100) : t('应用工具')} disabled={settingsLocked || !catalog} onClick={() => {
              if (conversation) setPanel('tools');
              else void task(async () => { if (await create()) setPanel('tools'); });
            }}><Settings2 /><span>{t("应用工具")}</span>{conversation && <span>{conversation.settings.tools.length}/{catalog?.toolLimit ?? 100}</span>}</InputGroupButton>
            {active && <InputGroupButton type="button" variant="outline" size="icon-sm" className="ml-auto rounded-full" aria-label={t("停止运行")} disabled={busy || !active.runId || !!active.stopRequested || !!pending || !!currentRequest} onClick={() => run('stop', {runId: active.runId})}><Square /></InputGroupButton>}
            <InputGroupButton type="submit" size="icon-sm" className={active ? 'rounded-full' : 'ml-auto rounded-full'} aria-label={active ? t('补充指令') : t('发送消息')} disabled={busy || !!pending || !!currentRequest || (!id && (!ready || !catalog || retryCreate)) || (!!active && !active.runId) || (!text.trim() && (!!active || !conversation?.attachments.length))}><ArrowUp /></InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>}
    </main>
    {panel && panel !== 'confirm' && <Dialog open modal="trap-focus" onOpenChange={open => {if (!open) setPanel(null);}}>
      <DialogContent container={container} className="max-h-[86dvh] overflow-auto overscroll-contain sm:max-w-xl">
        <DialogHeader><DialogTitle>{title[panel]}</DialogTitle></DialogHeader>
        {panel === 'tools' && conversation && catalog && <Tools key={id} conversation={conversation} catalog={catalog} busy={settingsLocked} save={settings => saveSettings(settings, () => setPanel(null))} />}
        {panel === 'run' && conversation && <div className="grid gap-3">{active && <p>{t("当前执行 ·")} {active.observedStatus || t('正在启动')}{active.runId && <><br /><code>{active.runId}</code></>}</p>}{!conversation.operations.length && <p>{t("还没有执行记录")}</p>}{[...conversation.operations].reverse().map(op => <Card size="sm" key={op.key}><CardHeader><CardTitle>{{send:t('发送'), message:t('补充'), stop:t('停止'), answer:t('回答')}[op.kind] ?? op.kind} · {{succeeded:t('已受理'), rejected:t('已拒绝'), failed:t('失败')}[op.status] ?? t('待确认')}</CardTitle></CardHeader><CardContent>{(op.error || op.recoveryNotice) && <p>{op.recoveryNotice || op.error}</p>}<Collapsible><CollapsibleTrigger render={<Button variant="link" size="sm" />}>{t("请求编号")}</CollapsibleTrigger><CollapsibleContent><code>{op.key}</code></CollapsibleContent></Collapsible></CardContent></Card>)}</div>}
        {panel === 'scope' && <Scope api={api} id={id} run={task} busy={busy} />}
        {panel === 'delivery' && conversation && <Delivery conversation={conversation} busy={busy} refresh={() => task(async () => update(await api('delivery', {id})))} />}
        {panel === 'image' && image && <img className="chat-image" src={image.src} alt={image.name} />}
        {panel !== 'tools' && panel !== 'image' && !conversation && <p role="status">{readError || t('正在读取对话…')}</p>}
        {(panel === 'manage' || panel === 'rename') && conversation && (<form onSubmit={e => {e.preventDefault(); const title = String(new FormData(e.currentTarget).get('title')).trim(); void task(async () => {update(await api('edit', {id, patch: JSON.stringify({title})})); setPanel(null);});}}><FieldGroup className="gap-3"><Field><FieldLabel htmlFor="chat-rename">{t("对话名称")}</FieldLabel><Input id="chat-rename" name="title" defaultValue={conversation.title} required maxLength={120} /></Field><div className="flex justify-end"><Button disabled={busy} type="submit">{t("重命名")}</Button></div></FieldGroup></form>)}
        {panel === 'manage' && conversation && <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {(['pinned', 'archived'] as const).map(field => <Button key={field} variant="outline" disabled={busy} onClick={() => void task(async () => {update(await api('edit', {id, patch: JSON.stringify({[field]: !conversation[field]})})); setPanel(null);})}>{t(field === 'pinned' ? conversation.pinned ? '取消置顶' : '置顶' : conversation.archived ? '取消归档' : '归档')}</Button>)}
            <Button variant="outline" onClick={() => setPanel('run')}>{t("执行记录")}</Button><Button variant="outline" onClick={() => setPanel('delivery')}>{t("应用交付")}</Button><Button variant="outline" onClick={() => setPanel('scope')}>{t("Mind 学习范围")}</Button>
            <Button variant="outline" disabled={!canChangeContext} onClick={event => {confirmationTrigger.current = event.currentTarget; setConfirmation('new-context');}}>{t("重置执行上下文")}</Button>
            <Button variant="destructive" disabled={!canChangeContext || !!currentRequest} onClick={event => {confirmationTrigger.current = event.currentTarget; setConfirmation('delete');}}>{t("删除对话")}</Button>
          </div>
        </div>}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {panel === 'manage' && confirmationDialog}
      </DialogContent>
    </Dialog>}
    {panel === 'confirm' && confirmationDialog}
  </div>;
}

export default function mount(element: HTMLElement, host: { readonly locale?: Locale; subscribeLocale?(listener: (locale: Locale) => void): () => void; call(name: string, args: Record<string, unknown>): Promise<{json: string}>}) {
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
  const render = (locale: Locale) => {
    container.lang = locale;
    root.render(<ChatLocale value={locale}><Chat api={api} container={container} /></ChatLocale>);
  };
  const unsubscribe = host.subscribeLocale?.(render);
  render(host.locale ?? 'zh-CN');
  return () => {
    unsubscribe?.();
    window.removeEventListener('resize', sizeWorkspace);
    window.visualViewport?.removeEventListener('resize', sizeWorkspace);
    root.unmount();
    container.remove();
  };
}
