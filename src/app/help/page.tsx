import type { Metadata } from 'next';

export const metadata: Metadata = { title: '도움말' };

const GUIDES = [
  {
    title: '영상 자르기',
    steps: [
      '영상 파일을 화면에 끌어다 놓습니다.',
      '왼쪽 "자동 컷"을 누릅니다.',
      '"무음 찾기"를 누르면 말이 없는 구간이 빨갛게 표시됩니다.',
      '너무 많이 잡히면 "민감도"를 낮추고, 덜 잡히면 높입니다.',
      '목록에서 지울 구간을 확인하고 "적용"을 누릅니다.',
      '마음에 안 들면 Ctrl+Z로 되돌립니다.',
    ],
  },
  {
    title: '자막 넣기',
    steps: [
      '왼쪽 "자막" → "자막 만들기"를 누릅니다.',
      '처음 한 번은 음성 인식 파일을 내려받습니다(약 150MB, 다음부터는 안 받습니다).',
      '"1단계"에서 잘못 적힌 글자를 고칩니다.',
      '"2단계"에서 자막이 나오는 시간을 맞춥니다.',
      '"꾸미기"에서 글꼴·크기·색을 고릅니다.',
      '마음에 드는 설정은 "프리셋으로 저장"해 두면 다음 영상에서 바로 씁니다.',
    ],
  },
  {
    title: '얼굴 가리기',
    steps: [
      '왼쪽 "모자이크" → "얼굴 찾기"를 누릅니다.',
      '찾은 사람들이 목록에 나옵니다.',
      '본인은 "가리지 않기"로 끄고, 나머지는 켜둡니다.',
      '못 찾은 얼굴은 미리보기 위에 직접 네모를 그려 추가합니다.',
    ],
  },
  {
    title: '내보내기',
    steps: [
      '왼쪽 "내보내기"를 누릅니다.',
      '유튜브용 / 쇼츠용 / GIF 중에서 고릅니다.',
      '시간이 오래 걸릴 수 있습니다. 창을 닫지 마세요(다른 탭은 봐도 됩니다).',
    ],
  },
];

const SHORTCUTS: [string, string][] = [
  ['Space', '재생 / 정지'],
  ['← / →', '1프레임 앞 / 뒤'],
  ['Shift + ← / →', '5초 앞 / 뒤'],
  ['S', '재생헤드 위치에서 자르기(분할)'],
  ['Delete', '선택한 구간 삭제·복원'],
  ['Ctrl + Z / Ctrl + Shift + Z', '되돌리기 / 다시 하기 (최근 20단계)'],
  ['Ctrl + 마우스 휠', '타임라인 확대 / 축소'],
  ['1 ~ 5', '왼쪽 패널 전환 (자동 컷 · 자막 · 꾸미기 · 모자이크 · 내보내기)'],
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <h1 className="text-2xl font-bold">도움말</h1>
      {GUIDES.map((g) => (
        <section key={g.title} className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold">{g.title}</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
            {g.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
        </section>
      ))}
      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">키보드 단축키</h2>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {SHORTCUTS.map(([k, v]) => (
              <tr key={k} className="border-t">
                <td className="py-2 pr-4"><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{k}</kbd></td>
                <td className="py-2">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="rounded-xl border bg-card p-5 text-sm">
        <h2 className="text-lg font-semibold">알아두실 점</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>영상은 인터넷으로 전송되지 않고 이 컴퓨터 안에서만 처리됩니다.</li>
          <li>크롬 또는 엣지 브라우저를 권장합니다.</li>
          <li>20분이 넘는 영상은 느려질 수 있습니다.</li>
          <li>브라우저 데이터를 지우면 작업 중이던 프로젝트도 지워집니다. 중요하면 프로젝트 파일을 내보내 두세요.</li>
          <li>목소리 학습(음성 복제) TTS는 무료·브라우저 안에서는 불가능해 제공하지 않습니다.</li>
        </ul>
      </section>
    </div>
  );
}
