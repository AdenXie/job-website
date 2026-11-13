// 简历编辑器里“上移 / 下移 / 添加 / 删除”的过渡动画（FLIP）。
// 只在这几个操作时启用：操作前记录所有 [data-flip] 元素的位置，更新后让它们从旧位置滑到新位置。
// 输入文字时不会触发，免得预览随打字抖动。左侧编辑栏和右侧预览各是一个根节点，同一个 id 在两边各自动画。
import { useLayoutEffect, useRef } from 'react';

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const visible = (root) => root && root.getClientRects().length > 0 && root.offsetWidth > 0;

function measure(root) {
  const map = new Map();
  if (!visible(root)) return map;
  const base = root.getBoundingClientRect();
  root.querySelectorAll('[data-flip]').forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (!el.offsetWidth) return;
    map.set(el.dataset.flip, { el, x: rect.left - base.left + root.scrollLeft, y: rect.top - base.top + root.scrollTop, scale: rect.width / el.offsetWidth });
  });
  return map;
}

function play(root, before, focus, mode) {
  const after = measure(root);
  const deltas = new Map();
  after.forEach((now, id) => {
    const was = before.get(id);
    if (was) deltas.set(id, { dx: (was.x - now.x) / now.scale, dy: (was.y - now.y) / now.scale });
  });
  after.forEach((now, id) => {
    const { el } = now;
    if (!deltas.has(id)) {
      // 新出现的元素：从上方轻轻落下
      if (before.size) el.animate([{ opacity: 0, transform: 'translateY(-8px) scale(0.98)' }, { opacity: 1, transform: 'none' }], { duration: 340, easing: EASE });
      return;
    }
    // 嵌套的元素跟着父元素一起移动，只补上相对父元素的位移
    let { dx, dy } = deltas.get(id);
    const parent = el.parentElement?.closest('[data-flip]');
    if (parent && root.contains(parent) && deltas.has(parent.dataset.flip)) {
      const outer = deltas.get(parent.dataset.flip);
      dx -= outer.dx;
      dy -= outer.dy;
    }
    const moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
    const from = `translate(${dx}px, ${dy}px)`;
    if (id === focus && moved) {
      // 被操作的那一块：抬起、移动、落下
      el.style.zIndex = '2';
      const lift = mode === 'paper'
        ? [{ transform: from, backgroundColor: 'rgba(25, 87, 102, 0.10)' }, { offset: 0.55, backgroundColor: 'rgba(25, 87, 102, 0.10)' }, { transform: 'none', backgroundColor: 'rgba(25, 87, 102, 0)' }]
        : [{ transform: `${from} scale(1)` }, { offset: 0.35, transform: `translate(${dx * 0.55}px, ${dy * 0.55}px) scale(1.025)`, boxShadow: '0 14px 32px -12px rgba(28, 36, 34, 0.35)' }, { transform: 'none' }];
      el.animate(lift, { duration: 520, easing: EASE }).finished.then(() => { el.style.zIndex = ''; }, () => { el.style.zIndex = ''; });
    } else if (moved) {
      el.animate([{ transform: from }, { transform: 'none' }], { duration: 420, easing: EASE });
    }
  });
}

// roots: [{ ref, mode }]，mode 为 'paper' 时被操作的块用背景高亮代替阴影
export function useFlip(roots, deps) {
  const pending = useRef(null);
  useLayoutEffect(() => {
    const snapshot = pending.current;
    if (!snapshot) return;
    pending.current = null;
    roots.forEach(({ ref, mode }, index) => { if (visible(ref.current)) play(ref.current, snapshot.maps[index], snapshot.focus, mode); });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  const arm = (focus) => {
    if (reduced()) return;
    pending.current = { focus, maps: roots.map(({ ref }) => measure(ref.current)) };
  };
  // 删除：先让要删掉的块淡出，再真正删除，下面的块随后补位
  const exit = (ids, done) => {
    const els = reduced() ? [] : roots.flatMap(({ ref }) => (visible(ref.current) ? ids.flatMap((id) => [...ref.current.querySelectorAll(`[data-flip="${id}"]`)]) : []));
    if (!els.length) { arm(); done(); return; }
    Promise.all(els.map((el) => el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.97)' }], { duration: 180, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }).finished.catch(() => {})))
      .then(() => { arm(); done(); });
  };
  return { arm, exit };
}
