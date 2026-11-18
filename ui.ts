import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { ConversationMenu } from "./conversation-menu";
import { Workbench, WorkbenchDialog, WorkbenchQuestions } from "./workbench";
import { ConversationList, Messages } from './conversation-view';
import { Drafts, DraftConflicts, Operations, uploadFiles } from './client-state';
import { targetKey, defaultTools } from './tool-selection';
import { mountTasks } from './tasks-ui';
import type { Attachment, Catalog, Conversation, ConversationSummary, ObservationScope, ProviderConfig, Run, Tool } from './view-types';
export default function mount(element: HTMLElement, { call }: { call(name:string,args:Record<string,unknown>):Promise<{json:string}> }) {
  const root = document.createElement('div'); root.className = 'chat-workbench'; root.dataset.chronaApp = 'chat'; element.append(root);
  const shell = createRoot(root);
  flushSync(() => shell.render(createElement(Workbench)));
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const text = $<HTMLTextAreaElement>('textarea'), messages = $('.chat-messages');
  const conversationList = createRoot($('nav')), messageView = createRoot(messages);
  const questionView = createRoot($('.chat-questions'));
  const drafts = new Drafts(localStorage), operations = new Operations(localStorage);
  let c: Conversation | null = null, catalog: Catalog = { providers: [], configs: {}, tools: [] }, list: ConversationSummary[] = [];
  let dead = false, ready = false, busy = false, polling = false, renderSignature = '', drawer = false, creating = false;
  let saveQueue: Promise<unknown> = Promise.resolve(), saveTimer: ReturnType<typeof setTimeout> | undefined, selectionGeneration = 0;
  let mindScope: ObservationScope | null = null, scopeConversationId: string | undefined, scopeBusy = false, scopeGeneration = 0;
  const conflicts = new DraftConflicts(localStorage);
  const conflictMessage = '未保存更改待核对；请在更多操作中选择“核对未保存更改”，再决定是否重试。';
  const menuContainer = $('.chat-more'), menu = createRoot(menuContainer);
  const dialogContainer = $('.chat-dialogs'), dialogs = createRoot(dialogContainer);
  let dialogOrigin: HTMLElement | null = null;
  let retryDraft: (() => void) | undefined;
  const api = async <T = Conversation>(name: string, args: Record<string,unknown> = {}): Promise<T> => {
    const result = await call(name, args);
    if (dead) throw Error('组件已卸载');
    return JSON.parse(result.json);
  };
  const taskViews = mountTasks(root, api, (id, stillSelected) => select(id, true, stillSelected), () => {
    if (drawer) { setDrawer(false); $('.chat-drawer').focus(); }
  }, () => { if (c) draw(); else { $('.chat-toolbar h1').textContent = '对话'; lock(); } });
  function alert(message = '') { if (!dead) { $('.chat-alert').textContent = message; $('.chat-alert').hidden = !message; } }
  function fail(e: unknown) {
    if (dead) return;
    const detail = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ component: 'chat', event: 'workbench_action_failed', error: detail }));
    alert((c && conflicts.read(c.id) ? conflictMessage + '\n' : '') + detail);
  }
  const task = (fn: () => Promise<unknown>) => fn().catch(fail);
  function height() { root.style.height = Math.max(280, (window.visualViewport?.height ?? innerHeight) - root.getBoundingClientRect().top) + 'px'; }
  window.addEventListener('resize', height); window.visualViewport?.addEventListener('resize', height); height();
  function setDrawer(open: boolean) {
    drawer = open;
    root.classList.toggle('chat-drawer-open', open);
    $('.chat-drawer').setAttribute('aria-expanded', String(open));
  }
  const find = $<HTMLFormElement>('.chat-find');
  const findInput = $<HTMLInputElement>('.chat-find input');
  const findStatus = $('.chat-find [role=status]');
  let match: HTMLElement | undefined;
  const copyTimers = new Map<HTMLButtonElement, ReturnType<typeof setTimeout>>();
  let announcementTimer: ReturnType<typeof setTimeout> | undefined;
  function announce(message: string) {
    $('.chat-announcement').textContent = message;
    clearTimeout(announcementTimer);
    announcementTimer = setTimeout(() => { $('.chat-announcement').textContent = ''; }, 1800);
  }
  function syncLatest() {
    $('.chat-jump').hidden = !c || messages.scrollHeight - messages.scrollTop - messages.clientHeight < 120;
  }
  function syncFind(jump: boolean, delta = 0) {
    const previous = match;
    match?.classList.remove('chat-found-current');
    const query = find.hidden ? '' : findInput.value.trim().toLocaleLowerCase();
    const hits = query ? [...messages.querySelectorAll<HTMLElement>('.chat-message')].filter(row =>
      [...row.querySelectorAll('.chat-markdown')].some(body => body.textContent?.toLocaleLowerCase().includes(query))) : [];
    const start = previous ? Math.max(0, hits.indexOf(previous)) : 0;
    const index = hits.length ? (start + delta + hits.length) % hits.length : -1;
    match = hits[index];
    findStatus.textContent = query ? match ? `${index + 1} / ${hits.length}` : '没有匹配' : '';
    find.querySelectorAll<HTMLButtonElement>('[data-action=find-prev],button[type=submit]').forEach(button => { button.disabled = hits.length < 2; });
    match?.classList.add('chat-found-current');
    if (jump) match?.scrollIntoView({ block: 'nearest' });
  }
  function closeFind(returnFocus = false) {
    find.hidden = true; findInput.value = ''; syncFind(false);
    if (returnFocus) $('.chat-find-toggle').focus();
  }
  findInput.oninput = () => { match?.classList.remove('chat-found-current'); match = undefined; syncFind(true); };
  find.onsubmit = event => { event.preventDefault(); syncFind(true, 1); };
  messages.addEventListener('scroll', syncLatest, { passive: true });
  messages.addEventListener('click', event => {
    const code = (event.target as Element).closest<HTMLButtonElement>('button[data-copy=code]');
    if (code) copy(code.parentElement?.querySelector('code')?.textContent ?? '', code);
  });
  function lock() {
    root.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach(b => b.disabled = !ready);
    lockScope();
    const pending = c && (operations.read(c.id) || c.operations.some(o => !['succeeded', 'failed', 'rejected'].includes(o.status)));
    const id = c?.id;
    questionView.render(c?.active?.interactions?.length ? createElement(WorkbenchQuestions, {
      key: id, interactions: c.active.interactions, disabled: !ready || busy || !!pending || !!c.active.ended,
      answer: (questionId, answer) => { if (c?.id === id) void task(() => execute('answer', { questionId, answer })); },
    }) : null);
    menu.render(createElement(ConversationMenu, {
      container: menuContainer, ready, conversation: !!c, pinned: !!c?.pinned, archived: !!c?.archived,
      canDelete: !!c && !c.active && !pending, conflict: !!c && !!conflicts.read(c.id), onSelect: runAction,
    }));
    root.classList.toggle('chat-no-conversation', !c);
    text.disabled = !ready || (!c && creating);
    $<HTMLInputElement>('.chat-upload input').disabled = !ready || !c;
    if (ready && !c) {
      root.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach(b => b.disabled = !['new','new-empty','drawer','mind-scope','scope-refresh'].includes(b.dataset.action!));
      const send = $<HTMLButtonElement>('.chat-send');
      send.disabled = creating || navigator.onLine === false || !text.value.trim() || !catalog.providers.some(provider => provider.available);
      send.textContent = creating ? '正在创建…' : '发送 ↑';
      $('.chat-badge').textContent = '新对话';
      $('.chat-compose-hint').textContent = catalog.providers.some(provider => provider.available) ? '发送时创建对话' : '当前没有可用的对话提供方';
      lockScope();
      return;
    }
    if (!ready || !c) { root.classList.remove('chat-generating'); $('.chat-find-toggle').hidden = true; return; }
    const hasProvider = catalog.providers.some((p) => p.id === c!.settings.providerId && p.available);
    $<HTMLButtonElement>('.chat-send').disabled = navigator.onLine === false || !!conflicts.read(c!.id) || busy || (!text.value.trim() && !c!.attachments.length) || !hasProvider || !!pending || (!!c!.active && !c!.active.runId) || !!c!.active?.ended || !!c!.active?.stopRequested;
    $<HTMLButtonElement>('.chat-send').textContent = c!.active ? '补充 ↑' : '发送 ↑';
    $<HTMLButtonElement>('.chat-stop').hidden = !c!.active?.runId;
    $<HTMLButtonElement>('.chat-stop').disabled = busy || (!!pending && !c!.active?.stopRequested && operations.read(c!.id)?.kind !== 'stop');
    $<HTMLButtonElement>('.chat-stop').textContent = c!.active?.stopRequested ? '核对停止' : '停止';
    $<HTMLSelectElement>('.chat-model').disabled = !ready; $<HTMLSelectElement>('.chat-thinking').disabled = !ready;
    root.classList.toggle('chat-generating', !!c.active);
    $('.chat-find-toggle').hidden = !!taskViews.selected;
    if (!taskViews.selected) $('.chat-badge').textContent = c!.active ? (c!.active.stopRequested ? (c!.active.ended ? '已结束 · 停止未知' : '停止待确认') : c!.active.ended ? '读取记录' : '执行中') : hasProvider ? '可开始对话' : '请选择提供方';
    $('.chat-compose-hint').textContent = navigator.onLine === false ? '当前离线 · 草稿保留在本机，联网后核对保存再发送' : pending ? '请求待确认 · 在执行详情中核对原请求' : c!.active ? '可继续输入补充指令 · 模型设置用于下一轮' : hasProvider ? 'Ctrl / ⌘ + Enter 发送' : '在工具与设置中选择可用的对话提供方';
  }
  function adopt(id: string, next: Conversation) {
    operations.settle(id, next, drafts);
    if (c?.id !== id) return;
    if (next.revision < c!.revision || (c!.updatedAt && next.updatedAt && next.updatedAt < c!.updatedAt)) return;
    c = next; text.value = drafts.value(id, next.draft); draw();
  }
  async function flush() {
    if (!c) return;
    const id = c!.id, local = drafts.read(id);
    if (!local) { await saveQueue; if (conflicts.read(id)) throw Error(conflictMessage); return; }
    const run = saveQueue.then(async () => {
      if (c?.id !== id) return;
      if (conflicts.read(id)) throw Error(conflictMessage);
      try {
        const result = await api('draft', { id, revision: c!.revision, patch: JSON.stringify({ draft: local.text }) });
        // Only the exact saved local version may be removed. New typing remains recoverable.
        drafts.clear(id, local.token); adopt(id, result); return result;
      } catch (e) { if (!conflicts.read(id)) conflicts.edit(id, {}); lock(); throw e; }
    });
    saveQueue = run.then(() => undefined, () => undefined); return run;
  }
  async function saveSettings() {
    if (!c) return;
    const id = c!.id, settings = structuredClone(c!.settings);
    if (conflicts.read(id)) { conflicts.edit(id, { settings }); lock(); throw Error(conflictMessage); }
    const run = saveQueue.then(async () => {
      if (c?.id !== id) return;
      if (conflicts.read(id)) { conflicts.edit(id, { settings }); throw Error(conflictMessage); }
      try {
        const result = await api('draft', { id, revision: c!.revision, patch: JSON.stringify({ settings }) });
        adopt(id, result);
      } catch (e) { conflicts.edit(id, { settings }); lock(); throw e; }
    });
    saveQueue = run.then(() => undefined, () => undefined); return run;
  }
  text.addEventListener('input', () => {
    if (!c) { lock(); return; }
    drafts.edit(c!.id, text.value); lock(); clearTimeout(saveTimer);
    saveTimer = setTimeout(() => task(flush), 350);
  });
  function drawList() {
    const q = $<HTMLInputElement>('.chat-search').value.toLocaleLowerCase(), archived = $<HTMLInputElement>('.chat-archive').checked;
    const items = list.filter(item => !!item.archived === archived && item.title.toLocaleLowerCase().includes(q.trim()));
    flushSync(() => conversationList.render(createElement(ConversationList, { items, selected: c?.id, choose: id => { void task(() => select(id, false, undefined, true)); } })));
  }
  async function refreshList() { list = (await api<{items:ConversationSummary[]}>('list')).items; drawList(); }
  async function createConversation(emptyTools = false) {
    if (creating) return;
    const firstDraft = c ? '' : text.value;
    const route = new URL(window.location.href);
    const prior = route.searchParams.get('createKey');
    if (!prior && !emptyTools && catalog.tools.filter((t) => t.available !== false).length > (catalog.toolLimit ?? 100)) throw Error('可委派工具超过100个，请点击“新对话（关闭工具后手动选择）”。');
    const requestKey = prior || crypto.randomUUID();
    const empty = prior ? route.searchParams.get('createEmpty') === '1' : emptyTools;
    // Persist intent before the first await. Unmount and lost replies retain this exact request.
    const enteringNew = route.searchParams.get('new') !== '1';
    route.searchParams.delete('task'); route.searchParams.delete('conversation');
    route.searchParams.set('new', '1'); route.searchParams.set('createKey', requestKey); route.searchParams.set('createEmpty', empty ? '1' : '0');
    window.history[enteringNew ? 'pushState' : 'replaceState'](window.history.state, '', route.pathname + route.search + route.hash);
    creating = true;
    lock();
    try {
      await flush();
      const stillCreating = () => !dead && new URL(window.location.href).searchParams.get('createKey') === requestKey;
      const created = await api('create', {requestKey, emptyTools: empty});
      if (!stillCreating()) return;
      if (firstDraft) drafts.edit(created.id, firstDraft);
      await select(created.id, false, stillCreating);
      if ((c as Conversation | null)?.id !== created.id) return;
      text.focus();
      return created.id;
    } finally {
      creating = false;
      if (!dead) lock();
    }
  }
  function conversationRoute(id: string, keepTask: boolean, push: boolean) {
    const route = new URL(window.location.href);
    for (const key of ['new', 'createKey', 'createEmpty']) route.searchParams.delete(key);
    if (!keepTask) route.searchParams.delete('task');
    route.searchParams.set('conversation', id);
    if (route.href !== window.location.href) {
      window.history[push ? 'pushState' : 'replaceState'](window.history.state, '', route);
    }
  }
  async function select(id: string, fromTask = false, stillSelected = () => true, push = false) {
    if (!fromTask) taskViews.close();
    if (push) conversationRoute(id, fromTask, true);
    const generation = ++selectionGeneration;
    try { await flush(); } catch (e) { fail(e); } // Recovery reads must bypass failed saves.
    if (dead || generation !== selectionGeneration || !stillSelected()) return;
    const next = await api('read', { id });
    if (dead || generation !== selectionGeneration || !stillSelected()) return;
    if (c?.id === id) adopt(id, next);
    else { c = next; operations.settle(id, next, drafts); text.value = drafts.value(id, next.draft); }
    if (!push) conversationRoute(id, fromTask, false);
    if (window.location.pathname === '/p/chat/main') window.sessionStorage.setItem('chrona.chat.lastConversation', id);
    const returningFromDrawer = drawer || root.classList.contains('chat-drawer-open');
    setDrawer(false); closeFind(); renderSignature = ''; draw(); configOptions(); drawList();
    if (returningFromDrawer) $('.chat-drawer').focus();
  }
  async function reviewDraft() {
    if (!c || !conflicts.read(c!.id)) return;
    const id = c!.id;
    await saveQueue;
    const next = await api('read', { id });
    if ((c as Conversation | null)?.id !== id) return;
    adopt(id, next); configOptions();
    const proposal = conflicts.read(id)!, local = drafts.read(id);
    const review = JSON.stringify({ 服务器: { revision: next.revision, draft: next.draft, settings: next.settings }, 本地未保存: { draft: local?.text, settings: proposal.settings } }, null, 2);
    open('draft-review', { review });
    retryDraft = () => task(async () => {
      const run = saveQueue.then(async () => {
        const patch = { ...(local ? { draft: local.text } : {}), ...(proposal.settings ? { settings: proposal.settings } : {}) };
        const result = await api('draft', { id, revision: next.revision, patch: JSON.stringify(patch) });
        if (local) drafts.clear(id, local.token);
        conflicts.clear(id, proposal.token);
        adopt(id, result);
        configOptions();
      });
      saveQueue = run.then(() => undefined, () => undefined);
      await run;
    });
  }
  function copy(value: string, button?: HTMLButtonElement) {
    void task(async () => {
      await navigator.clipboard.writeText(value);
      if (dead) return;
      if (button) {
        const label = button.dataset.copyLabel ?? button.textContent ?? '';
        button.dataset.copyLabel = label;
        button.textContent = '已复制';
        clearTimeout(copyTimers.get(button));
        copyTimers.set(button, setTimeout(() => {
          if (button.isConnected) button.textContent = label;
          copyTimers.delete(button);
        }, 1500));
      }
      announce('已复制');
    });
  }
  async function previewAttachment(a: Attachment, origin: string) {
    const image = await api<{mime:string;base64:string}>('image', { id: origin, attachmentId: a.id });
    if (c?.id !== origin) return;
    open('image', { image: { name: a.name, src: `data:${image.mime};base64,${image.base64}` } });
  }
  function attachment(a: Attachment) {
    const b = document.createElement('button'); b.textContent = `${a.name} ×`; b.setAttribute('aria-label', `移除图片 ${a.name}`);
    const origin = c!.id;
    const pinned = c!.operations.some(o => !['succeeded', 'rejected', 'failed'].includes(o.status) && o.snapshot?.attachments?.some(x => x.id === a.id));
    if (pinned) { b.disabled = true; b.title = '未确认的发送仍引用此图片'; }
    b.onclick = () => task(async () => { await flush(); adopt(origin, await api('detach', { id: origin, attachmentId: a.id })); });
    return b;
  }
  function draw() {
    if (!c) { lock(); return; }
    if (!taskViews.selected) $('.chat-toolbar h1').textContent = c!.title;
    $('.chat-mind-context').textContent = c!.mindContextStatus ? String(c!.mindContextStatus) : '';
    $('.chat-mind-context').hidden = !c!.mindContextStatus;
    const updates = $('.chat-mind-updates');
    const progress = (c!.mindUpdates ?? []).map((u) => `Mind · ${({waiting:'等待处理',active:'正在继续',candidate:'待核对',done:'已核对完成',paused:'已暂停'} as Record<string,string>)[u.status] ?? '跟进中'}：${u.goal}${u.waitReason ? `；阻塞：${u.waitReason}` : ''}${u.nextStep ? `；下一步：${u.nextStep}` : ''}`).join('\n');
    if (updates.textContent !== progress) updates.textContent = progress;
    updates.hidden = !progress;
    const signature = JSON.stringify([c!.id, c!.messages, c!.active?.transcript, c!.active?.events, c!.active?.gaps]);
    if (signature !== renderSignature) {
      const follow = !renderSignature || messages.scrollHeight - messages.scrollTop - messages.clientHeight < 100, scroll = messages.scrollTop;
      const conversation = c;
      flushSync(() => messageView.render(createElement(Messages, {
        key: conversation.id, conversation,
        preview: image => { void task(() => previewAttachment(image, conversation.id)); }, copy,
      })));
      messages.scrollTop = follow ? messages.scrollHeight : scroll;
      renderSignature = signature;
      syncFind(false); syncLatest();
    }
    $('.chat-attachments').replaceChildren(...c.attachments.map(attachment));
    lock();
    const original = c!.operations.find((o) => o.recoveryNotice)?.recoveryNotice;
    const latest = c!.operations.at(-1);
    const latestError = latest && !['succeeded'].includes(latest.status) ? latest.error : null;
    alert(conflicts.read(c!.id) ? conflictMessage : original ?? c!.active?.error ?? latestError ?? '');
    if (c!.active?.stopRequested && c!.active.ended && !c!.active.stopConfirmed) $('.chat-compose-hint').textContent = '任务观测已结束；停止命令仍未确认，继续保留占用';
  }
  async function execute(kind: string, input: Record<string,unknown> = {}) {
    if (!c || busy) return;
    if (conflicts.read(c!.id) && ['send', 'message', 'answer'].includes(kind)) throw Error(conflictMessage);
    const id = c!.id;
    // Capture identity and draft before any await, including saving the draft.
    const token = drafts.read(id)?.token ?? null, snapshotText = text.value, origin = structuredClone(c);
    busy = true; lock();
    try {
      const saved = kind === 'stop' && conflicts.read(id) ? undefined : await flush();
      const original = operations.read(id);
      const args = original ? null : kind === 'send' ? { snapshot: { draft: snapshotText, revision: saved?.revision ?? origin.revision, attachmentIds: origin.attachments.map((a) => a.id), settings: origin.settings } } : { ...input, runId: origin.active?.runId, ...(kind === 'message' ? { draftSnapshot: { draft: snapshotText, revision: saved?.revision ?? origin.revision } } : {}) };
      const op = original ?? operations.begin(id, kind, args, token);
      const result = await api('execute', { id, key: op.key, kind: op.kind, input: op.input });
      adopt(id, result); await refreshList();
    } finally { busy = false; lock(); }
  }
  function configOptions() {
    if (!c) return;
    const cfg: Partial<ProviderConfig> = catalog.configs[c!.settings.providerId] ?? {};
    const models = cfg.models?.length ? cfg.models : [{ value: '', label: '继承提供方模型' }];
    for (const [selector, values, current] of [ ['.chat-model', models, c!.settings.model], ['.chat-thinking', [{ value: '', label: '思考：默认' }, ...(cfg.thinking ?? []).filter(Boolean).map((value: string) => ({ value, label: '思考：' + value }))], c!.settings.thinking] ] as [string, {value:string;label:string}[], string][]) {
      const select = $<HTMLSelectElement>(selector); select.replaceChildren(); for (const value of values) { const option = document.createElement('option'); option.value = value.value; option.textContent = value.label; select.append(option); } select.value = current;
    }
    const warning = root.querySelector('.chat-config-warning');
    if (warning) warning.textContent = cfg.warning ?? '';
  }
  function closeDialog() {
    retryDraft = undefined;
    flushSync(() => dialogs.render(null));
    dialogOrigin?.focus();
  }
  function open(name: string, content?: { review?: string; image?: { name: string; src: string } }) {
    retryDraft = undefined;
    dialogOrigin = document.activeElement?.closest('[role=menu]')
      ? menuContainer.querySelector('button') : document.activeElement as HTMLElement | null;
    flushSync(() => dialogs.render(createElement(WorkbenchDialog, { name, container: dialogContainer, close: closeDialog, ...content })));
  }
  function lockScope() {
    const loaded = !!mindScope && !scopeBusy;
    if (!root.querySelector('.chat-scope-form')) return;
    $<HTMLInputElement>('.chat-scope-form [name="enabled"]').disabled = !loaded;
    $<HTMLFieldSetElement>('.chat-scope-conversation').disabled = !loaded || !scopeConversationId;
    $<HTMLButtonElement>('.chat-scope-form button[type="submit"]').disabled = !loaded;
    $<HTMLButtonElement>('[data-action="scope-refresh"]').disabled = scopeBusy;
  }
  function showScope(next: ObservationScope | null | undefined) {
    if (!Number.isSafeInteger(next?.revision) || next!.revision < 0 || typeof next!.enabled !== 'boolean' ||
        (scopeConversationId && (next!.conversation?.id !== scopeConversationId || typeof next!.conversation.excluded !== 'boolean' || typeof next!.conversation.private !== 'boolean'))) throw Error('invalid_scope_response');
    mindScope = next!;
    $<HTMLInputElement>('.chat-scope-form [name="enabled"]').checked = next!.enabled;
    for (const name of ['excluded', 'private'] as const) $<HTMLInputElement>('.chat-scope-form [name="' + name + '"]').checked = next!.conversation?.[name] ?? false;
    $('.chat-scope-status').textContent = next!.enabled ? '学习已开启；仅纳入开启后新发送且未排除、非私密会话的内容。' : '学习已关闭，已撤回此前提供的会话内容。';
  }
  async function readScope() {
    if (scopeBusy) return;
    const generation = ++scopeGeneration, conversationId = scopeConversationId;
    mindScope = null; scopeBusy = true; lockScope(); $('.chat-scope-status').textContent = '正在读取学习范围…';
    try {
      const next = await api<ObservationScope>('observation-scope', conversationId ? { conversationId } : {});
      if (!dead && generation === scopeGeneration && root.querySelector('.chat-scope-form')) showScope(next);
    } catch {
      console.error(JSON.stringify({ component: 'chat', event: 'observation_scope_read', error: 'read_or_validation_failed' }));
      if (!dead && generation === scopeGeneration && root.querySelector('.chat-scope-form')) $('.chat-scope-status').textContent = '学习范围读取失败，请重新读取后再修改。';
    } finally { if (!dead && generation === scopeGeneration) { scopeBusy = false; lockScope(); } }
  }
  function saveScope() { if (!mindScope || scopeBusy) return;
    const generation = scopeGeneration;
    const input = { expectedRevision: mindScope.revision, enabled: $<HTMLInputElement>('.chat-scope-form [name="enabled"]').checked,
      ...(scopeConversationId ? { conversationId: scopeConversationId, excluded: $<HTMLInputElement>('.chat-scope-form [name="excluded"]').checked, private: $<HTMLInputElement>('.chat-scope-form [name="private"]').checked } : {}) };
    scopeBusy = true; lockScope(); $('.chat-scope-status').textContent = '正在保存学习范围…';
    task(async () => {
      try {
        const next = await api<ObservationScope>('observation-scope', input);
        if (!dead && generation === scopeGeneration && root.querySelector('.chat-scope-form')) { showScope(next); $('.chat-scope-status').textContent = '已保存。' + $('.chat-scope-status').textContent; }
      } catch {
        console.error(JSON.stringify({ component: 'chat', event: 'observation_scope_save', error: 'save_or_revision_check_failed' }));
        if (!dead && generation === scopeGeneration && root.querySelector('.chat-scope-form')) { mindScope = null; $('.chat-scope-status').textContent = '未确认保存成功，范围可能已在别处修改。请重新读取、核对后再保存。'; }
      } finally { if (!dead && generation === scopeGeneration) { scopeBusy = false; lockScope(); } }
    });
  }
  function tools() {
    const box = $('.chat-tools'), query = $<HTMLInputElement>('.chat-tool-search').value.toLocaleLowerCase(); box.replaceChildren(); const groups = new Map<string, Tool[]>();
    const missing = c!.settings.tools.filter((t) => !catalog.tools.some((x) => targetKey(x.target) === targetKey(t)));
    $('.chat-tool-notice').textContent = missing.length ? `${missing.length} 个已选工具已移除或不可用，选择仍保留；恢复可用后可继续使用，也可全部关闭后重选。` : `已选 ${c!.settings.tools.length} / ${catalog.tools.length} 个应用工具`;
    for (const t of catalog.tools) { const label = typeof t.target === 'string' ? t.target : t.module + '.' + t.target.tool; if (!(label + ' ' + t.description).toLocaleLowerCase().includes(query)) continue; if (!groups.has(t.module)) groups.set(t.module, []); groups.get(t.module)!.push({ ...t, label }); }
    for (const [group, items] of groups) {
      const d = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = group; d.open = !!query; d.append(summary);
      for (const t of items) { const label = document.createElement('label'), input = document.createElement('input'); label.className = 'chat-checkbox'; input.type = 'checkbox'; input.checked = c!.settings.tools.some((x) => targetKey(x) === targetKey(t.target)); input.disabled = t.available === false; input.onchange = () => task(async () => { c!.settings.tools = c!.settings.tools.filter((x) => targetKey(x) !== targetKey(t.target)); if (input.checked) { if (c!.settings.tools.length >= (catalog.toolLimit ?? 100)) { input.checked = false; throw Error('内核每轮最多100个工具，请先关闭其他工具后再选择。'); } c!.settings.tools.push(t.target); } await saveSettings(); }); label.append(input, document.createTextNode(t.label + ' — ' + t.description + (input.disabled ? ' · ' + (t.reason ?? '不可用') : ''))); d.append(label); } box.append(d);
    }
  }
  function settings() {
    open('settings');
    configOptions();
    const select = $<HTMLSelectElement>('.chat-provider'); select.replaceChildren(); const empty = document.createElement('option'); empty.value = ''; empty.textContent = '选择对话提供方'; select.append(empty);
    for (const p of catalog.providers) { const option = document.createElement('option'); option.value = p.id; option.textContent = p.name + (p.available ? '' : '（不可用）'); option.disabled = !p.available; select.append(option); }
    select.value = c!.settings.providerId; tools();
  }
  function delivery() {
    const box = $('.chat-delivery-items'); box.replaceChildren();
    if (!c!.deliveries.length) box.textContent = '这段对话还没有已确认的应用提交回执。';
    for (const d of c!.deliveries) {
      const card = document.createElement('div'); card.className = 'chat-delivery-card'; const h = document.createElement('h3'); h.textContent = d.state; card.append(h);
      for (const m of d.members ?? d.original?.members ?? []) { const p = document.createElement('p'); p.textContent = (m.name ?? '应用') + ' · ' + (m.activation ?? '候选已提交') + ' · 浏览器验收待核实'; card.append(p); }
      if (d.approvalId) { const p = document.createElement('p'); p.textContent = '安装审批：' + d.approvalId; card.append(p); }
      if (d.error) { const p = document.createElement('p'); p.textContent = d.error; card.append(p); }
      const details = document.createElement('details'), summary = document.createElement('summary'), pre = document.createElement('pre'); summary.textContent = '回执证据'; pre.textContent = JSON.stringify(d, null, 2); details.append(summary, pre); card.append(details); box.append(card);
    }
  }
  async function refresh(observe = false) {
    if (!c) return; const id = c!.id;
    if (observe) { adopt(id, await api('read', { id, observe: true })); return; }
    try { await flush(); } catch (e) { fail(e); }
    if (conflicts.read(id)) { adopt(id, await api('read', { id })); configOptions(); return; }
    const pending = operations.read(id);
    if (pending) adopt(id, await api('execute', { id, key: pending.key, kind: pending.kind, input: pending.input }));
    else adopt(id, await api('read', { id }));
  }
  root.addEventListener('click', e => {
    const button = (e.target as Element).closest<HTMLButtonElement>('button[data-action]');
    if (button && !button.disabled) runAction(button.dataset.action!);
  });
  function runAction(action: string) {
    if (!ready) return;
    task(async () => {
      switch (action) {
        case 'tools-all': c!.settings.tools = defaultTools(catalog.tools); await saveSettings(); tools(); break;
        case 'tools-none': c!.settings.tools = []; await saveSettings(); tools(); break;
        case 'new': case 'new-empty': if (await createConversation(action === 'new-empty')) await refreshList(); break;
        case 'find': if (find.hidden) { find.hidden = false; syncFind(false); findInput.focus(); } else closeFind(true); break;
        case 'find-prev': syncFind(true, -1); break;
        case 'find-close': closeFind(true); break;
        case 'latest': messages.scrollTop = messages.scrollHeight; messages.focus({ preventScroll: true }); syncLatest(); break;
        case 'drawer': setDrawer(!drawer); (drawer ? $('.chat-search') : $('.chat-drawer')).focus(); break;
        case 'send': {
          if (!c && !await createConversation()) break;
          if ($<HTMLButtonElement>('.chat-send').disabled) break;
          await execute(c?.active ? 'message' : 'send', { text: text.value });
          break;
        }
        case 'stop': await execute('stop'); break;
        case 'settings': settings(); break;
        case 'mind-scope':
          if (scopeBusy) break;
          open('mind-scope');
          scopeConversationId = c?.id; $('.chat-scope-title').textContent = c?.title ?? '未选择会话，仅修改全局范围';
          await readScope(); break;
        case 'scope-refresh': await readScope(); break;
        case 'review-draft': await reviewDraft(); break;
        case 'refresh': {
          const record = root.querySelector('.chat-diagnostics pre');
          await refresh();
          if (record?.isConnected && c) record.textContent = JSON.stringify({ active: c.active, operations: c.operations }, null, 2);
          break;
        }
        case 'rename': open('rename'); $<HTMLInputElement>('.chat-rename input').value = c!.title; break;
        case 'pin': case 'archive': { const id = c!.id; adopt(id, await api('edit', { id, patch: JSON.stringify(action === 'pin' ? { pinned: !c!.pinned } : { archived: !c!.archived }) })); await refreshList(); break; }
        case 'delete': open('confirm'); break;
        case 'new-context': open('context-confirm'); break;
        case 'delivery': open('delivery'); delivery(); break;
        case 'check-delivery': adopt(c!.id, await api('delivery', { id: c!.id, receiptId: $<HTMLInputElement>('.chat-receipt').value })); delivery(); break;
        case 'diagnostics': open('diagnostics'); $('.chat-recovery-note').textContent = (c!.operations.find((o) => o.recoveryNotice)?.recoveryNotice ?? '核对使用原请求 key，不创建替代任务。') + (c!.active ? ' 当前 Run 观测：' + (c!.active.observedStatus ?? '未知') + '；停止命令：' + (c!.active.stopRequested ? c!.active.stopConfirmed ? '已确认' : '未确认，继续保留占用' : '未请求') : ''); $('.chat-diagnostics pre').textContent = JSON.stringify({ active: c!.active, operations: c!.operations }, null, 2); break;
      }
    });
  }
  dialogContainer.addEventListener('submit', event => {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.matches('.chat-scope-form')) { event.preventDefault(); saveScope(); return; }
    if (!event.target.hasAttribute('data-chat-dialog-form')) return;
    event.preventDefault();
    const action = (event as SubmitEvent).submitter?.getAttribute('value');
    const title = root.querySelector<HTMLInputElement>('.chat-rename input')?.value.trim();
    const retry = retryDraft;
    closeDialog();
    if (action === 'retry') retry?.();
    if (action === 'create') task(async () => {
      const id = c!.id;
      adopt(id, await api('new-context', { id, confirmed: true }));
      alert('已开始新执行上下文，Chat 消息保留');
    });
    if (action === 'delete') task(async () => {
      const id = c!.id;
      await api('delete', { id, confirmed: true });
      drafts.clear(id, drafts.read(id)?.token);
      c = null;
      await refreshList();
      if (list[0]) await select(list[0].id);
      else if (await createConversation()) await refreshList();
    });
    if (action === 'save') task(async () => {
      const id = c!.id;
      adopt(id, await api('edit', { id, patch: JSON.stringify({ title }) }));
      await refreshList();
    });
  });
  $<HTMLInputElement>('.chat-search').oninput = drawList;
  $<HTMLInputElement>('.chat-archive').onchange = drawList;
  root.addEventListener('input', event => { if ((event.target as Element).matches('.chat-tool-search')) tools(); });
  root.addEventListener('change', event => {
    const field = event.target as HTMLSelectElement;
    const name = field.matches('.chat-model') ? 'model' : field.matches('.chat-thinking') ? 'thinking' : field.matches('.chat-provider') ? 'providerId' : null;
    if (!name || !c) return;
    task(async () => {
      c!.settings[name] = field.value;
      if (name === 'providerId') { c!.settings.model = ''; c!.settings.thinking = ''; }
      await saveSettings();
      configOptions();
    });
  });
  function upload(files: File[]) {
    if (!c || !files.length) return;
    const origin = c.id;
    void task(async () => { await flush(); await uploadFiles(origin, files, args => api('upload', args), adopt); });
  }
  const uploadInput = $<HTMLInputElement>('.chat-upload input');
  uploadInput.onchange = () => { const files = [...uploadInput.files ?? []]; uploadInput.value = ''; upload(files); };
  text.onpaste = event => {
    const clipboard = event.clipboardData;
    const images = [...clipboard?.files ?? []].filter(file => /^image\/(png|jpeg|gif|webp)$/.test(file.type));
    if (!images.length) return;
    if (!clipboard?.getData('text/plain')) event.preventDefault();
    upload(images);
  };
  text.onkeydown = (e: KeyboardEvent) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) { e.preventDefault(); $<HTMLButtonElement>('.chat-send').click(); } };
  root.addEventListener('keydown', e => { if (e.key !== 'Escape' || (e.target as Element).closest('[role=dialog],[role=menu]')) return;
    if (drawer) { setDrawer(false); $('.chat-drawer').focus(); }
    else if (!find.hidden) closeFind(true); });
  const interval = setInterval(() => {
    if (dead || !ready || polling || busy || document.hidden) return;
    polling = true;
    task(async () => { await refresh(true); await taskViews.refresh(); }).finally(() => { polling = false; });
  }, 2000);
  const offline = () => lock();
  const reconnect = () => { lock(); task(refresh); }; window.addEventListener('online', reconnect); window.addEventListener('offline', offline);
  lock();
  const retry = $<HTMLButtonElement>('.chat-load-retry');
  async function initialize() {
    retry.hidden = true; alert();
    const url = new URL(window.location.href);
    const catalogRead = api<Catalog>('catalog').then(value => { catalog = value; });
    const conversationsRead = (async () => {
      await refreshList();
      if (url.searchParams.get('new') === '1') return;
      const requested = url.searchParams.get('conversation');
      const selected = requested ? list.find(x => x.id === requested) : list.find(x => !x.archived);
      if (selected) await select(selected.id, url.searchParams.has('task'));
      else flushSync(() => messageView.render(createElement('div', { className: 'chat-empty' },
        createElement('h2', null, requested ? '这段对话已不可用' : '开始新对话'),
        requested ? createElement('p', null, '从会话列表打开其他对话，或在下方输入新消息。') : null)));
    })();
    await Promise.all([catalogRead, conversationsRead]);
    const availableCount = catalog.tools.filter((t) => t.available !== false).length;
    $('[data-action="new-empty"]').hidden = availableCount <= (catalog.toolLimit ?? 100);
    if (url.searchParams.get('new') === '1') {
      if (!url.searchParams.has('createKey') && availableCount > (catalog.toolLimit ?? 100)) {
        ready = true; lock(); throw Error(`已发现 ${availableCount} 个可委派工具，内核每轮最多100个。请点击“新对话（关闭工具后手动选择）”，再选择最多100个工具。`);
      }
      try { if (await createConversation()) await refreshList(); }
      finally { if (!dead) { ready = true; lock(); } }
    }
    if (c) configOptions();
    ready = true; lock();
    await taskViews.refresh();
    if (url.searchParams.has('task')) await taskViews.select(url.searchParams.get('task')!);
  }
  const start = () => { void initialize().catch(error => {
    if (!dead && !ready) { retry.hidden = false; $('.chat-badge').textContent = '读取失败'; }
    fail(error);
  }); };
  retry.onclick = start;
  start();
  return () => { dead = true; taskViews.destroy(); clearInterval(interval); clearTimeout(saveTimer); clearTimeout(announcementTimer); for (const timer of copyTimers.values()) clearTimeout(timer); copyTimers.clear(); window.removeEventListener('resize', height); window.visualViewport?.removeEventListener('resize', height); window.removeEventListener('online', reconnect); window.removeEventListener('offline', offline); root.remove(); queueMicrotask(() => { conversationList.unmount(); messageView.unmount(); questionView.unmount(); menu.unmount(); dialogs.unmount(); shell.unmount(); }); };
}
