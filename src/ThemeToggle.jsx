import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { applyTheme, onThemeChange, readTheme } from './theme.js';

const OPTIONS = [
  { id: 'auto', label: '跟随系统', Icon: Monitor },
  { id: 'light', label: '浅色', Icon: Sun },
  { id: 'dark', label: '深色', Icon: Moon },
];

/** 依次切换“跟随系统 → 浅色 → 深色”；同一页面的多个按钮保持同步。 */
export default function ThemeToggle({ className = 'theme-button', showLabel = false }) {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => onThemeChange(setTheme), []);
  const index = Math.max(0, OPTIONS.findIndex((option) => option.id === theme));
  const current = OPTIONS[index];
  const next = OPTIONS[(index + 1) % OPTIONS.length];
  return <button type="button" className={className} onClick={() => applyTheme(next.id)} title={`主题：${current.label}，点击切换为${next.label}`} aria-label={`主题：${current.label}，点击切换为${next.label}`}>
    <current.Icon size={17} aria-hidden="true" />{showLabel && <span>主题：{current.label}</span>}
  </button>;
}
