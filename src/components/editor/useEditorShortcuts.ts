'use client';

import { useEffect } from 'react';
import { frameDurationMs } from '@/lib/core/timecode';
import { deleteSelectedClips, redoWithToast, seekTo, splitAtPlayhead, toggleSelectedSegment, undoWithToast } from '@/lib/editor/actions';
import { player } from '@/lib/editor/player';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore, type PanelId } from '@/store/uiStore';

const PANEL_KEYS: Record<string, PanelId> = { Digit1: 'autocut', Digit2: 'subtitle', Digit3: 'style', Digit4: 'mosaic', Digit5: 'export' };
const KEYBOARD_WIDGETS = new Set(['slider', 'tab', 'radio', 'menuitem', 'option', 'switch', 'spinbutton']);

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true;
  return KEYBOARD_WIDGETS.has(el.getAttribute('role') ?? '');
}

export function useEditorShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = isTyping(e.target);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !typing && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) redoWithToast();
        else undoWithToast();
        return;
      }
      if (mod && !typing && e.code === 'KeyY') {
        e.preventDefault();
        redoWithToast();
        return;
      }
      if (typing || mod || e.altKey) return;
      if (e.code === 'Escape') {
        useUiStore.getState().setDrawMosaic(false);
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          player.toggle();
          return;
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault();
          player.pause();
          const fps = useProjectStore.getState().asset?.fps ?? 30;
          const step = e.shiftKey ? 5000 : frameDurationMs(fps);
          seekTo(player.currentMs() + (e.code === 'ArrowLeft' ? -step : step));
          return;
        }
        case 'KeyS':
          e.preventDefault();
          splitAtPlayhead();
          return;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          // 클립을 체크해 뒀으면 그것부터 — 목록이 주 편집 화면이라 사용자가 기대하는 대상이다
          if (!deleteSelectedClips()) toggleSelectedSegment();
          return;
        default:
          if (PANEL_KEYS[e.code]) useUiStore.getState().setPanel(PANEL_KEYS[e.code]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
