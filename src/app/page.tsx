import { EyeOff, Scissors, Subtitles, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { CapabilityReport } from '@/components/landing/CapabilityReport';
import { DropZone } from '@/components/landing/DropZone';
import { RecentProjects } from '@/components/landing/RecentProjects';

const FEATURES = [
  { icon: Scissors, title: '말 없는 구간 자동 컷', body: '조용한 구간과 "어… 음…" 같은 추임새를 찾아 목록으로 보여줍니다. 적용 전에 하나씩 살리거나 자를 수 있습니다.' },
  { icon: Subtitles, title: '자막 자동 생성 + 꾸미기', body: '음성을 글자로 바꾼 뒤, 1단계에서 글자를 고치고 2단계에서 시간을 맞춥니다. 스타일은 프리셋으로 저장됩니다.' },
  { icon: EyeOff, title: '얼굴 자동 모자이크', body: '영상 속 얼굴을 따라다니며 가립니다. 본인은 "가리지 않기"로 빼고, 놓친 곳은 직접 네모를 그리면 됩니다.' },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:py-14">
      <section className="space-y-6 text-center">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
          <Wand2 className="h-3.5 w-3.5" /> 설치·회원가입 없이 무료
        </p>
        <h1 className="text-3xl font-bold leading-tight sm:text-5xl">
          영상 하나 올리면,<br />무음이 잘리고 자막이 붙고 얼굴이 가려집니다.
        </h1>
        <ul className="mx-auto max-w-2xl space-y-1 text-base text-muted-foreground sm:text-lg">
          <li><b className="text-foreground">1단계</b> 말 없는 구간과 추임새를 자동으로 찾아 잘라 줍니다.</li>
          <li><b className="text-foreground">2단계</b> 자막을 만들고 <b className="text-foreground">단어 하나까지</b> 눌러서 지웁니다.</li>
          <li>영상은 인터넷으로 전송되지 않고 이 컴퓨터 안에서만 처리됩니다.</li>
        </ul>
        <DropZone to="/auto-edit?project=:id" sourceTool="auto-edit" pipelineStage={1} />
      </section>

      <RecentProjects />

      <section aria-labelledby="features-title" className="space-y-4">
        <h2 id="features-title" className="text-lg font-semibold">할 수 있는 것</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border bg-card p-5">
              <Icon className="h-6 w-6 text-primary" aria-hidden />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          GIF 만들기, 화면 녹화, 사진 얼굴 일괄 가리기 같은 작은 도구는 <Link href="/tools" className="text-primary hover:underline">도구함</Link>에 있습니다.
        </p>
      </section>

      <section aria-label="브라우저 지원 진단" className="space-y-3">
        <CapabilityReport />
        <p className="text-xs text-muted-foreground">
          데스크톱 Chrome 또는 Edge 최신 버전을 권장합니다. iPhone·iPad에서는 편집을 지원하지 않습니다.
          브라우저 데이터를 지우면 작업 중이던 프로젝트도 지워지니, 중요한 작업은 프로젝트 파일로 내보내 두세요.
        </p>
      </section>
    </div>
  );
}
