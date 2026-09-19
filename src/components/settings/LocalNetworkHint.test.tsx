import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { needsLocalNetworkPermission } from '@/lib/sidecar/networkPermission';
import { LocalNetworkHint } from './LocalNetworkHint';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Chrome의 PermissionStatus 흉내: state를 바꾸고 change 이벤트를 보낼 수 있다 */
function fakeStatus(initial: PermissionState) {
  const target = new EventTarget() as EventTarget & { state: PermissionState };
  target.state = initial;
  return target;
}

let container: HTMLDivElement;
let root: Root;
const originalHost = location.hostname;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  Object.defineProperty(location, 'hostname', { value: originalHost, configurable: true });
});

async function renderWith(state: PermissionState, hostname = '1u2v.netlify.app') {
  Object.defineProperty(location, 'hostname', { value: hostname, configurable: true });
  const status = fakeStatus(state);
  vi.stubGlobal('navigator', { ...navigator, permissions: { query: vi.fn(async () => status) } });
  const onGranted = vi.fn();
  await act(async () => {
    root.render(<LocalNetworkHint onGranted={onGranted} />);
  });
  return { status, onGranted };
}

describe('needsLocalNetworkPermission', () => {
  it('인터넷에 올린 사이트만 권한이 필요하다', () => {
    expect(needsLocalNetworkPermission('1u2v.netlify.app')).toBe(true);
    expect(needsLocalNetworkPermission('localhost')).toBe(false);
    expect(needsLocalNetworkPermission('127.0.0.1')).toBe(false);
  });
});

describe('LocalNetworkHint', () => {
  it('차단돼 있으면 어디서 허용으로 바꾸는지 알려 준다', async () => {
    await renderWith('denied');
    expect(container.textContent).toContain('Chrome이 이 사이트의 내 컴퓨터 접속을 막았습니다');
    expect(container.textContent).toContain('로컬 네트워크 액세스');
  });

  it('아직 묻지 않았으면 허용을 누르라고 미리 알려 준다', async () => {
    await renderWith('prompt');
    expect(container.textContent).toContain('이 기기의 다른 앱 및 서비스에 액세스');
  });

  it('허용으로 바뀌면 바로 다시 연결한다', async () => {
    const { status, onGranted } = await renderWith('denied');
    await act(async () => {
      status.state = 'granted';
      status.dispatchEvent(new Event('change'));
    });
    expect(onGranted).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('');
  });

  it('localhost에서 연 페이지에는 아무것도 보이지 않는다', async () => {
    await renderWith('denied', 'localhost');
    expect(container.textContent).toBe('');
  });
});
