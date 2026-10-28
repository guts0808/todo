'use strict';

const STORAGE_KEY = 'todo-app.v1';
const FILTERS = ['all', 'active', 'completed'];

const els = {
  today: document.getElementById('today'),
  form: document.getElementById('new-todo-form'),
  title: document.getElementById('new-todo-title'),
  due: document.getElementById('new-todo-due'),
  toolbar: document.getElementById('toolbar'),
  toggleAll: document.getElementById('toggle-all'),
  list: document.getElementById('todo-list'),
  empty: document.getElementById('empty'),
  footer: document.getElementById('footer'),
  count: document.getElementById('count'),
  clearCompleted: document.getElementById('clear-completed'),
  filterLinks: document.querySelectorAll('.filters a'),
};

const state = {
  todos: load(),
  filter: readFilter(),
};

// ---------- 永続化 ----------

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.todos));
  } catch {
    // プライベートモード等で保存できない場合はメモリ上だけで動かす
  }
}

// ---------- 操作 ----------

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function addTodo(title, due) {
  state.todos.push({
    id: newId(),
    title,
    due: due || null,
    completed: false,
    createdAt: Date.now(),
  });
  commit();
}

function updateTodo(id, changes) {
  state.todos = state.todos.map((t) => (t.id === id ? { ...t, ...changes } : t));
  commit();
}

function removeTodo(id) {
  state.todos = state.todos.filter((t) => t.id !== id);
  commit();
}

function setAllCompleted(completed) {
  state.todos = state.todos.map((t) => ({ ...t, completed }));
  commit();
}

function clearCompleted() {
  state.todos = state.todos.filter((t) => !t.completed);
  commit();
}

function commit() {
  save();
  render();
}

// ---------- 日付ヘルパー ----------

function pad(n) {
  return String(n).padStart(2, '0');
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDue(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return y === new Date().getFullYear() ? `${m}/${d}` : `${y}/${m}/${d}`;
}

// ---------- 描画 ----------

function readFilter() {
  const f = location.hash.replace(/^#\/?/, '');
  return FILTERS.includes(f) ? f : 'all';
}

function visibleTodos() {
  switch (state.filter) {
    case 'active':
      return state.todos.filter((t) => !t.completed);
    case 'completed':
      return state.todos.filter((t) => t.completed);
    default:
      return state.todos;
  }
}

function renderItem(todo, today) {
  const li = document.createElement('li');
  li.className = 'todo-item';
  li.dataset.id = todo.id;
  li.classList.toggle('completed', todo.completed);

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.className = 'toggle';
  toggle.checked = todo.completed;
  toggle.setAttribute('aria-label', `「${todo.title}」を完了にする`);

  const body = document.createElement('div');
  body.className = 'body';

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = todo.title;
  body.append(title);

  if (todo.due) {
    const due = document.createElement('span');
    due.className = 'due';
    let label = formatDue(todo.due);
    if (!todo.completed && todo.due < today) {
      due.classList.add('is-overdue');
      label += '（期限切れ）';
    } else if (!todo.completed && todo.due === today) {
      due.classList.add('is-today');
      label = '今日まで';
    }
    due.textContent = label;
    body.append(due);
  }

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'icon-btn edit-btn';
  edit.textContent = '✎';
  edit.setAttribute('aria-label', '編集');
  edit.title = '編集';

  const destroy = document.createElement('button');
  destroy.type = 'button';
  destroy.className = 'icon-btn destroy';
  destroy.textContent = '×';
  destroy.setAttribute('aria-label', '削除');
  destroy.title = '削除';

  li.append(toggle, body, edit, destroy);
  return li;
}

function render() {
  const today = todayISO();
  const todos = visibleTodos();
  const total = state.todos.length;
  const activeCount = state.todos.filter((t) => !t.completed).length;
  const completedCount = total - activeCount;

  els.list.replaceChildren(...todos.map((t) => renderItem(t, today)));

  els.empty.hidden = todos.length > 0;
  els.empty.textContent =
    total === 0 ? 'TODO はまだありません。上の入力欄から追加しましょう。' : '該当する TODO はありません';

  els.toolbar.hidden = total === 0;
  els.toggleAll.checked = total > 0 && activeCount === 0;

  els.footer.hidden = total === 0;
  els.count.textContent = `残り ${activeCount} 件`;
  els.clearCompleted.disabled = completedCount === 0;

  els.filterLinks.forEach((a) => {
    const selected = a.dataset.filter === state.filter;
    a.classList.toggle('selected', selected);
    if (selected) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

// ---------- 編集 ----------

function startEdit(li) {
  const todo = state.todos.find((t) => t.id === li.dataset.id);
  if (!todo || li.classList.contains('editing')) return;

  li.classList.add('editing');
  const input = document.createElement('input');
  input.className = 'edit';
  input.value = todo.title;
  input.maxLength = 200;
  input.setAttribute('aria-label', 'TODO を編集');
  li.querySelector('.body').replaceWith(input);
  li.querySelector('.edit-btn').hidden = true;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  let finished = false;
  const finish = (shouldSave) => {
    if (finished) return;
    finished = true;
    if (!shouldSave) return render();
    const title = input.value.trim();
    if (!title) removeTodo(todo.id);
    else if (title !== todo.title) updateTodo(todo.id, { title });
    else render();
  };

  input.addEventListener('keydown', (e) => {
    // 日本語入力の変換確定の Enter では確定しない
    if (e.key === 'Enter' && !e.isComposing) finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

// ---------- イベント ----------

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = els.title.value.trim();
  if (!title) return;
  addTodo(title, els.due.value);
  els.form.reset();
  els.title.focus();
});

els.list.addEventListener('change', (e) => {
  if (!e.target.matches('.toggle')) return;
  const li = e.target.closest('.todo-item');
  updateTodo(li.dataset.id, { completed: e.target.checked });
});

els.list.addEventListener('click', (e) => {
  const li = e.target.closest('.todo-item');
  if (!li) return;
  if (e.target.closest('.destroy')) removeTodo(li.dataset.id);
  else if (e.target.closest('.edit-btn')) startEdit(li);
});

els.list.addEventListener('dblclick', (e) => {
  if (e.target.closest('.title')) startEdit(e.target.closest('.todo-item'));
});

els.toggleAll.addEventListener('change', (e) => setAllCompleted(e.target.checked));
els.clearCompleted.addEventListener('click', clearCompleted);

window.addEventListener('hashchange', () => {
  state.filter = readFilter();
  render();
});

// 別タブで変更されたら同期する
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return;
  state.todos = load();
  render();
});

els.today.textContent = new Date().toLocaleDateString('ja-JP', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});

render();
