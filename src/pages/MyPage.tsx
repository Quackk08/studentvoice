import { useState } from 'react'
import { useNavigate } from 'react-router'
import AppLayout from '../components/shared/AppLayout'
import Badge from '../components/shared/Badge'
import ProgressBar from '../components/shared/ProgressBar'
import Btn from '../components/shared/Btn'
import { useAuth } from '../contexts/AuthContext'
import { useMyProposals, useNotificationSettings } from '../hooks/useProposals'
import { supabase } from '../lib/supabase'
import { COLORS } from '../tokens/tokens'
import type { BadgeTone } from '../tokens/tokens'
import type { Proposal } from '../types/database'

// ── Helpers ──
function proposalStatus(p: Proposal): [string, BadgeTone] {
  if (p.vote_count >= 20 && p.status === 'active') return ['인기 이슈', 'fire']
  if (p.status === 'active')   return ['제안 중', 'outline']
  if (p.status === 'selected') return ['선정됨', 'brand']
  if (p.status === 'done')     return ['반영 완료', 'brandSoft']
  if (p.status === 'rejected') return ['반려', 'warn']
  return ['기타', 'default']
}

function initials(name: string | null | undefined, email: string | null | undefined): string {
  if (name && name.length >= 2) return name.slice(0, 2)
  if (email) return email.slice(0, 2).toUpperCase()
  return '?'
}

// ── Sub-components ──
function TagPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold px-2 py-0.75 rounded-1 bg-surface-alt text-ink-sub border border-line">
      {children}
    </span>
  )
}

function Stat({ n, l, tone }: { n: string; l: string; tone?: 'brand' }) {
  return (
    <div>
      <div
        className="text-6xl font-bold leading-none"
        style={{
          letterSpacing: '-0.03em',
          color: tone === 'brand' ? COLORS.brand : COLORS.ink,
          fontFeatureSettings: '"tnum"',
        }}
      >
        {n}
      </div>
      <div className="text-xs text-ink-sub mt-1.5">{l}</div>
    </div>
  )
}

