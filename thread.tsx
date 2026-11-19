import { isValidElement, type ReactNode } from 'react';
import { useTranslation } from './locale';
import { Paperclip, Terminal } from 'lucide-react';
import { defaultRehypePlugins, Streamdown, type Components } from 'streamdown';
import { Button } from './button';
import { Input } from './input';
import { Empty, EmptyTitle } from './elements/empty';
import { Textarea } from './textarea';
import { Message, MessageContent, MessageFooter } from './elements/message';
import { Bubble, BubbleContent } from './elements/bubble';
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from './elements/message-scroller';
import { Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceIcon, TraceLine, TraceTitle } from './elements/trace';
import { Attachment as FileAttachment, AttachmentTitle } from './elements/attachment';
import type { Attachment, Conversation, Run } from './view-types';

import { CodeBlock, CodeBlockActions, CodeBlockContent, CodeBlockCopyButton, CodeBlockHeader } from './elements/code-block';
import { Questionnaire, QuestionnaireActions, QuestionnaireChoice, QuestionnaireChoices, QuestionnaireDescription, QuestionnaireItem, QuestionnaireSubmit, QuestionnaireTitle } from './elements/questionnaire';

const markdownComponents: Components = {
  pre({children}) {
    const code = isValidElement<{children?: ReactNode}>(children) ? children.props.children : children;
    const text = typeof code === 'string' ? code : '';
    return <CodeBlock>
      <CodeBlockHeader><CodeBlockActions><CodeBlockCopyButton value={text} /></CodeBlockActions></CodeBlockHeader>
      <CodeBlockContent lineNumbers>{text}</CodeBlockContent>
    </CodeBlock>;
  },
};
const markdownProps = {
  className: 'chat-markdown',
  mode: 'static' as const,
  components: markdownComponents,
  rehypePlugins: [defaultRehypePlugins.sanitize!, defaultRehypePlugins.harden!],
  disallowedElements: ['img'],
  skipHtml: true,
};

function RunContent({ run, fallback }: {run: Run; fallback?: string}) {
  const t = useTranslation();
  const transcript = run.transcript ?? [];
  type ToolPart = Exclude<(typeof transcript)[number], {kind: 'text'}>;
  type ToolStep = { call?: ToolPart; result?: ToolPart };
  const blocks: ({kind: 'text'; text: string} | {kind: 'tools'; steps: ToolStep[]})[] = [];
  const calls = new Map<string, ToolStep>();
  const callsByTool = new Map<string, ToolStep[]>();
  for (const part of transcript) {
    const last = blocks.at(-1);
    if (part.kind === 'text') {
      if (last?.kind === 'text') last.text += part.text;
      else blocks.push({kind: 'text', text: part.text});
      continue;
    }
    const steps = last?.kind === 'tools' ? last.steps : [];
    if (part.kind === 'result') {
      const exact = part.callId ? calls.get(part.callId) : undefined;
      const existing = exact ?? (part.tool ? callsByTool.get(part.tool)?.find(step =>
        !step.result && (!part.callId || !step.call?.callId),
      ) : undefined);
      if (existing) { existing.result = part; continue; }
    }
    const step: ToolStep = part.kind === 'tool' ? {call: part} : {result: part};
    if (part.kind === 'tool') {
      if (part.callId) calls.set(part.callId, step);
      if (part.tool) {
        const queue = callsByTool.get(part.tool) ?? [];
        queue.push(step);
        callsByTool.set(part.tool, queue);
      }
    }
    if (last?.kind !== 'tools') blocks.push({kind: 'tools', steps});
    steps.push(step);
  }
  return <>
    {blocks.map((block, index) => block.kind === 'text' ? <Streamdown key={index} {...markdownProps}>{block.text}</Streamdown> : <Trace key={index}>
      {block.steps.map(({call, result}, i) => {
        const key = call?.callId ?? result?.callId ?? i;
        const toolName = call?.tool || result?.tool || t('工具执行');
        const hasError = result?.error || (!result && run.ended);
        const line = <TraceLine status={hasError ? 'error' : !result ? 'running' : undefined}>
          <TraceIcon><Terminal /></TraceIcon>
          <TraceTitle>{toolName}</TraceTitle>
        </TraceLine>;
        const details = [
          { label: t('参数'), text: call?.args },
          { label: hasError ? t('错误') : t('结果'), text: result?.text || (hasError ? t('未收到工具结果') : result ? t('无输出') : undefined) },
        ].filter((section): section is { label: string; text: string } => section.text !== undefined);
        return details.length ? <TraceCollapsible key={key}>
          <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
          <TraceCollapsibleContent className="flex flex-col gap-3">
            {details.map(({label, text}) => <section key={label}>
              <h4 className="mb-1 text-xs font-medium">{label}</h4>
              <CodeBlock size="sm">
                <CodeBlockHeader><CodeBlockActions><CodeBlockCopyButton value={text} /></CodeBlockActions></CodeBlockHeader>
                <CodeBlockContent wrap className="max-h-64">{text}</CodeBlockContent>
              </CodeBlock>
            </section>)}
          </TraceCollapsibleContent>
        </TraceCollapsible> : <div key={key}>{line}</div>;
      })}
    </Trace>)}
    {run.liveReply && <Streamdown {...markdownProps} mode="streaming" isAnimating>{run.liveReply}</Streamdown>}
    {!blocks.some(b => b.kind === 'text') && fallback && <Streamdown {...markdownProps}>{fallback}</Streamdown>}
    {run.error && <p className="chat-run-error">{run.error}</p>}
    {run.gaps?.map((gap, index) => <p key={index} className="chat-run-error">{gap.message}</p>)}
    {run.stopConfirmed && <p className="chat-run-error">{t("已停止")}</p>}
  </>;
}

