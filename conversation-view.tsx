import { memo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Button } from './button';
import type {
  Attachment,
  Conversation,
  ConversationSummary,
  Run,
} from './view-types';

export function ConversationList({
  items,
  selected,
  choose,
}: {
  items: ConversationSummary[];
  selected?: string;
  choose: (id: string) => void;
}) {
  if (!items.length) return <p className="chat-list-empty">没有匹配的会话</p>;
  return items.map((item) => (
    <button
      key={item.id}
      type="button"
      className={item.id === selected ? 'chat-selected' : ''}
      aria-current={item.id === selected ? 'page' : undefined}
      onClick={() => choose(item.id)}
    >
      {item.pinned ? '◆ ' : ''}
      {item.title}
    </button>
  ));
}

const Markdown = memo(function Markdown({ value }: { value: string }) {
  const html = DOMPurify.sanitize(marked.parse(value, { async: false }), {
    ALLOW_DATA_ATTR: false,
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      'style',
      'input',
      'form',
      'button',
      'video',
      'audio',
      'iframe',
    ],
    FORBID_ATTR: ['style'],
  });
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const link of template.content.querySelectorAll('a')) {
    link.rel = 'noopener noreferrer';
    link.target = '_blank';
  }
  for (const code of template.content.querySelectorAll('pre > code')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '复制代码';
    button.dataset.copy = 'code';
    code.before(button);
  }
  return (
    <div
      className="chat-markdown"
      dangerouslySetInnerHTML={{ __html: template.innerHTML }}
    />
  );
});

function RunView({ run }: { run: Run }) {
  return (
    <div>
      {run.gaps?.map((gap, index) => (
        <p key={index} className="chat-gap">
          {gap.message}
        </p>
      ))}
      {run.transcript?.length
        ? run.transcript.map((item, index) =>
            item.kind === 'text' ? (
              <Markdown key={index} value={item.text} />
            ) : (
              <details key={index}>
                <summary>
                  {item.kind === 'tool' ? '调用 ' : '结果 '}
                  {item.tool ?? '工具'}
                  {item.error ? ' · 失败' : ''}
                </summary>
                <pre>{item.text ?? item.args ?? ''}</pre>
              </details>
            ),
          )
        : run.events?.map(
            (item, index) =>
              ['text', 'completion'].includes(item.kind) && (
                <Markdown key={index} value={item.payload?.text ?? ''} />
              ),
          )}
    </div>
  );
}

export function Messages({
  conversation,
  preview,
  copy,
}: {
  conversation: Conversation;
  preview: (attachment: Attachment) => void;
  copy: (value: string, button?: HTMLButtonElement) => void;
}) {
  if (!conversation.messages.length && !conversation.active)
    return (
      <div className="chat-empty">
        <h2>今天想做些什么？</h2>
      </div>
    );
  return (
    <>
      {conversation.messages.map((message) => (
        <article
          key={message.id}
          className={`chat-message chat-${message.role}`}
        >
          <div className="chat-message-label">
            {message.role === 'user' ? '你' : 'Chrona'}
          </div>
          {message.run ? (
            <RunView run={message.run} />
          ) : (
            <Markdown value={message.text} />
          )}
          {message.attachments?.map((attachment) => (
            <button
              key={attachment.id}
              type="button"
              onClick={() => preview(attachment)}
            >
              {attachment.name}
            </button>
          ))}
          <div className="chat-message-actions flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(event) =>
                copy(
                  message.run
                    ? message.run.transcript
                        ?.filter((item) => item.kind === 'text')
                        .map((item) => item.text)
                        .join('\n\n') ||
                        message.run.events
                          ?.filter((item) =>
                            ['text', 'completion'].includes(item.kind),
                          )
                          .map((item) => item.payload?.text ?? '')
                          .join('\n\n') ||
                        message.text
                    : message.text,
                  event.currentTarget,
                )
              }
            >
              复制消息
            </Button>
          </div>
        </article>
      ))}
      {conversation.active && (
        <article className="chat-message chat-assistant">
          <div className="chat-message-label">Chrona</div>
          <RunView run={conversation.active} />
        </article>
      )}
    </>
  );
}
