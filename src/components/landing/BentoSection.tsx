import { COLORS } from '../../tokens/tokens'

interface BentoCardProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

function BentoCard({ children, className = '', style }: BentoCardProps) {
  return (
    <div
      className={`bg-white rounded-4.5 border overflow-hidden position-relative ${className}`}
      style={{ border: `1px solid ${COLORS.line}`, ...style }}
    >
      {children}
    </div>
  )
}

export default function BentoSection() {
  return (
    <section id="features" className="bg-bg py-25">
      <div className="max-w-prose mx-auto px-15">
        <div className="text-center mb-15">
          <div className="text-2xs font-bold tracking-widest text-brand mb-4">
            FEATURES
          </div>
          <h2 className="text-10xl font-black m-0 tracking-tighter text-ink leading-tight">
            학생 중심으로<br/>설계된 모든 기능.
          </h2>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-3 grid-rows-2 gap-4">
          {/* Big left */}
          <BentoCard className="col-span-1 row-span-1 min-h-85">
            <div className="p-8">
              <div className="text-2xs font-bold tracking-widest text-brand mb-3.5">
                PROPOSAL
              </div>
              <h3 className="text-6xl font-bold m-0 tracking-tighter leading-snug">
                자유롭게 의견을<br/>제안하세요
              </h3>
              <p className="text-sm text-ink-sub leading-relaxed mt-3">
                제목, 카테고리, 본문만 있으면 충분합니다. 익명으로 안전하게.
              </p>
            </div>
            {/* Mini write UI */}
            <div
              className="mx-6 mb-0 rounded-t-3 border-b"
              style={{ background: COLORS.surfaceRaised, border: `1px solid ${COLORS.line}`, borderBottom: 'none', padding: '20px' }}
            >
              <div className="flex flex-wrap gap-1.5 mb-3.5">
                {['#시설', '#급식', '#교칙', '#학사', '#기타'].map((c, i) => (
                  <span
                    key={c}
                    className={`text-sm px-2.5 py-1.25 rounded-full border font-normal tracking-tight ${
                      i === 0 ? 'bg-ink text-white' : `bg-white text-ink-sub border-${COLORS.line}`
                    }`}
                    style={{ borderColor: i === 0 ? COLORS.ink : COLORS.line }}
                  >
                    {c}
                  </span>
                ))}
              </div>
              <div
                className="h-9 bg-white rounded-2 border px-3 flex items-center text-sm text-ink font-bold mb-2.5 tracking-tight"
                style={{ border: `1px solid ${COLORS.line}` }}
              >
                도서관 4층 자습실에 콘센트 추가 설치
              </div>
              <div
                className="h-14 bg-white rounded-2 border px-3 py-2.5 text-sm text-ink-sub leading-relaxed"
                style={{ border: `1px solid ${COLORS.line}` }}
              >
                시험 기간에는 노트북 사용이 늘어 콘센트가 부족합니다…
              </div>
            </div>
          </BentoCard>

          {/* Top right: vote progress */}
          <BentoCard className="col-span-1 flex flex-col p-8">
            <div className="text-2xs font-bold tracking-widest text-brand mb-3.5">
              VOTE
            </div>
            <h3 className="text-6xl font-bold m-0 tracking-tighter leading-snug">
              30표가 모이면<br/>자동 전달
            </h3>
            <p className="text-sm text-ink-sub leading-relaxed mt-3">
              같은 생각을 가진 친구들의 추천이 쌓이면, 학생회로 자동으로 전달됩니다.
            </p>
            <div className="mt-auto pt-6">
              <div className="flex justify-between items-baseline mb-2.5">
                <span className="text-sm text-ink-sub">선정까지</span>
                <span className="text-6xl font-black text-ink tracking-tighter">
                  28<span className="text-sm text-ink-muted font-medium">/30</span>
                </span>
              </div>
              <div className="h-2 bg-line-soft rounded-full overflow-hidden">
                <div className="w-11/12 h-full bg-ink rounded-full" />
              </div>
              <div className="mt-2.5 text-sm font-bold" style={{ color: COLORS.fire }}>
                🔥 단 2표 남음 — 친구에게 공유해보세요
              </div>
            </div>
          </BentoCard>

          {/* Top far right: archive */}
          <BentoCard className="col-span-1 p-7">
            <div className="text-2xs font-bold tracking-widest text-brand mb-3.5">
              ARCHIVE
            </div>
            <h3 className="text-6xl font-bold m-0 tracking-tighter leading-snug">
              모든 과정을<br/>투명하게 공개
            </h3>
            <p className="text-sm text-ink-sub leading-relaxed mt-3">
              반영 여부, 협의 결과, 사유까지. 아카이브에서 확인하세요.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {[
                ['체육관 그물 교체', '반영 완료', COLORS.brand, COLORS.brandLight],
                ['점심시간 연장', '협의 중', '#7A6A2F', '#F4EFDB'],
                ['교복 셔츠 자율화', '반려', '#C2410C', '#FDEFE3'],
              ].map(([t, s, sc, sb]) => (
                <div
                  key={t}
                  className="flex justify-between items-center px-3 py-2.5 rounded-2.25 border"
                  style={{ background: COLORS.surfaceRaised, border: `1px solid ${COLORS.line}` }}
                >
                  <span className="text-sm font-bold text-ink">{t}</span>
                  <span className="text-2xs px-2 py-0.75 rounded-full font-bold whitespace-nowrap" style={{ background: sb, color: sc }}>
                    {s}
                  </span>
                </div>
              ))}
            </div>
          </BentoCard>

          {/* Bottom left: admin */}
          <BentoCard className="col-span-1 p-7">
            <div className="text-2xs font-bold tracking-widest text-brand mb-3.5">
              ADMIN
            </div>
            <h3 className="text-6xl font-bold m-0 tracking-tighter leading-snug">
              학생회 전용<br/>관리 도구
            </h3>
            <p className="text-sm text-ink-sub leading-relaxed mt-3">
              운영자 계정으로만 접근 가능한 대시보드. 발의자 확인, 상태 변경, 신고 처리까지.
            </p>
            <div className="mt-4.5 flex gap-2">
              <span className="px-3.5 py-2 rounded-2 bg-ink text-white text-sm font-bold">협의 중</span>
              <span className="px-3.5 py-2 rounded-2 bg-brand-light text-brand text-sm font-bold border" style={{ borderColor: 'rgba(14,82,64,0.15)' }}>반영 완료</span>
              <span className="px-3.5 py-2 rounded-2 text-sm font-bold border" style={{ background: COLORS.fireSoft, color: '#C2410C', borderColor: '#F2D6C2' }}>반려</span>
            </div>
          </BentoCard>

          {/* Bottom mid+right: privacy */}
          <BentoCard className="col-span-2 p-10" style={{ background: COLORS.ink, borderColor: 'transparent' }}>
            <div className="text-2xs font-bold tracking-widest mb-3.5" style={{ color: 'rgba(155,210,190,1)' }}>
              PRIVACY & SAFETY
            </div>
            <h3 className="text-7xl font-black m-0 tracking-tighter text-white leading-tight">
              학생 화면에서는 익명. 운영진만 작성자 정보를 확인합니다.
            </h3>
            <div className="grid grid-cols-3 gap-5 mt-7">
              {[
                ['🎭', '익명 게시', '일반 학생에게는 이름과 학교 이메일이 노출되지 않습니다.'],
                ['⚙️', '운영진 전용 열람', '신고·블라인드 처리 등 운영 목적 외에는 사용되지 않습니다.'],
                ['🔒', '신고 시스템', '동일 안건 중복 신고를 막고, 신고 3회 이상이면 운영진이 검토합니다.'],
              ].map(([ic, t, d]) => (
                <div key={t} className="p-5 rounded-3 border" style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)' }}>
                  <div className="text-5xl mb-2.5">{ic}</div>
                  <div className="text-lg font-bold text-white mb-2">{t}</div>
                  <div className="text-sm text-white leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{d}</div>
                </div>
              ))}
            </div>
          </BentoCard>
        </div>
      </div>
    </section>
  )
}
