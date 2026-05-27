import { COLORS } from '../../tokens/tokens'

interface StepRowProps {
  n: string
  title: string
  desc: string
  right?: boolean
  visual: React.ReactNode
}

function StepRow({ n, title, desc, right = false, visual }: StepRowProps) {
  return (
    <div
      className="grid grid-cols-2 gap-20 items-center py-20 px-15 max-w-prose mx-auto"
      style={{ direction: right ? 'rtl' : 'ltr' }}
    >
      <div style={{ direction: 'ltr' }}>
        <div
          className="inline-flex items-center justify-center w-11 h-11 rounded-3 bg-brand-light text-brand font-black text-lg mb-5.5 tracking-tight"
        >
          {n}
        </div>
        <h3 className="text-8xl font-black m-0 tracking-tighter leading-tight">{title}</h3>
        <p className="text-base text-ink-sub leading-relaxed mt-4.5 max-w-prose">{desc}</p>
      </div>
      <div style={{ direction: 'ltr' }}>{visual}</div>
    </div>
  )
}

function Step1Visual() {
  return (
    <div className="bg-bg rounded-4.5 p-7 border" style={{ border: `1px solid ${COLORS.line}` }}>
      <div className="flex flex-wrap gap-2 mb-4">
        {['#시설', '#급식', '#교칙', '#학사', '#수업'].map((c, i) => (
          <span
            key={c}
            className={`text-sm px-3 py-1.5 rounded-full border font-normal tracking-tight ${
              i === 0 ? 'bg-ink text-white' : `bg-white text-ink-sub`
            }`}
            style={{ borderColor: i === 0 ? COLORS.ink : COLORS.line }}
          >
            {c}
          </span>
        ))}
      </div>
      <div
        className="h-10 bg-white rounded-2 border px-3 flex items-center text-sm text-ink font-bold mb-2.5"
        style={{ border: `1px solid ${COLORS.line}` }}
      >
        도서관 자습실에 콘센트 추가 설치
      </div>
      <div
        className="h-20 bg-white rounded-2 border px-3 py-2.5 text-sm text-ink-sub leading-relaxed"
        style={{ border: `1px solid ${COLORS.line}` }}
      >
        4층 자습실 이용 중에 노트북 전원 부족 문제가 있습니다…
      </div>
    </div>
  )
}

function Step2Visual() {
  return (
    <div className="bg-bg rounded-4.5 p-7 border" style={{ border: `1px solid ${COLORS.line}` }}>
      <div className="mb-6">
        <div className="flex justify-between items-baseline mb-2.5">
          <span className="text-sm text-ink-sub">전달까지</span>
          <span className="text-6xl font-black text-ink tracking-tighter">
            28<span className="text-sm text-ink-muted font-medium">/30</span>
          </span>
        </div>
        <div className="h-2 bg-line-soft rounded-full overflow-hidden">
          <div className="w-11/12 h-full bg-ink rounded-full" />
        </div>
      </div>
      <div className="text-sm font-bold" style={{ color: COLORS.fire }}>
        🔥 단 2표 남음
      </div>
      <p className="text-sm text-ink-sub mt-3">친구와 공유해서 함께 목소리를 모아보세요</p>
    </div>
  )
}

function Step3Visual() {
  return (
    <div className="bg-bg rounded-4.5 p-7 border" style={{ border: `1px solid ${COLORS.line}` }}>
      <div className="mb-5">
        <div className="text-sm font-bold text-ink mb-1">학생회 답변</div>
        <div className="h-0.25 bg-line w-full" />
      </div>
      <div className="bg-white rounded-2.5 p-4 mb-4" style={{ border: `1px solid ${COLORS.line}` }}>
        <p className="text-sm text-ink leading-relaxed mb-3">
          이 의견은 정말 좋습니다. 구매 예산을 검토해서 다음 달까지 반영하도록 노력하겠습니다.
        </p>
        <div className="text-2xs text-ink-muted font-bold">— 홍길동 학생회장</div>
      </div>
      <div className="flex gap-3 text-2xs text-ink-muted">
        <span>반영 완료</span>
        <span>2024.11.30</span>
        <span>89표</span>
      </div>
    </div>
  )
}

export default function HowSection() {
  return (
    <section id="how" className="py-25 bg-white">
      <div className="max-w-prose mx-auto px-15">
        <div className="text-center mb-20">
          <div className="text-2xs font-bold tracking-widest text-brand mb-4">
            HOW IT WORKS
          </div>
          <h2 className="text-10xl font-black m-0 tracking-tighter text-ink leading-tight">
            3가지 간단한 단계.
          </h2>
        </div>

        <StepRow
          n="1"
          title="제안"
          desc="제목, 카테고리, 본문만 있으면 됩니다. 익명으로 안전하게."
          visual={<Step1Visual />}
        />
        <StepRow
          n="2"
          title="투표"
          desc="같은 생각을 가진 친구들과 함께 추천을 모아보세요. 30표가 모이면 자동 전달됩니다."
          right
          visual={<Step2Visual />}
        />
        <StepRow
          n="3"
          title="반영"
          desc="학생회가 검토하고 답변합니다. 모든 과정이 투명하게 공개됩니다."
          visual={<Step3Visual />}
        />
      </div>
    </section>
  )
}
