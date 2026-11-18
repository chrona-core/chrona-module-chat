import { Ellipsis } from 'lucide-react';
import { Button } from './button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './dropdown-menu';

type Props = {
  container: HTMLElement;
  ready: boolean;
  conversation: boolean;
  pinned: boolean;
  archived: boolean;
  canDelete: boolean;
  conflict: boolean;
  onSelect: (action: string) => void;
};

export function ConversationMenu({ container, ready, conversation, pinned, archived, canDelete, conflict, onSelect }: Props) {
  const item = (action: string, label: string, disabled = false) => (
    <DropdownMenuItem data-action={action} disabled={disabled} onSelect={() => onSelect(action)}>{label}</DropdownMenuItem>
  );
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" disabled={!ready} aria-label="更多会话操作"><Ellipsis /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent container={container} align="end" className="min-w-44">
        {conversation && <>
          {item('rename', '重命名')}
          {item('pin', pinned ? '取消置顶' : '置顶')}
          {item('archive', archived ? '取消归档' : '归档')}
          <DropdownMenuSeparator />
          {item('settings', '工具与设置')}
        </>}
        {item('mind-scope', 'Mind 学习范围')}
        {conversation && <>
          {item('delivery', '应用交付')}
          {item('diagnostics', '执行详情')}
          {item('new-context', '新执行上下文')}
          {conflict && item('review-draft', '核对未保存更改')}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" data-action="delete" disabled={!canDelete} onSelect={() => onSelect('delete')}>删除会话</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
