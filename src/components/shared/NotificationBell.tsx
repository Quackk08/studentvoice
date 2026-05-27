import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { COLORS } from '../../tokens/tokens'
import { useUserNotifications, type UserNotification, type UserNotificationKind } from '../../hooks/useProposals'

interface NotificationBellProps {
  userId?: string
}

type ViewMode = 'all' | 'unread'

interface StoredNotificationState {
  readIds: string[]
  dismissedIds: string[]
}

const EMPTY_STATE: StoredNotificationState = {
  readIds: [],
  dismissedIds: [],
}

const KIND_LABEL: Record<UserNotificationKind, string> = {
  selected: '선정',
  done: '반영',
  rejected: '검토',
  reply: '답변',
}

const KIND_COLOR: Record<UserNotificationKind, string> = {
  selected: COLORS.ink,
  done: COLORS.brand,
  rejected: '#A14A12',
  reply: '#3454A4',
}

function getStorageKey(userId?: string) {
  return `studentvoice.notifications.${userId ?? 'guest'}`
}

function loadStoredState(userId?: string): StoredNotificationState {
  try {
    const value = window.sessionStorage.getItem(getStorageKey(userId))
    if (!value) return EMPTY_STATE
    const parsed = JSON.parse(value) as Partial<StoredNotificationState>
    return {
      readIds: Array.isArray(parsed.readIds) ? parsed.readIds : [],
      dismissedIds: Array.isArray(parsed.dismissedIds) ? parsed.dismissedIds : [],
    }
  } catch {
    return EMPTY_STATE
  }
}

