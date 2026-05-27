import { useState } from 'react'
import { useNavigate } from 'react-router'
import MicMark from '../components/shared/MicMark'
import Btn from '../components/shared/Btn'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { COLORS } from '../tokens/tokens'

const RULES = [
  {
    ok: true,
    title: '실제로 학교에 필요한 제안을 솔직하게 적어주세요.',
    sub: '시설, 급식, 교칙, 학사일정 등 무엇이든 좋습니다.',
  },
  {
    ok: true,
    title: '근거와 대안을 함께 적으면 채택 가능성이 높아집니다.',
    sub: '왜 필요한지, 어떻게 가능한지 한 줄이라도 함께.',
  },
  {
    ok: false,
    title: '특정 학생·교사를 향한 비방·인신공격은 금지됩니다.',
    sub: '실명을 거론하거나 모욕적 표현은 즉시 블라인드 처리됩니다.',
  },
  {
    ok: false,
    title: '개인정보, 비속어, 허위사실은 작성할 수 없습니다.',
    sub: '신고 5회 누적 시 자동 비공개되며, 운영진이 검토합니다.',
  },
]

export default function GuidelinesPage() {
  const navigate = useNavigate()
  const { user, refreshProfile } = useAuth()
  const [agreed, setAgreed] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleAgree = async () => {
    if (!agreed || !user) return
    setSaving(true)
    await supabase
      .from('profiles')
      .update({ agreed_to_guidelines: true })
      .eq('id', user.id)
    await refreshProfile()
    navigate('/home')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLORS.bg,
        padding: '56px 48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily:
          "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif",
        color: COLORS.ink,
        letterSpacing: '-0.01em',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          background: COLORS.surface,
          borderRadius: 20,
          border: `1px solid ${COLORS.line}`,
          overflow: 'hidden',
          boxShadow: '0 24px 48px -28px rgba(20,20,20,0.18)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '40px 48px 28px',
            borderBottom: `1px solid ${COLORS.lineSoft}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <MicMark size={22} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.16em',
                color: COLORS.brand,
              }}
            >
              COMMUNITY GUIDELINES
            </span>
          </div>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              margin: 0,
              letterSpacing: '-0.028em',
              lineHeight: 1.2,
            }}
          >
            건전한 제안 문화를<br />함께 만들어가요.
          </h1>
          <p style={{ fontSize: 13, color: COLORS.inkSub, marginTop: 14, lineHeight: 1.7 }}>
            학생의 목소리는 누구나 자유롭게 의견을 낼 수 있는 공간입니다.
            서로 존중하는 공간이 될 수 있도록 아래 가이드라인을 함께 지켜주세요.
          </p>
        </div>

        {/* Rules */}
        <div
          style={{
            padding: '32px 48px 36px',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          {RULES.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  flexShrink: 0,
                  background: r.ok ? COLORS.brandSoft : COLORS.warnSoft,
                  color: r.ok ? COLORS.brand : COLORS.warn,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {r.ok ? '✓' : '×'}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink, lineHeight: 1.5 }}>
                  {r.title}
                </div>
                <div style={{ fontSize: 12.5, color: COLORS.inkSub, marginTop: 5, lineHeight: 1.6 }}>
                  {r.sub}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer CTA */}
        <div
          style={{
            padding: '24px 48px 36px',
            borderTop: `1px solid ${COLORS.lineSoft}`,
            background: COLORS.surfaceAlt,
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
              color: COLORS.ink,
              cursor: 'pointer',
            }}
            onClick={() => setAgreed(!agreed)}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 5,
                background: agreed ? COLORS.brand : COLORS.surface,
                border: `1px solid ${agreed ? COLORS.brand : COLORS.line}`,
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {agreed ? '✓' : ''}
            </span>
            위 내용을 읽었으며 가이드라인에 동의합니다.
          </label>

          <Btn
            variant="brand"
            size="lg"
            full
            style={{ marginTop: 18, opacity: (!agreed || saving) ? 0.6 : 1 }}
            onClick={handleAgree}
            disabled={!agreed || saving}
          >
            {saving ? '처리 중...' : '동의하고 시작하기 →'}
          </Btn>

          <p style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 12, textAlign: 'center' }}>
            가이드라인 미준수로 인한 불이익 발생 시 운영진이 책임지지 않습니다.
          </p>
        </div>
      </div>
    </div>
  )
}
