// Chrome의 "로컬 네트워크 액세스" 권한 (Chrome 138+).
// 인터넷에 있는 사이트(예: 1u2v.netlify.app)가 내 컴퓨터(127.0.0.1)의 도우미에 접속하려면 사용자가 한 번 "허용"해야 한다.
// 같은 컴퓨터에서 연 개발 서버(localhost)는 해당되지 않는다.

export type LocalNetworkState = 'granted' | 'denied' | 'prompt' | 'unsupported';

/** 이 페이지가 로컬 네트워크 권한을 받아야 하는지 (localhost에서 연 페이지는 필요 없다) */
export function needsLocalNetworkPermission(hostname = typeof location !== 'undefined' ? location.hostname : 'localhost'): boolean {
  return !['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
}

/** 지금 권한 상태. 권한 개념이 없는 브라우저면 'unsupported' */
export async function localNetworkPermission(): Promise<{ state: LocalNetworkState; status: PermissionStatus | null }> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return { state: 'unsupported', status: null };
  try {
    const status = await navigator.permissions.query({ name: 'local-network-access' as PermissionName });
    return { state: status.state as LocalNetworkState, status };
  } catch {
    return { state: 'unsupported', status: null };
  }
}
