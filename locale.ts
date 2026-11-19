import { createContext, useContext } from 'react';
import english from './locale-en.json';

export type Locale = 'zh-CN' | 'en';
export const ChatLocale = createContext<Locale>('zh-CN');
type Copy = keyof typeof english;

export function useTranslation() {
  const locale = useContext(ChatLocale);
  return (message: Copy, ...values: (string | number)[]) => {
    const text = locale === 'en' ? english[message] : message;
    return values.length ? text.replace(/\{(\d+)\}/g, (match, index) => String(values[Number(index)] ?? match)) : text;
  };
}
