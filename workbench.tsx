import { useId } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Textarea } from './textarea';
import { NativeSelect } from './native-select';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import type { Run } from './view-types';

export function Workbench() {
  const sidebarId = useId(), messageId = useId();
  return (
    <>
      <aside className="chat-sidebar" id={sidebarId} aria-label="会话">
        <div className="chat-brand">
          <b>会话</b>
          <Button variant="outline"
            data-action="drawer"
            className="chat-close"
            aria-label="关闭会话列表"
          >
            ×
          </Button>
        </div>
        <Button type="button" className="chat-new" data-action="new">
          ＋ 新对话
        </Button>
        <Button variant="outline" type="button" data-action="new-empty" hidden>
          新对话（关闭工具后手动选择）
        </Button>
        <Input
          className="chat-search"
          type="search"
          placeholder="搜索会话"
          aria-label="搜索会话"
        />
        <nav aria-label="会话列表"></nav>
        <label className="chat-checkbox">
          <input className="chat-archive" type="checkbox" />
          查看已归档
        </label>
        <section className="chat-tasks" aria-label="后台任务">
          <div className="chat-task-heading"><b>后台任务</b><Button variant="outline" type="button" className="chat-tasks-refresh">刷新</Button></div>
          <p className="chat-task-load" role="status">正在加载任务…</p>
          <nav aria-label="后台任务列表" />
        </section>
      </aside>
      <div className="chat-main">
        <div className="chat-toolbar">
          <Button variant="outline"
            className="chat-drawer"
            data-action="drawer"
            aria-label="打开会话列表"
            aria-expanded="false"
            aria-controls={sidebarId}
          >
            会话
          </Button>
          <h1>对话</h1>
          <Button type="button" className="chat-quick-new" data-action="new">
            新对话
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="chat-find-toggle"
            data-action="find"
            aria-label="查找消息"
            title="查找消息"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="6" />
              <path d="m16 16 4 4" />
            </svg>
          </Button>
          <span className="chat-badge">正在加载</span>
          <div className="chat-more" />
        </div>
        <div className="chat-content">
          <div className="chat-thread">
            <div className="chat-announcement sr-only" role="status"></div>
            <div className="chat-alert" role="status" hidden></div>
            <Button variant="outline" type="button" className="chat-load-retry" hidden>重新读取对话</Button>
            <div
              className="chat-alert chat-mind-context"
              role="status"
              hidden
            ></div>
            <div
              className="chat-mind-updates chat-alert"
              role="status"
              aria-atomic="true"
              hidden
            ></div>
            <form
              className="chat-find"
              role="search"
              aria-label="查找当前对话"
              hidden
            >
              <Input
                type="search"
                aria-label="搜索消息"
                placeholder="查找当前对话"
              />
              <span role="status" />
              <Button variant="outline" type="button" aria-label="上一个匹配" data-action="find-prev">
                ↑
              </Button>
              <Button variant="outline" type="submit" aria-label="下一个匹配">
                ↓
              </Button>
              <Button variant="outline"
                type="button"
                aria-label="关闭消息查找"
                data-action="find-close"
              >
                ×
              </Button>
            </form>
            <div className="chat-messages" tabIndex={0} aria-label="消息记录"></div>
            <div className="chat-jump" hidden>
              <Button type="button" variant="outline" data-action="latest">
                回到最新消息 ↓
              </Button>
            </div>
            <div className="chat-questions"></div>
            <div className="chat-compose">
              <div className="chat-attachments"></div>
              <label className="chat-message-label" htmlFor={messageId}>消息</label>
              <Textarea id={messageId} rows={2} placeholder="输入你想说的内容…" disabled />
              <div className="chat-compose-bar">
                <div className="chat-next-turn">
                  <NativeSelect className="chat-model" aria-label="下一轮模型" disabled />
                  <NativeSelect className="chat-thinking" aria-label="下一轮思考强度" disabled />
                </div>
                <label className="chat-upload" title="添加图片">
                  <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5 12 20.5a5 5 0 0 1-7-7l9-9a3 3 0 0 1 4.2 4.2L9.3 17.6a1 1 0 0 1-1.4-1.4L16 8" />
                  </svg>
                  <input
                    aria-label="添加图片"
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    multiple
                    disabled
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  className="chat-tools-button"
                  data-action="settings"
                >
                  工具
                </Button>
                <span className="chat-spacer"></span>
                <Button
                  type="button"
                  className="chat-stop"
                  data-action="stop"
                  hidden
                >
                  停止
                </Button>
                <Button
                  type="button"
                  className="chat-send"
                  data-action="send"
                  disabled
                >
                  发送 ↑
                </Button>
              </div>
              <div className="chat-compose-hint"></div>
            </div>
          </div>
          <section className="chat-task-panel" aria-label="任务进展" hidden>
            <div className="chat-task-overview" />
            <div className="chat-task-artifacts" />
            <div className="chat-task-artifact" hidden />
            <p className="chat-task-notice" role="status" />
            <form className="chat-task-form">
              <label>补充任务要求<Textarea aria-label="补充任务要求" rows={2} placeholder="补充验收标准、回答问题或说明下一步…" /></label>
              <div>
                <Button type="submit">发送补充</Button>
                <Button variant="outline" type="button" className="chat-task-pause">暂停任务</Button>
                <Button variant="outline" type="button" className="chat-task-resume">继续任务</Button>
                <Button variant="outline" type="button" className="chat-task-retry" hidden>核对原请求</Button>
                <Button variant="outline" type="button" className="chat-task-close">返回对话</Button>
              </div>
            </form>
          </section>
        </div>
      </div>
      <div className="chat-dialogs" />
    </>
  );
}

