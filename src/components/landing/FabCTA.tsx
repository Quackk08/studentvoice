import { useNavigate } from 'react-router'
import { COLORS } from '../../tokens/tokens'

export default function FabCTA() {
  const navigate = useNavigate()
  return (
    <section id="cta" className="py-25 text-center" style={{ background: COLORS.ink, color: 'white' }}>
      <div className="max-w-prose mx-auto px-15">
        <h2 className="text-10xl font-black m-0 tracking-tighter leading-tight mb-6">
          오늘, 학교에<br/>한 표.
        </h2>
        <p className="text-xl text-white leading-relaxed mb-9" style={{ opacity: 0.8 }}>
          714명의 학생이 이미 참여했습니다. 당신의 목소리를 들려주세요.
        </p>
        <button
          onClick={() => navigate('/login')}
          className="px-7 py-4 rounded-3 bg-brand text-white text-lg font-bold cursor-pointer inline-flex items-center gap-2 tracking-tight hover:opacity-90"
          style={{ boxShadow: '0 4px 16px rgba(14,82,64,0.3)' }}
        >
          학교 이메일로 시작하기
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </section>
  )
}