// ── Page ──
export default function MyPage() {
  const navigate = useNavigate()
  const { user, profile, signOut, refreshProfile } = useAuth()
  const { data: myProposals, loading } = useMyProposals(user?.id)
  const { settings: notifSettings, updateSetting } = useNotificationSettings(user?.id)

  // Profile edit state
  const [profileEditing, setProfileEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editGrade, setEditGrade] = useState<number | ''>('')
  const [editClass, setEditClass] = useState<number | ''>('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileStatus, setProfileStatus] = useState<string | null>(null)

  const handleStartEdit = () => {
    setEditName(profile?.name ?? '')
    setEditGrade(profile?.grade ?? '')
    setEditClass(profile?.class ?? '')
    setProfileStatus(null)
    setProfileEditing(true)
  }

  const handleCancelEdit = () => {
    setProfileEditing(false)
    setProfileStatus(null)
  }

  const handleSaveProfile = async () => {
    if (!user) return
    if (!editName.trim()) { setProfileStatus('이름을 입력해주세요.'); return }
    const classVal = Number(editClass)
    if (editClass !== '' && (classVal < 1 || classVal > 20)) {
      setProfileStatus('반은 1~20 사이로 입력해주세요.'); return
    }
    setProfileSaving(true)
    setProfileStatus(null)
    try {
      const { error } = await supabase.from('profiles').update({
        name: editName.trim(),
        ...(editGrade !== '' ? { grade: Number(editGrade) } : {}),
        ...(editClass !== '' ? { class: classVal } : {}),
      }).eq('id', user.id)
      if (error) {
        setProfileStatus('저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
      } else {
        await refreshProfile()
        setProfileEditing(false)
        setProfileStatus('✓ 프로필이 업데이트되었습니다.')
      }
    } finally {
      setProfileSaving(false)
    }
  }

  // Password change state
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confPw, setConfPw] = useState('')
  const [pwStatus, setPwStatus] = useState<string | null>(null)
  const [pwLoading, setPwLoading] = useState(false)

  // Stats
  const totalProposals = myProposals.length
  const selectedCount = myProposals.filter(p => p.status !== 'active' && p.status !== 'blinded').length

  const handleChangePw = async () => {
    if (!newPw || newPw.length < 8) {
      setPwStatus('새 비밀번호는 8자 이상이어야 합니다.')
      return
    }
    if (newPw !== confPw) {
      setPwStatus('새 비밀번호와 확인이 일치하지 않습니다.')
      return
    }
    setPwLoading(true)
    setPwStatus(null)
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: user!.email!, password: curPw,
    })
    if (authErr) {
      setPwStatus('현재 비밀번호가 올바르지 않습니다.')
      setPwLoading(false)
      return
    }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) {
      setPwStatus(error.message)
    } else {
      setPwStatus('✓ 비밀번호가 변경되었습니다.')
      setCurPw(''); setNewPw(''); setConfPw('')
    }
    setPwLoading(false)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const displayName = profile?.name ?? profile?.email?.split('@')[0] ?? '학생'
  const displayEmail = profile?.email ?? user?.email ?? ''
  const gradeClass = (profile?.grade && profile?.class)
    ? `${profile.grade}학년 ${profile.class}반`
    : null

  return (
    <AppLayout active="home" isAdmin={profile?.is_admin}>
      {/* Profile section */}
      <section className="px-4 sm:px-12 pt-10 sm:pt-14 pb-6 bg-bg">
        <div className="max-w-[1080px] mx-auto">
          <div className="text-xs font-bold text-brand mb-3.5" style={{ letterSpacing: '0.18em' }}>
            MY PAGE
          </div>

          {/* Profile card */}
          <div className="bg-surface border border-line rounded-5 p-6 sm:p-8 flex flex-col sm:grid sm:gap-6 sm:items-center" style={{ gridTemplateColumns: '1fr auto' }}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5.5">
              {/* Avatar */}
              <div
                className="w-16 sm:w-18 h-16 sm:h-18 rounded-full grid place-items-center text-white font-bold flex-shrink-0"
                style={{ background: COLORS.brand, fontSize: 22, letterSpacing: '-0.02em' }}
              >
                {initials(profile?.name, profile?.email)}
              </div>

              {profileEditing ? (
                /* ── Edit form ── */
                <div className="flex flex-col gap-2.5 flex-1 w-full">
                  {/* Name */}
                  <div>
                    <div className="text-xs font-semibold text-ink-sub mb-1">이름</div>
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="이름"
                      maxLength={40}
                      className="h-9 border border-line rounded-2 px-3 text-base text-ink font-sans outline-none bg-surface box-border w-full max-w-[220px]"
                    />
                  </div>
                  {/* Grade + Class */}
                  <div className="flex gap-2.5 items-end">
                    <div>
                      <div className="text-xs font-semibold text-ink-sub mb-1">학년</div>
                      <div className="flex gap-1.5">
                        {[1, 2, 3].map(g => (
                          <button
                            key={g}
                            onClick={() => setEditGrade(editGrade === g ? '' : g)}
                            className="w-9 h-9 rounded-2 text-sm font-semibold cursor-pointer font-sans"
                            style={{
                              border: `1px solid ${editGrade === g ? COLORS.brand : COLORS.line}`,
                              background: editGrade === g ? COLORS.brand : COLORS.surface,
                              color: editGrade === g ? '#fff' : COLORS.ink,
                            }}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-ink-sub mb-1">반</div>
                      <input
                        type="number"
                        value={editClass}
                        onChange={e => setEditClass(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="반"
                        min={1} max={20}
                        className="w-16 h-9 border border-line rounded-2 px-2.5 text-base text-ink font-sans outline-none bg-surface box-border"
                      />
                    </div>
                  </div>
                  {profileStatus && (
                    <div className={`text-xs ${profileStatus.startsWith('✓') ? 'text-brand' : 'text-warn'}`}>
                      {profileStatus}
                    </div>
                  )}
                  <div className="flex gap-2 mt-0.5">
                    <Btn variant="primary" size="sm" onClick={handleSaveProfile} disabled={profileSaving}>
                      {profileSaving ? '저장 중…' : '저장'}
                    </Btn>
                    <Btn variant="outline" size="sm" onClick={handleCancelEdit} disabled={profileSaving}>
                      취소
                    </Btn>
                  </div>
                </div>
              ) : (
                /* ── Display mode ── */
                <div>
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span className="text-4xl font-bold" style={{ letterSpacing: '-0.02em' }}>{displayName}</span>
                    {gradeClass && <Badge>{gradeClass}</Badge>}
                  </div>
                  <div className="text-sm text-ink-sub">{displayEmail}</div>
                  <div className="text-xs text-ink-muted mt-1">재학생 계정 · {profile?.is_admin ? '운영자' : '일반 학생'}</div>
                  {profileStatus && (
                    <div className="text-xs text-brand mt-1.5">{profileStatus}</div>
                  )}
                </div>
              )}
            </div>

            {/* Stats + Sign out */}
            <div className="flex items-center gap-6 sm:gap-8 mt-6 sm:mt-0 pt-6 sm:pt-0 border-t sm:border-t-0 sm:border-l border-line-soft sm:pl-8">
              <Stat n={String(totalProposals)} l="작성한 안건" />
              <Stat n={String(selectedCount)} l="선정된 안건" tone="brand" />
              <div className="ml-2 flex flex-col gap-2 items-stretch">
                {!profileEditing && (
                  <Btn variant="outline" size="sm" onClick={handleStartEdit}>정보 수정</Btn>
                )}
                <Btn variant="outline" size="sm" onClick={handleSignOut}>로그아웃</Btn>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <section className="px-4 sm:px-12 pt-6 pb-20 bg-bg">
        <div className="max-w-[1080px] mx-auto grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-5">
          {/* My proposals */}
          <div className="bg-surface border border-line rounded-4 overflow-hidden">
            <div className="px-6 py-5 border-b border-line-soft flex justify-between items-center">
              <h3 className="text-xl font-bold m-0" style={{ letterSpacing: '-0.02em' }}>
                내가 작성한 안건
                <span className="ml-2 text-sm text-ink-muted font-medium">
                  · {loading ? '…' : `${totalProposals}건`}
                </span>
              </h3>
              <span className="text-xs text-ink-sub">최신순 ↓</span>
            </div>

            {loading ? (
              <div className="px-6 py-10 text-center text-ink-muted text-sm">불러오는 중…</div>
            ) : myProposals.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="text-3xl mb-2.5">✏️</div>
                <div className="text-sm text-ink-sub mb-4">아직 작성한 안건이 없습니다</div>
                <Btn variant="primary" size="sm" onClick={() => navigate('/write')}>
                  첫 번째 안건 작성하기
                </Btn>
              </div>
            ) : (
              myProposals.map((m, i) => {
                const [stateLabel, tone] = proposalStatus(m)
                const isActive = m.status === 'active'
                return (
                  <div
                    key={m.id}
                    onClick={() => navigate(`/proposals/${m.id}`)}
                    className="px-6 py-4.5 grid items-center gap-4 cursor-pointer"
                    style={{
                      gridTemplateColumns: '1fr auto',
                      borderTop: i ? `1px solid ${COLORS.lineSoft}` : 'none',
                    }}
                  >
                    <div>
                      <div className="flex gap-2 items-center mb-1.5">
                        <TagPill>{m.category}</TagPill>
                        <Badge tone={tone}>{stateLabel}</Badge>
                      </div>
                      <div className="text-base font-semibold text-ink mb-2" style={{ letterSpacing: '-0.015em' }}>
                        {m.title}
                      </div>
                      {isActive ? (
                        <div className="flex items-center gap-2.5">
                          <div className="flex-1 max-w-[200px]">
                            <ProgressBar value={m.vote_count} max={30} height={5} />
                          </div>
                          <span className="text-xs text-ink-muted" style={{ fontFeatureSettings: '"tnum"' }}>
                            {m.vote_count}/30표
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-brand font-semibold">✓ 선정 · {m.vote_count}표</span>
                      )}
                    </div>
                    <span className="text-ink-muted text-xl">→</span>
                  </div>
                )
              })
            )}
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-5">
            {/* Password change */}
            <div className="bg-surface border border-line rounded-4 p-6">
              <h3 className="text-xl font-bold m-0" style={{ letterSpacing: '-0.02em' }}>비밀번호 변경</h3>
              <p className="text-xs text-ink-sub mt-1.5 mb-4.5" style={{ lineHeight: 1.55 }}>
                현재 비밀번호를 입력한 후 새 비밀번호로 변경할 수 있습니다.
              </p>
              <div className="flex flex-col gap-3">
                {[
                  { label: '현재 비밀번호', value: curPw, onChange: setCurPw, placeholder: '현재 비밀번호' },
                  { label: '새 비밀번호', value: newPw, onChange: setNewPw, placeholder: '영문+숫자 8자 이상' },
                  { label: '새 비밀번호 확인', value: confPw, onChange: setConfPw, placeholder: '다시 한 번 입력' },
                ].map(({ label, value, onChange, placeholder }) => (
                  <div key={label}>
                    <div className="text-xs font-semibold text-ink mb-2">{label}</div>
                    <div className="flex items-center border border-line rounded-2.5 bg-surface px-3.5 h-12">
                      <input
                        type="password"
                        placeholder={placeholder}
                        value={value}
                        onChange={e => onChange(e.target.value)}
                        className="flex-1 border-none outline-none text-base text-ink font-sans bg-transparent"
                      />
                    </div>
                  </div>
                ))}
              </div>
              {pwStatus && (
                <div className={`mt-2.5 text-xs ${pwStatus.startsWith('✓') ? 'text-brand' : 'text-warn'}`}>
                  {pwStatus}
                </div>
              )}
              <Btn
                variant="primary" size="md" full
                style={{ marginTop: 18 }}
                onClick={handleChangePw}
                disabled={pwLoading}
              >
                {pwLoading ? '변경 중…' : '변경하기'}
              </Btn>
            </div>

            {/* Notifications */}
            <div className="bg-surface border border-line rounded-4 p-6">
              <h3 className="text-xl font-bold m-0 mb-3.5" style={{ letterSpacing: '-0.02em' }}>알림 설정</h3>
              {(
                [
                  { key: 'on_selected', label: '내 안건이 선정되었을 때' },
                  { key: 'on_reply',    label: '내 안건에 학생회 답변이 달렸을 때' },
                  { key: 'on_voted',    label: '추천한 안건의 상태가 변경되었을 때' },
                ] as const
              ).map(({ key, label }) => {
                const on = notifSettings[key]
                return (
                  <div
                    key={key}
                    className="flex justify-between items-center py-2.5 border-t border-line-soft"
                  >
                    <span className="text-sm text-ink">{label}</span>
                    <div
                      onClick={() => updateSetting(key, !on)}
                      className="w-8.5 h-5 rounded-full relative cursor-pointer transition-colors flex-shrink-0"
                      style={{ background: on ? COLORS.brand : COLORS.line }}
                    >
                      <span
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                        style={{ left: on ? 16 : 2, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>
    </AppLayout>
  )
}