function Question({ item, disabled, answer }: { item: NonNullable<Run['interactions']>[number]; disabled: boolean; answer(input: unknown): void }) {
  const t = useTranslation();
  const {question} = item;
  const options = question.method === 'confirm' ? [t('确认'), t('否')] : question.method === 'select' ? question.options : null;
  if (!options) return <form className="chat-question" onSubmit={event => {
    event.preventDefault();
    answer({decision: 'submit', value: String(new FormData(event.currentTarget).get('answer') ?? '')});
  }}>
    <strong>{question.title}</strong><p>{question.message}</p>
    {question.method === 'editor' ? <Textarea aria-label={t("回答")} name="answer" defaultValue={question.prefill} disabled={disabled} /> : <Input aria-label={t("回答")} name="answer" defaultValue={question.prefill} disabled={disabled} />}
    <div className="chat-actions"><Button type="submit" size="sm" disabled={disabled}>{t("提交回答")}</Button><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => answer({decision:'cancel'})}>{t("取消提问")}</Button></div>
  </form>;
  return <Questionnaire className="chat-question" onSubmit={event => {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('answer') ?? '');
    answer({decision: 'submit', value: question.method === 'confirm' ? value === '0' : question.method === 'select' ? Number(value) : value});
  }}>
    <QuestionnaireItem name="answer" disabled={disabled} required={!!options}>
      <QuestionnaireTitle>{question.title}</QuestionnaireTitle>
      <QuestionnaireDescription>{question.message}</QuestionnaireDescription>
      <QuestionnaireChoices>{options.map((option, index) => <QuestionnaireChoice key={index} value={String(index)}>{option}</QuestionnaireChoice>)}</QuestionnaireChoices>
    </QuestionnaireItem>
    <QuestionnaireActions>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => answer({decision:'cancel'})}>{t("取消提问")}</Button>
      <QuestionnaireSubmit size="sm" disabled={disabled}>{t("提交回答")}</QuestionnaireSubmit>
    </QuestionnaireActions>
  </Questionnaire>;
}

export function Thread({ conversation, query, showImage, answer, disabled }: { conversation: Conversation; query: string; showImage(file: Attachment): void; answer(id: string, value: unknown): void; disabled: boolean }) {
  const t = useTranslation();
  const { active } = conversation;
  const normalized = query.trim().toLowerCase();
  const messages = normalized ? conversation.messages.filter(m => [m.text, ...m.run?.transcript?.map(p => p.text) ?? []].join(' ').toLowerCase().includes(normalized)) : conversation.messages;
  return <div className="chat-thread">
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller>
        <MessageScrollerViewport aria-label={t("消息记录")} className="chat-message-scroll">
          <MessageScrollerContent className="chat-message-list" role="list">
            {!messages.length && <Empty className="chat-welcome"><EmptyTitle>{normalized ? t('没有匹配的消息') : t('开始一段对话')}</EmptyTitle></Empty>}
            {messages.map(message => {
              const user = message.role === 'user';
              const copy = message.text || message.run?.transcript?.filter(p => p.kind === 'text').map(p => p.text).join('\n') || '';
              return <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={user} role="listitem">
                <Message align={user ? 'end' : 'start'}><MessageContent>
                  {user ? <Bubble align="end"><BubbleContent className="chat-user-text">{message.text}</BubbleContent></Bubble> : message.run ? <RunContent run={message.run} fallback={message.text} /> : <Streamdown {...markdownProps}>{message.text}</Streamdown>}
                  {message.attachments?.map(file => <FileAttachment key={file.id} className="chat-message-file"><Button variant="outline" size="sm" onClick={() => showImage(file)}><Paperclip /><AttachmentTitle>{file.name}</AttachmentTitle></Button></FileAttachment>)}
                  {copy && <MessageFooter><CodeBlockCopyButton value={copy} aria-label={t("复制消息")} /></MessageFooter>}
                </MessageContent></Message>
              </MessageScrollerItem>;
            })}
            {active && !normalized && <MessageScrollerItem messageId={active.runId ?? "active"} role="listitem">
              <Message><MessageContent><RunContent run={active} />{!active.transcript?.length && !active.liveReply && !active.error && <p className="chat-working" role="status">{t("正在等待 Agent 输出…")}</p>}
                {active.interactions?.filter(item => item.status === 'pending').map(item => <Question key={item.id} item={item} disabled={disabled} answer={value => answer(item.id, value)} />)}
              </MessageContent></Message>
            </MessageScrollerItem>}
            {conversation.mindUpdates?.map((item, index) => <MessageScrollerItem key={`mind-${index}`} messageId={`mind-${index}`} role="listitem"><div className="chat-mind-update"><strong>{item.goal}</strong><p>{item.nextStep || item.waitReason || item.status}</p></div></MessageScrollerItem>)}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton aria-label={t("跳到最新消息")}><span aria-hidden="true">↓</span></MessageScrollerButton>
      </MessageScroller>
    </MessageScrollerProvider>
  </div>;
}