export function WorkbenchDialog({ name, container, close, review, image }: {
  name: string;
  container: HTMLElement;
  close: () => void;
  review?: string;
  image?: { name: string; src: string };
}) {
  const title = image?.name ?? {
    settings: '工具与设置', 'context-confirm': '开始新执行上下文？', confirm: '删除这段对话？',
    'draft-review': '核对未保存更改', rename: '重命名', delivery: '应用交付', diagnostics: '执行详情', 'mind-scope': 'Mind 学习范围',
  }[name];
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent container={container} className={`chat-dialog chat-${name}`} aria-describedby={undefined} showCloseButton={false} onInteractOutside={event => event.preventDefault()}>
      <DialogTitle>{title}</DialogTitle>
      {review !== undefined && <>
        <p>请比较服务器当前值和本地未保存内容。重试将保存下列本地内容；取消会继续保留，发送仍暂停。</p>
        <pre>{review}</pre>
        <form data-chat-dialog-form="">
          <Button variant="outline" type="submit" value="cancel" autoFocus>取消</Button>
          <Button type="submit" value="retry">已核对，重试本地更改</Button>
        </form>
      </>}
      {image && <>
        <img alt={image.name} src={image.src} />
        <form data-chat-dialog-form=""><Button variant="outline" type="submit">关闭</Button></form>
      </>}
      {name === 'settings' && <>
        <p>这里的更改用于下一轮，运行中的配置保留不变。</p>
        <label className="chat-field">
          对话提供方<NativeSelect className="chat-provider"></NativeSelect>
        </label>
        <p className="chat-config-warning"></p>
        <h3>应用工具</h3>
        <p>
          新会话默认开启当前全部可委派应用工具。已有会话保留选择，新增工具需手动开启。内核每轮最多100个；超过时请手动选择。
        </p>
        <Button variant="outline" type="button" data-action="tools-all">
          全部开启
        </Button>
        <Button variant="outline" type="button" data-action="tools-none">
          全部关闭
        </Button>
        <p className="chat-tool-notice" role="status"></p>
        <Input
          className="chat-tool-search"
          type="search"
          placeholder="搜索工具及用途"
          aria-label="搜索工具"
        />
        <div className="chat-tools"></div>
        <p className="chat-subtle">
          权限以内核为准。未选应用工具仍可能使用提供方自带的文件和 shell 能力。
        </p>
        <form data-chat-dialog-form="">
          <Button variant="outline" type="submit">完成</Button>
        </form>
      </>}
      {name === 'context-confirm' && <>
        <p>
          保留 Chat 消息，后续执行不续接旧 Provider 上下文；不会重发未知请求。
        </p>
        <form data-chat-dialog-form="">
          <Button variant="outline" type="submit" value="cancel" autoFocus>
            取消
          </Button>
          <Button variant="outline" type="submit" value="create">开始</Button>
        </form>
      </>}
      {name === 'confirm' && <>
        <p>只删除此 Chat 会话和附件，无法撤销。</p>
        <form data-chat-dialog-form="">
          <Button variant="outline" type="submit" value="cancel" autoFocus>
            取消
          </Button>
          <Button variant="destructive" type="submit" value="delete">删除</Button>
        </form>
      </>}
      {name === 'rename' && <>
        <form data-chat-dialog-form="">
          <Input
            name="title"
            aria-label="会话名称"
            maxLength={120}
            required
            autoFocus
          />
          <Button variant="outline" type="submit" value="cancel" formNoValidate>
            取消
          </Button>
          <Button variant="outline" type="submit" value="save">保存</Button>
        </form>
      </>}
      {name === 'delivery' && <>
        <p>提交、批准、激活与浏览器验收分别核对。</p>
        <div className="chat-delivery-items"></div>
        <details>
          <summary>按精确回执核对</summary>
          <Input
            className="chat-receipt"
            placeholder="receiptId"
            aria-label="精确回执ID"
          />
          <Button variant="outline" data-action="check-delivery">核对回执</Button>
        </details>
        <form data-chat-dialog-form="">
          <Button variant="outline" type="submit">关闭</Button>
        </form>
      </>}
      {name === 'diagnostics' && <>
        <p className="chat-recovery-note"></p>
        <Button variant="outline" data-action="refresh">按原请求核对</Button>
        <details>
          <summary>原始执行记录</summary>
          <pre></pre>
        </details>
        <form data-chat-dialog-form="">
          <Button variant="outline" type="submit">关闭</Button>
        </form>
      </>}
      {name === 'mind-scope' && <>
        <p>
          开启后，Mind
          只学习开启后新发送的内容，不会回溯旧消息，也不会读取草稿。关闭会撤回此前提供的会话内容；重新开启也只接收新发送的内容。
        </p>
        <p>
          排除或设为私密会撤回这段会话此前提供的内容；恢复纳入后，也只接收之后新发送的内容。
        </p>
        <p className="chat-scope-status" role="status"></p>
        <form className="chat-scope-form">
          <label className="chat-checkbox">
            <input name="enabled" type="checkbox" disabled />
            允许 Mind 学习新发送的内容（所有会话）
          </label>
          <fieldset className="chat-scope-conversation" disabled>
            <legend>当前会话</legend>
            <p className="chat-scope-title"></p>
            <label className="chat-checkbox">
              <input name="excluded" type="checkbox" />
              排除这段会话
            </label>
            <label className="chat-checkbox">
              <input name="private" type="checkbox" />
              将这段会话设为私密
            </label>
          </fieldset>
          <Button variant="outline" type="submit" disabled>
            保存学习范围
          </Button>
        </form>
        <Button variant="outline" type="button" data-action="scope-refresh">
          重新读取范围
        </Button>
        <form data-chat-dialog-form="">
          <Button variant="outline" type="submit">关闭</Button>
        </form>
      </>}
    </DialogContent>
  </Dialog>;
}

