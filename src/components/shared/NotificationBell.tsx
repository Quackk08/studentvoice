import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { COLORS } from '../../tokens/tokens'
import {
  clearReadNotifications,
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
  useUserNotifications,
  type UserNotification,
  type UserNotificationKind,
} from '../../hooks/useProposals'

interface NotificationBellProps { userId?: string }
type ViewMode = 'all' | 'unread'

const KIND_LABEL: Record<UserNotificationKind, string> = {
  selected: '전달',
  discussing: '협의',
  done: '반영',
  rejected: '반려',
  reply: '답변',
}

const KIND_COLOR: Record<UserNotificationKind, string> = {
  selected: COLORS.ink,
  discussing: '#3454A4',
  done: COLORS.brand,
  rejected: '#A14A12',
  reply: '#3454A4',
}

function formatTime(value: string) {
  const date = new Date(value)
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000)
  if (Number.isNaN(date.getTime())) return ''
  if (diffMinutes < 1) return '방금 전'
  if (diffMinutes < 60) return `${diffMinutes}분 전`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}시간 전`
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

export default function NotificationBell({ userId }: NotificationBellProps) {
  const navigate = useNavigate()
  const { data, loading } = useUserNotifications(userId)
  const [open, setOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [actionError, setActionError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const unreadCount = data.filter(item => !item.readAt).length
  const visibleNotifications = useMemo(
    () => viewMode === 'unread' ? data.filter(item => !item.readAt) : data,
    [data, viewMode],
  )

  const markRead = async (id: string) => {
    const { error } = await markNotificationRead(id)
    if (error) setActionError('알림 상태를 저장하지 못했습니다.')
    return !error
  }

  const openNotification = async (notification: UserNotification) => {
    if (!notification.readAt && !(await markRead(notification.id))) return
    setOpen(false)
    navigate(notification.href)
  }

  const handleDismiss = async (id: string) => {
    const { error } = await dismissNotification(id)
    setActionError(error ? '알림을 정리하지 못했습니다.' : null)
  }

  const handleMarkAll = async () => {
    if (!userId) return
    const { error } = await markAllNotificationsRead(userId)
    setActionError(error ? '알림 상태를 저장하지 못했습니다.' : null)
  }

  const handleClearRead = async () => {
    if (!userId) return
    const { error } = await clearReadNotifications(userId)
    setActionError(error ? '읽은 알림을 정리하지 못했습니다.' : null)
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label={`알림${unreadCount ? `, 읽지 않음 ${unreadCount}개` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(value => !value)}
        style={{
          width: 36, height: 36, borderRadius: 10,
          border: `1px solid ${open ? COLORS.brand : COLORS.line}`,
          background: open ? COLORS.brandLight : COLORS.surface,
          display: 'grid', placeItems: 'center', cursor: 'pointer', position: 'relative',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M4 8a6 6 0 0 1 12 0v3l1.5 2.5h-15L4 11V8Z" stroke={COLORS.ink} strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M8 16a2 2 0 0 0 4 0" stroke={COLORS.ink} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span aria-hidden="true" style={{
            position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17,
            padding: '0 5px', borderRadius: 99, background: '#D94A1E', color: '#fff',
            fontSize: 10, fontWeight: 800, lineHeight: '17px', border: `2px solid ${COLORS.surface}`,
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="알림 목록"
          className="notification-panel"
          style={{
            position: 'absolute', top: 48, right: -10, width: 360,
            maxWidth: 'calc(100vw - 24px)', background: COLORS.surface,
            border: `1px solid ${COLORS.line}`, borderRadius: 14,
            boxShadow: '0 18px 45px rgba(18, 18, 18, 0.16)', zIndex: 50, overflow: 'hidden',
          }}
        >
          <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${COLORS.lineSoft}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.ink }}>알림</div>
                <div style={{ marginTop: 3, fontSize: 11, color: COLORS.inkMuted }}>읽지 않은 알림 {unreadCount}개</div>
              </div>
              <button type="button" onClick={handleMarkAll} disabled={unreadCount === 0} className="text-button">
                모두 읽음
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              {(['all', 'unread'] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  aria-pressed={viewMode === mode}
                  style={{
                    height: 28, padding: '0 10px', borderRadius: 999,
                    border: `1px solid ${viewMode === mode ? COLORS.ink : COLORS.line}`,
                    background: viewMode === mode ? COLORS.ink : COLORS.surface,
                    color: viewMode === mode ? '#fff' : COLORS.inkSub,
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {mode === 'all' ? '전체' : '읽지 않음'}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClearRead}
                disabled={!data.some(item => item.readAt)}
                className="text-button"
                style={{ marginLeft: 'auto' }}
              >
                읽은 알림 정리
              </button>
            </div>
            {actionError && <p role="alert" style={{ margin: '10px 0 0', fontSize: 11, color: COLORS.warn }}>{actionError}</p>}
          </div>

          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 28, textAlign: 'center', color: COLORS.inkMuted, fontSize: 13 }}>알림을 불러오는 중입니다</div>
            ) : visibleNotifications.length === 0 ? (
              <div style={{ padding: '38px 24px', textAlign: 'center' }}>
                <div aria-hidden="true" style={{ fontSize: 24, marginBottom: 10 }}>✓</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink }}>정리할 알림이 없습니다</div>
                <div style={{ marginTop: 6, fontSize: 11, color: COLORS.inkMuted }}>내 안건에 변화가 생기면 여기에 표시됩니다.</div>
              </div>
            ) : visibleNotifications.map(notification => {
              const unread = !notification.readAt
              return (
                <div key={notification.id} style={{
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10,
                  padding: '14px', borderTop: `1px solid ${COLORS.lineSoft}`,
                  background: unread ? COLORS.surfaceRaised : COLORS.surface,
                }}>
                  <span aria-hidden="true" style={{
                    width: 8, height: 8, borderRadius: 99, marginTop: 6,
                    background: unread ? KIND_COLOR[notification.kind] : COLORS.line,
                  }} />
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    style={{ minWidth: 0, padding: 0, border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, color: KIND_COLOR[notification.kind],
                        background: unread ? COLORS.brandLight : COLORS.surfaceAlt,
                        borderRadius: 999, padding: '2px 6px',
                      }}>{KIND_LABEL[notification.kind]}</span>
                      <span style={{ fontSize: 10, color: COLORS.inkMuted }}>{formatTime(notification.createdAt)}</span>
                    </span>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: COLORS.ink, marginBottom: 3 }}>{notification.title}</span>
                    <span style={{ display: 'block', fontSize: 12, color: COLORS.inkSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{notification.message}</span>
                  </button>
                  <button
                    type="button"
                    aria-label="알림 삭제"
                    onClick={() => handleDismiss(notification.id)}
                    style={{
                      width: 26, height: 26, borderRadius: 8, border: `1px solid ${COLORS.line}`,
                      background: COLORS.surface, color: COLORS.inkMuted, cursor: 'pointer', fontSize: 15,
                    }}
                  >×</button>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
