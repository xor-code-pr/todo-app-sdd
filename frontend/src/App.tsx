import { AddTaskForm } from './components/AddTaskForm/AddTaskForm'
import { LiveRegion } from './components/LiveRegion/LiveRegion'
import { TaskList } from './components/TaskList/TaskList'
import { ThemeControl } from './components/ThemeControl/ThemeControl'
import { useAnnouncer } from './hooks/useAnnouncer'
import { useTasks } from './hooks/useTasks'
import { useTheme } from './hooks/useTheme'
import styles from './App.module.css'

/**
 * Owns the task list and the announcer. No Context and no state library —
 * at this size, passing two props down one level is the whole requirement
 * (Principle V).
 */
export function App() {
  const { tasks, status, loadError, create, setCompleted, remove } = useTasks()
  const { message, announce } = useAnnouncer()
  const { preference, setPreference } = useTheme()

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>TaskFlow</h1>
        <ThemeControl
          preference={preference}
          onChange={setPreference}
          announce={announce}
        />
      </header>

      <main>
        <AddTaskForm onCreate={create} announce={announce} />
        <h2 className={styles.subheading}>Your tasks</h2>
        <TaskList
          tasks={tasks}
          status={status}
          loadError={loadError}
          onSetCompleted={setCompleted}
          onDelete={remove}
          announce={announce}
        />
      </main>

      <LiveRegion message={message} />
    </div>
  )
}