export function WorkbenchQuestions({ interactions, disabled, answer }: {
  interactions: NonNullable<Run['interactions']>;
  disabled: boolean;
  answer: (id: string, value: { decision: 'cancel' } | { decision: 'submit'; value: string | number | boolean }) => void;
}) {
  return interactions.filter(item => item.status === 'pending').map(({ id, question }) => {
    const options = question.method === 'confirm' ? ['确认', '否'] : question.method === 'select' ? question.options : null;
    return <form key={id} onSubmit={event => {
      event.preventDefault();
      if (disabled) return;
      const field = event.currentTarget.elements.namedItem('answer') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const value = field.value;
      answer(id, { decision: 'submit', value: question.method === 'select' ? Number(value) : question.method === 'confirm' ? value === '0' : value });
    }}>
      <label>
        {question.title} {question.message}
        {options ? <NativeSelect name="answer" disabled={disabled}>
          {options.map((option, index) => <option key={index} value={index}>{option}</option>)}
        </NativeSelect> : question.method === 'editor' ? <Textarea name="answer" defaultValue={question.prefill} disabled={disabled} /> : <Input name="answer" defaultValue={question.prefill} disabled={disabled} />}
      </label>
      <Button type="submit" disabled={disabled}>回答</Button>
      <Button variant="outline" type="button" disabled={disabled} onClick={() => answer(id, { decision: 'cancel' })}>取消交互</Button>
    </form>;
  });
}
