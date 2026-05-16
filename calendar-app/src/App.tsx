import { useEffect, useState } from 'react'
import { api } from './api'
import type { User, GCalStatus } from './types'
import CalendarView from './CalendarView'

type Screen = 'loading' | 'calendar' | 'connect-gcal'

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const u = await api.me()
        setUser(u)
      } catch (e: any) {
        if (e.status === 401) {
          window.location.href = '/app/'
          return
        }
        throw e
      }
      try {
        const status: GCalStatus = await api.gcalStatus()
        setScreen(status.connected ? 'calendar' : 'connect-gcal')
      } catch {
        setScreen('connect-gcal')
      }
    }
    init()
  }, [])

  if (screen === 'loading') return <LoadingScreen />
  if (screen === 'connect-gcal') return <ConnectGCalScreen user={user} />
  return <CalendarView user={user!} onDisconnect={() => setScreen('connect-gcal')} />
}

function LoadingScreen() {
  return (
    <div style={S.center}>
      <div style={S.spinner} />
    </div>
  )
}

function ConnectGCalScreen({ user }: { user: User | null }) {
  return (
    <div style={S.center} dir="rtl">
      <div style={S.connectCard}>
        <div style={{ fontSize: 52 }}>📅</div>
        <h1 style={S.connectTitle}>לוח שנה אקדמי</h1>
        <p style={S.connectSub}>
          חבר את Google Calendar כדי לראות את הפנויות שלך ולתזמן משימות
        </p>
        <div style={S.featureList}>
          <FeatureRow icon="👁" text="ראה את כל האירועים שלך כרקע אפור" />
          <FeatureRow icon="🎯" text="גרור משימות לתוך חלונות פנויים" />
          <FeatureRow icon="✅" text="המשימה תתווסף אוטומטית ללוח אקדמיה" />
        </div>
        <a href="/gcal/auth" style={S.connectBtn}>חבר Google Calendar</a>
        {user && <p style={S.userHint}>מחובר כ-{user.email}</p>}
        <a href="/app/" style={S.backLink}>← חזרה לדשבורד</a>
      </div>
    </div>
  )
}

function FeatureRow({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={S.featureRow}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 14, color: '#374151', flex: 1 }}>{text}</span>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  center: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f8f9fa',
    fontFamily: "'Assistant', 'Heebo', system-ui, sans-serif",
  },
  spinner: {
    width: 36,
    height: 36,
    border: '3px solid #e5e7eb',
    borderTop: '3px solid #6366f1',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  connectCard: {
    background: '#fff',
    borderRadius: 16,
    padding: '48px 40px',
    maxWidth: 420,
    width: '90%',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  connectTitle: { fontSize: 24, fontWeight: 700, margin: 0, color: '#111827' },
  connectSub: { fontSize: 15, color: '#6b7280', margin: 0, lineHeight: 1.6 },
  featureList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    alignSelf: 'stretch',
    marginTop: 4,
  },
  featureRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: '#f9fafb',
    borderRadius: 8,
    padding: '10px 14px',
    textAlign: 'right',
  },
  connectBtn: {
    display: 'block',
    background: '#6366f1',
    color: '#fff',
    borderRadius: 10,
    padding: '14px 32px',
    fontSize: 16,
    fontWeight: 600,
    textDecoration: 'none',
    marginTop: 8,
  },
  userHint: { fontSize: 12, color: '#9ca3af', margin: 0 },
  backLink: { fontSize: 13, color: '#6366f1', textDecoration: 'none' },
}
