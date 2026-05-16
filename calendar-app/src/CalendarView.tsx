import { useEffect, useRef, useState, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin, { Draggable } from '@fullcalendar/interaction'
import type { EventReceiveArg } from '@fullcalendar/interaction'
import type { EventInput, EventChangeArg, EventClickArg } from '@fullcalendar/core'
import heLocale from '@fullcalendar/core/locales/he'
import { api } from './api'
import type { Task, GCalEvent, User } from './types'

interface Props {
  user: User
  onDisconnect: () => void
}

// Category colors — same palette as the main app's presets
const CATEGORY_COLORS = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
]

function categoryColor(_name: string, id: number): string {
  return CATEGORY_COLORS[id % CATEGORY_COLORS.length]
}

interface EventPopup {
  taskId: number
  title: string
  x: number
  y: number
  fcEvent: EventClickArg['event']
}

export default function CalendarView({ user, onDisconnect }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [gcalEvents, setGcalEvents] = useState<GCalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [popup, setPopup] = useState<EventPopup | null>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const calendarRef = useRef<InstanceType<typeof FullCalendar>>(null)

  // Unscheduled adhoc tasks only (recurring tasks have fixed times)
  const unscheduled = tasks.filter(t => t.source === 'adhoc' && !t.scheduled_at && t.status === 'open')
  // Scheduled adhoc tasks → shown on calendar
  const scheduled = tasks.filter(t => t.source === 'adhoc' && t.scheduled_at && t.status === 'open')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [allTasks] = await Promise.all([api.tasks()])
      setTasks(allTasks)
    } catch {
      setError('שגיאה בטעינת משימות')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadGcalEvents = useCallback(async (start: Date, end: Date) => {
    try {
      const events = await api.gcalEvents(start.toISOString(), end.toISOString())
      setGcalEvents(events)
    } catch (e: any) {
      if (e.status === 401) onDisconnect()
    }
  }, [onDisconnect])

  useEffect(() => {
    loadData()
    // GCal events are loaded by datesSet callback when FullCalendar renders,
    // so no manual call needed here — avoids race condition overwriting events.
  }, [loadData])

  // Initialize FullCalendar's external drag on the sidebar
  useEffect(() => {
    if (!sidebarRef.current) return
    const draggable = new Draggable(sidebarRef.current, {
      itemSelector: '.fc-draggable-task',
      eventData(el) {
        const taskId = el.getAttribute('data-task-id') || ''
        const title = el.getAttribute('data-task-title') || ''
        return { id: taskId, title, duration: '01:00' }
      },
    })
    return () => draggable.destroy()
  }, [unscheduled.length])

  const handleEventReceive = async (info: EventReceiveArg) => {
    const taskId = parseInt(info.event.id)
    const start = info.event.start!
    const end = info.event.end || new Date(start.getTime() + 60 * 60 * 1000)

    // Optimistically update local state
    setTasks(prev => prev.map(t =>
      t.id === `a:${taskId}` ? { ...t, scheduled_at: start.toISOString() } : t
    ))

    try {
      await api.scheduleTask(taskId, start.toISOString(), end.toISOString())
    } catch (e: any) {
      info.revert()
      setTasks(prev => prev.map(t =>
        t.id === `a:${taskId}` ? { ...t, scheduled_at: null } : t
      ))
      if (e.status === 401) { onDisconnect(); return }
      setError('שגיאה בתזמון המשימה')
    }
  }

  const handleEventChange = async (info: EventChangeArg) => {
    const taskId = parseInt(info.event.id)
    const start = info.event.start!
    const end = info.event.end || new Date(start.getTime() + 60 * 60 * 1000)

    try {
      await api.scheduleTask(taskId, start.toISOString(), end.toISOString())
    } catch {
      info.revert()
      setError('שגיאה בעדכון המשימה')
    }
  }

  const handleEventClick = (info: EventClickArg) => {
    if (info.event.extendedProps.source !== 'task') return
    const rect = info.el.getBoundingClientRect()
    setPopup({
      taskId: parseInt(info.event.id),
      title: info.event.title,
      x: rect.left + rect.width / 2,
      y: rect.top,
      fcEvent: info.event,
    })
  }

  const handleUnschedule = async () => {
    if (!popup) return
    const { taskId, fcEvent } = popup
    setPopup(null)
    fcEvent.remove()
    setTasks(prev => prev.map(t =>
      t.id === `a:${taskId}` ? { ...t, scheduled_at: null } : t
    ))
    try {
      await api.unscheduleTask(taskId)
    } catch {
      setError('שגיאה בהסרת המשימה')
      loadData()
    }
  }

  // Build FullCalendar event list
  const calendarEvents: EventInput[] = [
    // GCal events — solid calendar color, read-only (lock indicator in eventContent)
    ...gcalEvents.filter(e => !e.is_academia && e.start.includes('T')).map(e => ({
      id: `gcal-${e.id}`,
      title: e.title,
      start: e.start,
      end: e.end,
      backgroundColor: e.color,
      borderColor: e.color,
      textColor: '#fff',
      editable: false,
      extendedProps: { source: 'gcal', calendarName: e.calendar_name },
    })),
    // Scheduled tasks — colored blocks, 1-hour default duration
    ...scheduled.map(t => {
      const start = new Date(t.scheduled_at!)
      const end = new Date(start.getTime() + 60 * 60 * 1000)
      return {
        id: String(t.id.replace('a:', '')),
        title: t.title,
        start: t.scheduled_at!,
        end: end.toISOString(),
        backgroundColor: categoryColor(t.category_name, t.category_id),
        borderColor: categoryColor(t.category_name, t.category_id),
        editable: true,
        extendedProps: { source: 'task', categoryName: t.category_name },
      }
    }),
  ]

  return (
    <div style={S.root} dir="rtl">
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <a href="/app/" style={S.backBtn}>← דשבורד</a>
        </div>
        <div style={S.headerTitle}>
          <span style={{ fontSize: 20, marginLeft: 8 }}>📅</span>
          לוח שנה אקדמי
        </div>
        <div style={S.headerRight}>
          <span style={S.userEmail}>{user.email}</span>
        </div>
      </div>

      {error && (
        <div style={S.errorBanner}>
          {error}
          <button onClick={() => setError(null)} style={S.errorClose}>✕</button>
        </div>
      )}

      {popup && (
        <div style={S.popupOverlay} onClick={() => setPopup(null)}>
          <div
            style={{
              ...S.popup,
              left: Math.min(popup.x, window.innerWidth - 220),
              top: Math.max(popup.y - 110, 70),
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={S.popupTitle}>{popup.title}</div>
            <div style={S.popupSub}>מתוזמן בלוח השנה</div>
            <button onClick={handleUnschedule} style={S.popupDelete}>
              הסר מהלוח
            </button>
            <button onClick={() => setPopup(null)} style={S.popupCancel}>
              ביטול
            </button>
          </div>
        </div>
      )}

      <div style={S.body}>
        {/* Task Sidebar */}
        <div style={S.sidebar}>
          <div style={S.sidebarTitle}>משימות לתזמון</div>
          <div style={S.sidebarSub}>גרור משימה לחלון פנוי</div>
          {loading ? (
            <div style={S.sidebarLoading}>טוען...</div>
          ) : unscheduled.length === 0 ? (
            <div style={S.sidebarEmpty}>כל המשימות מתוזמנות 🎉</div>
          ) : (
            <div ref={sidebarRef} style={S.taskList}>
              {unscheduled.map(task => {
                const numId = parseInt(task.id.replace('a:', ''))
                const color = categoryColor(task.category_name, task.category_id)
                return (
                  <div
                    key={task.id}
                    className="fc-draggable-task"
                    data-task-id={String(numId)}
                    data-task-title={task.title}
                    style={{ ...S.taskCard, borderInlineStart: `3px solid #${color.replace('#', '')}` }}
                  >
                    <div style={S.taskTitle}>{task.title}</div>
                    <div style={S.taskMeta}>
                      <span style={{ ...S.taskChip, background: color + '22', color }}>
                        {task.category_name}
                      </span>
                      {task.due_at && (
                        <span style={S.taskDue}>
                          עד {new Date(task.due_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Calendar */}
        <div style={S.calendarWrap}>
          <FullCalendar
            ref={calendarRef}
            plugins={[timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            locale={heLocale}
            direction="rtl"
            headerToolbar={{
              right: 'prev,next today',
              center: 'title',
              left: 'timeGridWeek,timeGridDay',
            }}
            buttonText={{ today: 'היום', week: 'שבוע', day: 'יום' }}
            slotMinTime="07:00:00"
            slotMaxTime="23:00:00"
            snapDuration="00:30:00"
            slotDuration="00:30:00"
            allDaySlot={false}
            droppable={true}
            editable={true}
            events={calendarEvents}
            eventReceive={handleEventReceive}
            eventChange={handleEventChange}
            eventClick={handleEventClick}
            datesSet={(info) => loadGcalEvents(info.start, info.end)}
            height="calc(100vh - 120px)"
            eventContent={(arg) => {
              const isGcal = arg.event.extendedProps.source === 'gcal'
              return (
                <div style={{ padding: '2px 4px', overflow: 'hidden', height: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden' }}>
                    {isGcal && <span style={{ fontSize: 9, opacity: 0.85, flexShrink: 0 }}>🔒</span>}
                    <div style={{
                      fontWeight: 600,
                      fontSize: 12,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {arg.event.title}
                    </div>
                  </div>
                  {!isGcal && arg.event.extendedProps.categoryName && (
                    <div style={{ fontSize: 10, opacity: 0.85 }}>{arg.event.extendedProps.categoryName}</div>
                  )}
                  {isGcal && arg.event.extendedProps.calendarName && (
                    <div style={{ fontSize: 10, opacity: 0.75 }}>{arg.event.extendedProps.calendarName}</div>
                  )}
                </div>
              )
            }}
          />
        </div>
      </div>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#f8f9fa',
    fontFamily: "'Assistant', 'Heebo', system-ui, sans-serif",
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    background: '#fff',
    borderBottom: '1px solid #e5e7eb',
    height: 56,
    flexShrink: 0,
  },
  headerLeft: { flex: 1 },
  headerTitle: {
    fontWeight: 700,
    fontSize: 18,
    color: '#111827',
    display: 'flex',
    alignItems: 'center',
  },
  headerRight: { flex: 1, display: 'flex', justifyContent: 'flex-end' },
  backBtn: { color: '#6366f1', textDecoration: 'none', fontSize: 14, fontWeight: 500 },
  userEmail: { fontSize: 12, color: '#9ca3af' },
  errorBanner: {
    background: '#fee2e2',
    color: '#dc2626',
    padding: '10px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 14,
    flexShrink: 0,
  },
  errorClose: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#dc2626',
    fontSize: 16,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    gap: 0,
  },
  sidebar: {
    width: 240,
    background: '#fff',
    borderInlineEnd: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px 12px',
    gap: 8,
    flexShrink: 0,
    overflowY: 'auto',
  },
  sidebarTitle: { fontWeight: 700, fontSize: 15, color: '#111827' },
  sidebarSub: { fontSize: 12, color: '#9ca3af', marginBottom: 4 },
  sidebarLoading: { fontSize: 13, color: '#6b7280', textAlign: 'center', paddingTop: 16 },
  sidebarEmpty: { fontSize: 13, color: '#6b7280', textAlign: 'center', paddingTop: 16 },
  taskList: { display: 'flex', flexDirection: 'column', gap: 8 },
  taskCard: {
    background: '#f9fafb',
    borderRadius: 8,
    padding: '10px 12px',
    cursor: 'grab',
    border: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    userSelect: 'none',
  },
  taskTitle: { fontSize: 13, fontWeight: 600, color: '#111827', lineHeight: 1.4 },
  taskMeta: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  taskChip: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 7px',
    borderRadius: 99,
  },
  taskDue: { fontSize: 11, color: '#9ca3af' },
  calendarWrap: {
    flex: 1,
    padding: '12px 16px',
    overflow: 'hidden',
    minWidth: 0,
  },
  popupOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
  },
  popup: {
    position: 'fixed',
    background: '#fff',
    borderRadius: 12,
    padding: '16px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
    border: '1px solid #e5e7eb',
    width: 200,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    zIndex: 1001,
  },
  popupTitle: {
    fontWeight: 600,
    fontSize: 14,
    color: '#111827',
    lineHeight: 1.3,
  },
  popupSub: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 4,
  },
  popupDelete: {
    background: '#fee2e2',
    color: '#dc2626',
    border: 'none',
    borderRadius: 8,
    padding: '8px 0',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
  popupCancel: {
    background: 'none',
    color: '#6b7280',
    border: 'none',
    borderRadius: 8,
    padding: '6px 0',
    fontSize: 12,
    cursor: 'pointer',
    width: '100%',
  },
}