function formatTime(value: string) {
  const date = new Date(value)
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)

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
  const [storedState, setStoredState] = useState<StoredNotificationState>(() => loadStoredState(userId))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setStoredState(loadStoredState(userId))
  }, [userId])

  useEffect(() => {
    window.sessionStorage.setItem(getStorageKey(userId), JSON.stringify(storedState))
  }, [storedState, userId])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  const readIds = useMemo(() => new Set(storedState.readIds), [storedState.readIds])
  const dismissedIds = useMemo(() => new Set(storedState.dismissedIds), [storedState.dismissedIds])
  const notifications = useMemo(
    () => data.filter(notification => !dismissedIds.has(notification.id)),
    [data, dismissedIds],
  )
  const unreadCount = notifications.filter(notification => !readIds.has(notification.id)).length
  const visibleNotifications = viewMode === 'unread'
    ? notifications.filter(notification => !readIds.has(notification.id))
    : notifications

  const updateStoredState = (updater: (current: StoredNotificationState) => StoredNotificationState) => {
    setStoredState(current => {
      const next = updater(current)
      return {
        readIds: Array.from(new Set(next.readIds)),
        dismissedIds: Array.from(new Set(next.dismissedIds)),
      }
    })
  }

  const markRead = (id: string) => {
    updateStoredState(current => ({ ...current, readIds: [...current.readIds, id] }))
  }

  const dismiss = (id: string) => {
    updateStoredState(current => ({
      readIds: current.readIds.filter(readId => readId !== id),
      dismissedIds: [...current.dismissedIds, id],
    }))
  }

  const markAllRead = () => {
    updateStoredState(current => ({ ...current, readIds: [...current.readIds, ...notifications.map(item => item.id)] }))
  }

  const clearRead = () => {
    updateStoredState(current => ({
      readIds: [],
      dismissedIds: [
        ...current.dismissedIds,
        ...notifications.filter(item => readIds.has(item.id)).map(item => item.id),
      ],
    }))
  }

  const openNotification = (notification: UserNotification) => {
    markRead(notification.id)
    setOpen(false)
    navigate(notification.href)
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="알림"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          border: `1px solid ${open ? COLORS.brand : COLORS.line}`,
          background: open ? COLORS.brandLight : COLORS.surface,
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          position: 'relative',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path
            d="M4 8a6 6 0 0 1 12 0v3l1.5 2.5h-15L4 11V8Z"
            stroke={COLORS.ink} strokeWidth="1.4" strokeLinejoin="round"
          />
          <path d="M8 16a2 2 0 0 0 4 0" stroke={COLORS.ink} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -5,
              right: -5,
              minWidth: 17,
              height: 17,
              padding: '0 5px',
              borderRadius: 99,
              background: '#D94A1E',
              color: '#fff',
              fontSize: 10,
              fontWeight: 800,
              lineHeight: '17px',
              border: `2px solid ${COLORS.surface}`,
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 48,
            right: -10,
            width: 360,
            maxWidth: 'calc(100vw - 32px)',
            background: COLORS.surface,
            border: `1px solid ${COLORS.line}`,
            borderRadius: 14,
            boxShadow: '0 18px 45px rgba(18, 18, 18, 0.16)',
            zIndex: 50,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${COLORS.lineSoft}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.ink, letterSpacing: '-0.02em' }}>
                  알림
                </div>
                <div style={{ marginTop: 3, fontSize: 11, color: COLORS.inkMuted }}>
                  읽지 않은 알림 {unreadCount}개
                </div>
              </div>
              <button
                type="button"
                onClick={markAllRead}
                disabled={unreadCount === 0}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: unreadCount === 0 ? COLORS.inkMuted : COLORS.brand,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: unreadCount === 0 ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                모두 읽음
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              {(['all', 'unread'] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  style={{
                    height: 28,
                    padding: '0 10px',
                    borderRadius: 999,
                    border: `1px solid ${viewMode === mode ? COLORS.ink : COLORS.line}`,
                    background: viewMode === mode ? COLORS.ink : COLORS.surface,
                    color: viewMode === mode ? '#fff' : COLORS.inkSub,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {mode === 'all' ? '전체' : '읽지 않음'}
                </button>
              ))}
              <button
                type="button"
                onClick={clearRead}
                disabled={!notifications.some(item => readIds.has(item.id))}
                style={{
                  marginLeft: 'auto',
                  border: 'none',
                  background: 'transparent',
                  color: notifications.some(item => readIds.has(item.id)) ? COLORS.inkSub : COLORS.inkMuted,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: notifications.some(item => readIds.has(item.id)) ? 'pointer' : 'default',
                  fontFamily: 'inherit',
                }}
              >
                읽은 알림 정리
              </button>
            </div>
          </div>

          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 28, textAlign: 'center', color: COLORS.inkMuted, fontSize: 13 }}>
                알림을 불러오는 중입니다
              </div>
            ) : visibleNotifications.length === 0 ? (
              <div style={{ padding: '38px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 10 }}>✓</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink }}>
                  정리할 알림이 없습니다
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: COLORS.inkMuted }}>
                  내 안건에 변화가 생기면 여기에 표시됩니다.
                </div>
              </div>
            ) : (
              visibleNotifications.map(notification => {
                const unread = !readIds.has(notification.id)
                return (
                  <div
                    key={notification.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openNotification(notification)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') openNotification(notification)
                    }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr auto',
                      gap: 10,
                      padding: '14px 14px',
                      borderTop: `1px solid ${COLORS.lineSoft}`,
                      background: unread ? COLORS.surfaceRaised : COLORS.surface,
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 99,
                        marginTop: 6,
                        background: unread ? KIND_COLOR[notification.kind] : COLORS.line,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            color: KIND_COLOR[notification.kind],
                            background: unread ? COLORS.brandLight : COLORS.surfaceAlt,
                            borderRadius: 999,
                            padding: '2px 6px',
                          }}
                        >
                          {KIND_LABEL[notification.kind]}
                        </span>
                        <span style={{ fontSize: 10, color: COLORS.inkMuted }}>
                          {formatTime(notification.createdAt)}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.ink, marginBottom: 3 }}>
                        {notification.title}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: COLORS.inkSub,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {notification.message}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="알림 삭제"
                      onClick={event => {
                        event.stopPropagation()
                        dismiss(notification.id)
                      }}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        border: `1px solid ${COLORS.line}`,
                        background: COLORS.surface,
                        color: COLORS.inkMuted,
                        cursor: 'pointer',
                        fontSize: 15,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
