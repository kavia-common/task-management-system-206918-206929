import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';

/**
 * Returns a normalized API base URL (no trailing slash).
 * Prefers REACT_APP_API_BASE, then REACT_APP_BACKEND_URL, then defaults to same-origin.
 */
function getApiBaseUrl() {
  const base =
    process.env.REACT_APP_API_BASE ||
    process.env.REACT_APP_BACKEND_URL ||
    '';

  return (base || '').replace(/\/+$/, '');
}

/**
 * Safely parse JSON if possible, otherwise return null.
 */
async function tryParseJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// PUBLIC_INTERFACE
function App() {
  /** Retro "terminal" theme toggle (purely visual; does not affect API behavior) */
  const [theme, setTheme] = useState('dark');

  const [tasks, setTasks] = useState([]);
  const [newTaskText, setNewTaskText] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingIds, setDeletingIds] = useState(() => new Set());

  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  const tasksUrl = useMemo(() => {
    // If no env provided, use relative /tasks (same-origin / proxy scenario).
    return apiBaseUrl ? `${apiBaseUrl}/tasks` : '/tasks';
  }, [apiBaseUrl]);

  // Apply theme to document element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setTransientStatus = useCallback((msg) => {
    setStatusMessage(msg);
    window.clearTimeout(setTransientStatus._t);
    setTransientStatus._t = window.setTimeout(() => setStatusMessage(''), 2500);
  }, []);
  // eslint-disable-next-line no-underscore-dangle
  setTransientStatus._t = setTransientStatus._t || null;

  const normalizeTask = useCallback((t) => {
    // Backend contract may vary slightly; normalize to { id, description, created_at, completed }
    return {
      id: t?.id,
      description: t?.description ?? t?.text ?? '',
      created_at: t?.created_at ?? t?.createdAt ?? null,
      completed: Boolean(t?.completed ?? t?.isCompleted ?? false),
    };
  }, []);

  const fetchTasks = useCallback(async () => {
    setErrorMessage('');
    setIsLoading(true);

    try {
      const res = await fetch(tasksUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        const body = await tryParseJson(res);
        throw new Error(body?.error || body?.message || `Failed to load tasks (${res.status})`);
      }

      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.tasks || []);
      setTasks(list.map(normalizeTask));
    } catch (err) {
      setErrorMessage(err?.message || 'Failed to load tasks.');
    } finally {
      setIsLoading(false);
    }
  }, [normalizeTask, tasksUrl]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // PUBLIC_INTERFACE
  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setStatusMessage('');

    const trimmed = newTaskText.trim();
    if (!trimmed) {
      setErrorMessage('Task description cannot be empty.');
      return;
    }
    if (trimmed.length > 140) {
      setErrorMessage('Keep it retro: task must be 140 characters or fewer.');
      return;
    }

    setIsAdding(true);
    try {
      const res = await fetch(tasksUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        // Most likely backend expects { description }, but also works if it accepts { text }.
        body: JSON.stringify({ description: trimmed }),
      });

      if (!res.ok) {
        const body = await tryParseJson(res);
        throw new Error(body?.error || body?.message || `Failed to add task (${res.status})`);
      }

      const created = await tryParseJson(res);
      // If backend returns created task, optimistically add; otherwise refetch.
      if (created && (created.id !== undefined || created.task?.id !== undefined)) {
        const t = normalizeTask(created.task || created);
        setTasks((prev) => [t, ...prev]);
      } else {
        await fetchTasks();
      }

      setNewTaskText('');
      setTransientStatus('Task added.');
    } catch (err) {
      setErrorMessage(err?.message || 'Failed to add task.');
    } finally {
      setIsAdding(false);
    }
  };

  const onDelete = async (taskId) => {
    if (taskId === undefined || taskId === null) return;

    setErrorMessage('');
    setStatusMessage('');

    setDeletingIds((prev) => new Set(prev).add(taskId));
    try {
      const res = await fetch(`${tasksUrl}/${encodeURIComponent(taskId)}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        const body = await tryParseJson(res);
        throw new Error(body?.error || body?.message || `Failed to delete task (${res.status})`);
      }

      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setTransientStatus('Task deleted.');
    } catch (err) {
      setErrorMessage(err?.message || 'Failed to delete task.');
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  return (
    <div className="App">
      <div className="retro-bg">
        <header className="retro-header">
          <div className="retro-title-row">
            <div>
              <h1 className="retro-title">RETRO TASK MANAGER</h1>
              <p className="retro-subtitle">
                Add, view, and delete tasks — powered by the backend API.
              </p>
            </div>

            <button
              className="retro-btn retro-btn-secondary"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              type="button"
            >
              {theme === 'dark' ? 'LIGHT MODE' : 'DARK MODE'}
            </button>
          </div>

          <div className="retro-meta">
            <span className="retro-chip">
              API: <span className="retro-mono">{apiBaseUrl || '(same origin)'}</span>
            </span>
            <button
              className="retro-btn retro-btn-ghost"
              type="button"
              onClick={fetchTasks}
              disabled={isLoading}
            >
              {isLoading ? 'SYNCING…' : 'REFRESH'}
            </button>
          </div>
        </header>

        <main className="retro-main" role="main">
          <section className="retro-panel" aria-labelledby="add-task-title">
            <h2 className="retro-panel-title" id="add-task-title">NEW TASK</h2>

            <form className="retro-form" onSubmit={onSubmit}>
              <label className="retro-label" htmlFor="task-input">
                Description
              </label>
              <div className="retro-form-row">
                <input
                  id="task-input"
                  className="retro-input"
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  placeholder="e.g., Beat the high score"
                  maxLength={180}
                  disabled={isAdding}
                />
                <button
                  className="retro-btn retro-btn-primary"
                  type="submit"
                  disabled={isAdding}
                >
                  {isAdding ? 'ADDING…' : 'ADD'}
                </button>
              </div>
              <div className="retro-help">
                Tip: press <span className="retro-kbd">Enter</span> to add.
              </div>
            </form>

            {(errorMessage || statusMessage) && (
              <div className="retro-messages" aria-live="polite">
                {errorMessage && (
                  <div className="retro-alert retro-alert-error">
                    <span className="retro-alert-label">ERROR</span>
                    <span>{errorMessage}</span>
                  </div>
                )}
                {statusMessage && (
                  <div className="retro-alert retro-alert-success">
                    <span className="retro-alert-label">OK</span>
                    <span>{statusMessage}</span>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="retro-panel" aria-labelledby="tasks-title">
            <div className="retro-panel-header">
              <h2 className="retro-panel-title" id="tasks-title">TASKS</h2>
              <span className="retro-count">
                {tasks.length} {tasks.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            {isLoading ? (
              <div className="retro-loading" role="status" aria-label="Loading tasks">
                <div className="retro-scanline" />
                <div className="retro-loading-text">LOADING TASKS…</div>
              </div>
            ) : tasks.length === 0 ? (
              <div className="retro-empty">
                <div className="retro-empty-title">NO TASKS FOUND</div>
                <div className="retro-empty-desc">Add your first quest above.</div>
              </div>
            ) : (
              <ul className="retro-list" aria-label="Task list">
                {tasks.map((t) => {
                  const isDeleting = deletingIds.has(t.id);
                  return (
                    <li className="retro-list-item" key={t.id ?? `${t.description}-${Math.random()}`}>
                      <div className="retro-list-left">
                        <span className="retro-bullet" aria-hidden="true">▣</span>
                        <div className="retro-task-text">
                          <div className="retro-task-desc">{t.description || '(no description)'}</div>
                          <div className="retro-task-meta">
                            ID: <span className="retro-mono">{String(t.id)}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        className="retro-icon-btn"
                        type="button"
                        onClick={() => onDelete(t.id)}
                        disabled={isDeleting}
                        aria-label={`Delete task ${t.description}`}
                        title="Delete"
                      >
                        {isDeleting ? '…' : 'DEL'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </main>

        <footer className="retro-footer">
          <div className="retro-footer-inner">
            <span className="retro-mono">/tasks</span> (GET, POST) · <span className="retro-mono">/tasks/:id</span> (DELETE)
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
