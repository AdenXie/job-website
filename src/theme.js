// 全站共用的深浅色偏好：默认跟随浏览器，手动选择后各页面一致。
// 各页面 index.html 的 <head> 里有同样逻辑的内联脚本，在首屏渲染前先应用，避免闪烁。
export const THEME_KEY = 'campus-opportunities:theme:v1';
export const THEMES = ['auto', 'light', 'dark'];
const EVENT = 'campus-theme-change';

export function readTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return THEMES.includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  try {
    if (theme === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, theme);
  } catch { /* 存储不可用时只影响本次访问 */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: theme }));
}

export function onThemeChange(listener) {
  const handle = (event) => listener(event.detail);
  window.addEventListener(EVENT, handle);
  return () => window.removeEventListener(EVENT, handle);
}
