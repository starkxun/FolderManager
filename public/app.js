'use strict';

/* ---------------------------------------------------------------------
 * State
 * ------------------------------------------------------------------- */
const state = {
  currentPath: '',              // relative to the active root, '' = root
  currentRoot: null,            // id of the active root, e.g. 'home', 'var-www'
  roots: [],                    // [{id, label, icon}] — auto-detected at startup, see /api/home
  entries: [],                  // raw entries for currentPath
  history: [],                  // navigation stack of {root, path}
  historyIndex: -1,
  viewMode: localStorage.getItem('fm_viewMode') || 'grid',
  sortKey: localStorage.getItem('fm_sortKey') || 'mtime',
  sortDir: localStorage.getItem('fm_sortDir') || 'desc',
  selectedName: null,
  view: 'files',                 // 'files' | 'dashboard'
};

function currentRootInfo() {
  return state.roots.find((r) => r.id === state.currentRoot) || { id: state.currentRoot, label: '主目录', icon: 'fa-solid fa-house' };
}

/* ---------------------------------------------------------------------
 * DOM refs
 * ------------------------------------------------------------------- */
const el = {
  windowTitle: document.getElementById('windowTitle'),
  breadcrumb: document.getElementById('breadcrumb'),
  btnBack: document.getElementById('btnBack'),
  btnForward: document.getElementById('btnForward'),
  btnUp: document.getElementById('btnUp'),
  searchInput: document.getElementById('searchInput'),
  sortSelect: document.getElementById('sortSelect'),
  btnSortDir: document.getElementById('btnSortDir'),
  btnGridView: document.getElementById('btnGridView'),
  btnListView: document.getElementById('btnListView'),
  favList: document.getElementById('favList'),
  recentList: document.getElementById('recentList'),
  loadingBar: document.getElementById('loadingBar'),
  errorBanner: document.getElementById('errorBanner'),
  gridView: document.getElementById('gridView'),
  listView: document.getElementById('listView'),
  listViewBody: document.getElementById('listViewBody'),
  emptyState: document.getElementById('emptyState'),
  statusbar: document.getElementById('statusbar'),
  toast: document.getElementById('toast'),
  previewOverlay: document.getElementById('previewOverlay'),
  previewIcon: document.getElementById('previewIcon'),
  previewName: document.getElementById('previewName'),
  previewMeta: document.getElementById('previewMeta'),
  previewBody: document.getElementById('previewBody'),
  previewClose: document.getElementById('previewClose'),
  previewCopyPath: document.getElementById('previewCopyPath'),
  previewPrev: document.getElementById('previewPrev'),
  previewNext: document.getElementById('previewNext'),
  btnAppearance: document.getElementById('btnAppearance'),
  appearancePanel: document.getElementById('appearancePanel'),
  bgFileInput: document.getElementById('bgFileInput'),
  btnResetBg: document.getElementById('btnResetBg'),
  hljsLight: document.getElementById('hljsLight'),
  hljsDark: document.getElementById('hljsDark'),
  mdLight: document.getElementById('mdLight'),
  mdDark: document.getElementById('mdDark'),
  toolbar: document.getElementById('toolbar'),
  rootsList: document.getElementById('rootsList'),
  favSection: document.getElementById('favSection'),
  navDashboard: document.getElementById('navDashboard'),
  dashboardView: document.getElementById('dashboardView'),
  dashHostname: document.getElementById('dashHostname'),
  dashPlatform: document.getElementById('dashPlatform'),
  dashUptime: document.getElementById('dashUptime'),
  tileCpuValue: document.getElementById('tileCpuValue'),
  tileCpuSub: document.getElementById('tileCpuSub'),
  tileMemValue: document.getElementById('tileMemValue'),
  tileMemSub: document.getElementById('tileMemSub'),
  tileLoadValue: document.getElementById('tileLoadValue'),
  tileNetValue: document.getElementById('tileNetValue'),
  tileNetSub: document.getElementById('tileNetSub'),
  chartCpuMem: document.getElementById('chartCpuMem'),
  chartNet: document.getElementById('chartNet'),
  netChartCard: document.getElementById('netChartCard'),
  diskList: document.getElementById('diskList'),
  contextMenu: document.getElementById('contextMenu'),
  content: document.getElementById('content'),
  loginOverlay: document.getElementById('loginOverlay'),
  loginForm: document.getElementById('loginForm'),
  loginUsername: document.getElementById('loginUsername'),
  loginPassword: document.getElementById('loginPassword'),
  loginError: document.getElementById('loginError'),
  loginSubmit: document.getElementById('loginSubmit'),
  btnLogout: document.getElementById('btnLogout'),
};

/* ---------------------------------------------------------------------
 * File type -> icon / kind label
 * ------------------------------------------------------------------- */
const EXT_MAP = {
  '.js': ['fa-brands fa-js', '#f7c948', 'JavaScript 文件'],
  '.mjs': ['fa-brands fa-js', '#f7c948', 'JavaScript 文件'],
  '.cjs': ['fa-brands fa-js', '#f7c948', 'JavaScript 文件'],
  '.jsx': ['fa-brands fa-react', '#61dafb', 'React 文件'],
  '.ts': ['fa-solid fa-file-code', '#3178c6', 'TypeScript 文件'],
  '.tsx': ['fa-brands fa-react', '#3178c6', 'React 文件'],
  '.py': ['fa-brands fa-python', '#4b8bbe', 'Python 文件'],
  '.java': ['fa-brands fa-java', '#e76f00', 'Java 文件'],
  '.go': ['fa-solid fa-file-code', '#00add8', 'Go 文件'],
  '.rs': ['fa-brands fa-rust', '#dea584', 'Rust 文件'],
  '.php': ['fa-brands fa-php', '#777bb4', 'PHP 文件'],
  '.rb': ['fa-solid fa-gem', '#cc342d', 'Ruby 文件'],
  '.c': ['fa-solid fa-file-code', '#6d9dc5', 'C 文件'],
  '.cpp': ['fa-solid fa-file-code', '#6d9dc5', 'C++ 文件'],
  '.h': ['fa-solid fa-file-code', '#6d9dc5', '头文件'],
  '.html': ['fa-brands fa-html5', '#e34c26', 'HTML 文件'],
  '.htm': ['fa-brands fa-html5', '#e34c26', 'HTML 文件'],
  '.css': ['fa-brands fa-css3-alt', '#2965f1', 'CSS 文件'],
  '.scss': ['fa-brands fa-sass', '#cf649a', 'Sass 文件'],
  '.less': ['fa-brands fa-css3-alt', '#2965f1', 'LESS 文件'],
  '.json': ['fa-solid fa-file-code', '#8a8a8a', 'JSON 文件'],
  '.md': ['fa-brands fa-markdown', '#8a8a8a', 'Markdown 文件'],
  '.markdown': ['fa-brands fa-markdown', '#8a8a8a', 'Markdown 文件'],
  '.yml': ['fa-solid fa-file-code', '#8a8a8a', 'YAML 文件'],
  '.yaml': ['fa-solid fa-file-code', '#8a8a8a', 'YAML 文件'],
  '.xml': ['fa-solid fa-file-code', '#8a8a8a', 'XML 文件'],
  '.sh': ['fa-solid fa-terminal', '#4caf50', 'Shell 脚本'],
  '.bash': ['fa-solid fa-terminal', '#4caf50', 'Shell 脚本'],
  '.zsh': ['fa-solid fa-terminal', '#4caf50', 'Shell 脚本'],
  '.sql': ['fa-solid fa-database', '#00758f', 'SQL 文件'],
  '.png': ['fa-regular fa-file-image', '#a06cd5', '图片'],
  '.jpg': ['fa-regular fa-file-image', '#a06cd5', '图片'],
  '.jpeg': ['fa-regular fa-file-image', '#a06cd5', '图片'],
  '.gif': ['fa-regular fa-file-image', '#a06cd5', '图片'],
  '.webp': ['fa-regular fa-file-image', '#a06cd5', '图片'],
  '.bmp': ['fa-regular fa-file-image', '#a06cd5', '图片'],
  '.svg': ['fa-regular fa-file-image', '#a06cd5', '矢量图片'],
  '.ico': ['fa-regular fa-file-image', '#a06cd5', '图标文件'],
  '.mp4': ['fa-regular fa-file-video', '#e0507a', '视频'],
  '.mov': ['fa-regular fa-file-video', '#e0507a', '视频'],
  '.mkv': ['fa-regular fa-file-video', '#e0507a', '视频'],
  '.avi': ['fa-regular fa-file-video', '#e0507a', '视频'],
  '.mp3': ['fa-regular fa-file-audio', '#e0507a', '音频'],
  '.wav': ['fa-regular fa-file-audio', '#e0507a', '音频'],
  '.flac': ['fa-regular fa-file-audio', '#e0507a', '音频'],
  '.pdf': ['fa-regular fa-file-pdf', '#ff453a', 'PDF 文档'],
  '.zip': ['fa-regular fa-file-zipper', '#8a8a8a', '压缩包'],
  '.tar': ['fa-regular fa-file-zipper', '#8a8a8a', '压缩包'],
  '.gz': ['fa-regular fa-file-zipper', '#8a8a8a', '压缩包'],
  '.rar': ['fa-regular fa-file-zipper', '#8a8a8a', '压缩包'],
  '.7z': ['fa-regular fa-file-zipper', '#8a8a8a', '压缩包'],
  '.doc': ['fa-regular fa-file-word', '#2b579a', 'Word 文档'],
  '.docx': ['fa-regular fa-file-word', '#2b579a', 'Word 文档'],
  '.xls': ['fa-regular fa-file-excel', '#217346', 'Excel 表格'],
  '.xlsx': ['fa-regular fa-file-excel', '#217346', 'Excel 表格'],
  '.csv': ['fa-regular fa-file-excel', '#217346', 'CSV 表格'],
  '.ppt': ['fa-regular fa-file-powerpoint', '#d24726', 'PowerPoint 文档'],
  '.pptx': ['fa-regular fa-file-powerpoint', '#d24726', 'PowerPoint 文档'],
  '.txt': ['fa-regular fa-file-lines', '#8a8a8a', '文本文件'],
  '.log': ['fa-regular fa-file-lines', '#8a8a8a', '日志文件'],
  '.lock': ['fa-solid fa-lock', '#8a8a8a', '锁文件'],
  '.env': ['fa-solid fa-gear', '#8a8a8a', '环境变量文件'],
};

const NAME_MAP = {
  '.gitignore': ['fa-brands fa-git-alt', '#f34f29', 'Git 配置'],
  '.gitattributes': ['fa-brands fa-git-alt', '#f34f29', 'Git 配置'],
  '.git': ['fa-brands fa-git-alt', '#f34f29', 'Git 仓库数据'],
  'package.json': ['fa-brands fa-npm', '#cb3837', 'NPM 配置'],
  'dockerfile': ['fa-brands fa-docker', '#2496ed', 'Docker 配置'],
  'license': ['fa-solid fa-scale-balanced', '#8a8a8a', '许可证'],
  'readme.md': ['fa-brands fa-markdown', '#8a8a8a', 'Markdown 文件'],
};

// Images and PDFs are previewed by pointing <img>/<iframe> straight at the
// raw file bytes (see /api/raw), not by reading them as text.
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico']);
const PDF_EXT = new Set(['.pdf']);

// Extensions with no useful in-browser preview at all — video/audio,
// archives and office docs. Everything else (code, config, markdown,
// no-extension files like Dockerfile/LICENSE, plus images/PDF above) is
// attempted, and for the text path the server double-checks with binary
// sniffing before returning content.
const UNSUPPORTED_EXT = new Set([
  '.mp4', '.mov', '.mkv', '.avi', '.mp3', '.wav', '.flac',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
]);

const EXT_TO_LANG = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.py': 'python', '.java': 'java', '.go': 'go', '.rs': 'rust', '.php': 'php', '.rb': 'ruby',
  '.c': 'c', '.cpp': 'cpp', '.h': 'cpp',
  '.html': 'xml', '.htm': 'xml', '.xml': 'xml',
  '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.json': 'json', '.yml': 'yaml', '.yaml': 'yaml',
  '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
  '.sql': 'sql', '.md': 'markdown', '.markdown': 'markdown',
};

const NAME_TO_LANG = {
  'dockerfile': 'dockerfile',
  'makefile': 'makefile',
  '.gitignore': 'plaintext',
  '.gitattributes': 'plaintext',
};

function extOf(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

function langFor(name) {
  const lower = name.toLowerCase();
  return NAME_TO_LANG[lower] || EXT_TO_LANG[extOf(name)] || 'plaintext';
}

function isPreviewCandidate(entry) {
  return !entry.isDir && !entry.error && !UNSUPPORTED_EXT.has(extOf(entry.name));
}

function rawFileUrl(relPath) {
  return `/api/raw?root=${encodeURIComponent(state.currentRoot)}&path=${encodeURIComponent(relPath)}`;
}

function joinPath(base, name) {
  return base ? `${base}/${name}` : name;
}

function iconInfoFor(entry) {
  if (entry.isDir) {
    return { icon: 'fa-solid fa-folder', color: 'var(--folder-color)', kind: '文件夹' };
  }
  const lowerName = entry.name.toLowerCase();
  if (NAME_MAP[lowerName]) {
    const [icon, color, kind] = NAME_MAP[lowerName];
    return { icon, color, kind };
  }
  const dot = entry.name.lastIndexOf('.');
  const ext = dot > 0 ? entry.name.slice(dot).toLowerCase() : '';
  if (EXT_MAP[ext]) {
    const [icon, color, kind] = EXT_MAP[ext];
    return { icon, color, kind };
  }
  return { icon: 'fa-regular fa-file', color: 'var(--text-secondary)', kind: ext ? `${ext.slice(1).toUpperCase()} 文件` : '文件' };
}

/* ---------------------------------------------------------------------
 * Formatting helpers
 * ------------------------------------------------------------------- */
function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '--';
  if (bytes === 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val < 10 && i > 0 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

const rtf = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });

function formatRelative(ms) {
  if (!ms) return '未知';
  const diffSec = Math.round((ms - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return '刚刚';
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour');
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, 'day');
  const diffMonth = Math.round(diffDay / 30);
  if (Math.abs(diffMonth) < 12) return rtf.format(diffMonth, 'month');
  const diffYear = Math.round(diffDay / 365);
  return rtf.format(diffYear, 'year');
}

function formatAbsolute(ms) {
  if (!ms) return '未知时间';
  return new Date(ms).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/* ---------------------------------------------------------------------
 * API
 * ------------------------------------------------------------------- */
// A session can expire (or get revoked) while the app is open, not just on
// initial load. Every data call goes through this so a stray 401 always
// surfaces the login screen instead of a confusing "无法打开该文件夹" error.
async function apiFetch(url, opts) {
  const res = await fetch(url, opts);
  if (res.status === 401) {
    showLogin();
    throw new Error('未登录');
  }
  return res;
}

async function fetchListing(relPath, rootId = state.currentRoot) {
  const res = await apiFetch(`/api/list?root=${encodeURIComponent(rootId)}&path=${encodeURIComponent(relPath)}`);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || `请求失败 (${res.status})`);
    throw err;
  }
  return data;
}

/* ---------------------------------------------------------------------
 * Toast
 * ------------------------------------------------------------------- */
let toastTimer = null;
function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 1800);
}

/* ---------------------------------------------------------------------
 * Remember where we were, so a page refresh doesn't dump the user back
 * at the root every time.
 * ------------------------------------------------------------------- */
const LAST_LOCATION_KEY = 'fm_last_location';

function saveLastLocation() {
  try {
    localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({ root: state.currentRoot, path: state.currentPath }));
  } catch {
    /* localStorage full/unavailable — losing "resume where I left off" isn't worth failing navigation over */
  }
}

function loadLastLocation() {
  try {
    const raw = localStorage.getItem(LAST_LOCATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------
 * Navigation
 * ------------------------------------------------------------------- */
// `silent` skips the error banner and leaves state untouched on failure —
// used only for the on-load "restore last folder" attempt, where a stale
// saved path (deleted folder, unmounted drive) should quietly fall back to
// the root instead of greeting the user with an error the moment the app
// opens. Returns whether navigation succeeded.
async function navigate(relPath, { pushHistory = true, root = state.currentRoot, silent = false } = {}) {
  showFiles();
  el.loadingBar.classList.remove('hidden');
  if (!silent) el.errorBanner.classList.add('hidden');
  try {
    const data = await fetchListing(relPath, root);
    state.currentRoot = root;
    state.currentPath = data.path;
    state.entries = data.entries;
    state.selectedName = null;

    if (pushHistory) {
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push({ root: state.currentRoot, path: state.currentPath });
      state.historyIndex = state.history.length - 1;
    }

    saveLastLocation();
    renderAll();
    if (state.currentPath === '') refreshSidebar(); // keep sidebar in sync with fresh mtimes
    return true;
  } catch (e) {
    if (!silent) {
      el.errorBanner.textContent = `无法打开该文件夹：${e.message}`;
      el.errorBanner.classList.remove('hidden');
      el.gridView.innerHTML = '';
      el.listViewBody.innerHTML = '';
      el.emptyState.classList.add('hidden');
    }
    return false;
  } finally {
    el.loadingBar.classList.add('hidden');
  }
}

function switchRoot(rootId) {
  if (rootId === state.currentRoot) { navigate(''); return; }
  navigate('', { root: rootId });
}

function goBack() {
  if (state.historyIndex <= 0) return;
  state.historyIndex--;
  const entry = state.history[state.historyIndex];
  navigate(entry.path, { pushHistory: false, root: entry.root });
}
function goForward() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex++;
  const entry = state.history[state.historyIndex];
  navigate(entry.path, { pushHistory: false, root: entry.root });
}
function goUp() {
  if (state.view !== 'files' || !state.currentPath) return;
  const parts = state.currentPath.split('/');
  parts.pop();
  navigate(parts.join('/'));
}

/* ---------------------------------------------------------------------
 * Sidebar
 * ------------------------------------------------------------------- */
// Well-known subfolder names worth surfacing as favorites, checked against
// whatever root is currently active. Mostly meaningful for a home-directory
// root (Desktop/Documents/...); for a server root like /var/www these
// usually just won't match anything, and the whole section hides itself.
const FAVORITE_CANDIDATES = [
  { match: 'desktop', label: '桌面', icon: 'fa-solid fa-desktop' },
  { match: 'documents', label: '文稿', icon: 'fa-solid fa-file-lines' },
  { match: 'downloads', label: '下载', icon: 'fa-solid fa-download' },
  { match: 'pictures', label: '图片', icon: 'fa-solid fa-image' },
  { match: 'projects', label: '项目', icon: 'fa-solid fa-diagram-project' },
];

function renderRootsList() {
  el.rootsList.innerHTML = '';
  for (const r of state.roots) {
    const li = document.createElement('li');
    li.className = 'sidebar-item';
    li.dataset.rootId = r.id;
    li.title = r.label;
    li.innerHTML = `<i class="${r.icon}"></i><span>${escapeHtml(r.label)}</span>`;
    li.addEventListener('click', () => switchRoot(r.id));
    el.rootsList.appendChild(li);
  }
}

async function refreshSidebar() {
  try {
    const data = await fetchListing('');
    const dirs = data.entries.filter((e) => e.isDir && !e.error);
    const dirByLower = new Map(dirs.map((d) => [d.name.toLowerCase(), d]));

    // Favorites: well-known folders that actually exist under the active root
    el.favList.innerHTML = '';
    for (const fav of FAVORITE_CANDIDATES) {
      const found = dirByLower.get(fav.match);
      if (found) el.favList.appendChild(buildSidebarItem(fav.label, fav.icon, found.name));
    }
    el.favSection.classList.toggle('hidden', el.favList.children.length === 0);

    // Recent: top-level folders sorted by most recently modified
    const recent = [...dirs].filter((d) => !d.hidden).sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0)).slice(0, 12);
    el.recentList.innerHTML = '';
    if (recent.length === 0) {
      const li = document.createElement('li');
      li.className = 'sidebar-item';
      li.style.color = 'var(--text-secondary)';
      li.textContent = '暂无文件夹';
      el.recentList.appendChild(li);
    }
    for (const d of recent) {
      const item = buildSidebarItem(d.name, 'fa-solid fa-folder', d.name);
      const meta = document.createElement('span');
      meta.className = 'item-meta';
      meta.textContent = formatRelative(d.mtimeMs);
      item.appendChild(meta);
      el.recentList.appendChild(item);
    }

    highlightSidebar();
  } catch (e) {
    // Sidebar is a convenience layer; silently ignore failures here since
    // the main content area already surfaces errors.
  }
}

function buildSidebarItem(label, icon, targetPath) {
  const li = document.createElement('li');
  li.className = 'sidebar-item';
  li.dataset.path = targetPath;
  li.dataset.root = state.currentRoot;
  li.title = label;
  li.innerHTML = `<i class="${icon}"></i><span>${escapeHtml(label)}</span>`;
  li.addEventListener('click', () => navigate(targetPath));
  return li;
}

function highlightSidebar() {
  const inFiles = state.view === 'files';
  document.querySelectorAll('#favList .sidebar-item, #recentList .sidebar-item').forEach((item) => {
    item.classList.toggle('active', inFiles && item.dataset.path === state.currentPath && item.dataset.root === state.currentRoot);
  });
  document.querySelectorAll('#rootsList .sidebar-item').forEach((item) => {
    item.classList.toggle('active', inFiles && item.dataset.rootId === state.currentRoot && state.currentPath === '');
  });
  el.navDashboard.classList.toggle('active', state.view === 'dashboard');
}

/* ---------------------------------------------------------------------
 * Breadcrumb
 * ------------------------------------------------------------------- */
function renderBreadcrumb() {
  el.breadcrumb.innerHTML = '';
  const root = currentRootInfo();
  const homeCrumb = document.createElement('span');
  homeCrumb.className = 'crumb' + (state.currentPath === '' ? ' current' : '');
  homeCrumb.innerHTML = `<i class="${root.icon}"></i> ${escapeHtml(root.label)}`;
  homeCrumb.addEventListener('click', () => navigate(''));
  el.breadcrumb.appendChild(homeCrumb);

  if (!state.currentPath) return;
  const parts = state.currentPath.split('/');
  let acc = '';
  parts.forEach((part, idx) => {
    acc = acc ? `${acc}/${part}` : part;
    const sep = document.createElement('span');
    sep.className = 'crumb-sep';
    sep.textContent = '›';
    el.breadcrumb.appendChild(sep);

    const crumb = document.createElement('span');
    const isLast = idx === parts.length - 1;
    crumb.className = 'crumb' + (isLast ? ' current' : '');
    crumb.textContent = part;
    const target = acc;
    if (!isLast) crumb.addEventListener('click', () => navigate(target));
    el.breadcrumb.appendChild(crumb);
  });
}

/* ---------------------------------------------------------------------
 * Sort + filter
 * ------------------------------------------------------------------- */
function getVisibleEntries() {
  const q = el.searchInput.value.trim().toLowerCase();
  let list = state.entries;
  if (q) list = list.filter((e) => e.name.toLowerCase().includes(q));

  const dir = state.sortDir === 'asc' ? 1 : -1;
  const key = state.sortKey;
  list = [...list].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1; // folders first, always
    if (key === 'name') return a.name.localeCompare(b.name, 'zh-CN', { numeric: true }) * dir;
    if (key === 'size') return ((a.size ?? -1) - (b.size ?? -1)) * dir;
    return ((a.mtimeMs ?? 0) - (b.mtimeMs ?? 0)) * dir;
  });
  return list;
}

/* ---------------------------------------------------------------------
 * Rendering: grid + list
 * ------------------------------------------------------------------- */
function renderAll() {
  renderBreadcrumb();
  highlightSidebar();
  const folderName = state.currentPath === '' ? currentRootInfo().label : state.currentPath.split('/').pop();
  el.windowTitle.textContent = folderName;

  const visible = getVisibleEntries();
  el.emptyState.classList.toggle('hidden', visible.length !== 0);
  el.gridView.classList.toggle('hidden', state.viewMode !== 'grid' || visible.length === 0);
  el.listView.classList.toggle('hidden', state.viewMode !== 'list' || visible.length === 0);

  if (state.viewMode === 'grid') renderGrid(visible);
  else renderList(visible);

  renderStatusbar(visible);
  el.btnBack.disabled = state.historyIndex <= 0;
  el.btnForward.disabled = state.historyIndex >= state.history.length - 1;
}

function renderGrid(visible) {
  el.gridView.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const entry of visible) {
    const { icon, color, kind } = iconInfoFor(entry);
    const tile = document.createElement('div');
    tile.dataset.name = entry.name;
    tile.className = 'tile' + (entry.error ? ' inaccessible' : '') + (entry.name === state.selectedName ? ' selected' : '');
    tile.title = `${entry.name}\n${kind} · ${formatAbsolute(entry.mtimeMs)}${entry.error ? '\n(无法访问)' : ''}`;
    tile.innerHTML = `
      <div class="tile-icon"><i class="${icon}" style="color:${color}"></i></div>
      <div class="tile-name">${escapeHtml(entry.name)}</div>
      ${isPreviewCandidate(entry) ? '<button class="preview-btn" title="快速查看 (空格)"><i class="fa-regular fa-eye"></i></button>' : ''}
    `;
    attachEntryEvents(tile, entry);
    frag.appendChild(tile);
  }
  el.gridView.appendChild(frag);
}

function renderList(visible) {
  el.listViewBody.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const entry of visible) {
    const { icon, color, kind } = iconInfoFor(entry);
    const tr = document.createElement('tr');
    tr.dataset.name = entry.name;
    tr.className = (entry.error ? 'inaccessible' : '') + (entry.name === state.selectedName ? ' selected' : '');
    tr.innerHTML = `
      <td class="name-cell">
        <i class="${icon}" style="color:${color}"></i><span class="name-text">${escapeHtml(entry.name)}</span>
        ${isPreviewCandidate(entry) ? '<button class="preview-btn" title="快速查看 (空格)"><i class="fa-regular fa-eye"></i></button>' : ''}
      </td>
      <td class="col-date" title="${formatAbsolute(entry.mtimeMs)}">${formatRelative(entry.mtimeMs)}</td>
      <td class="col-size">${entry.isDir ? '--' : formatBytes(entry.size)}</td>
      <td class="col-kind">${kind}</td>
    `;
    attachEntryEvents(tr, entry);
    frag.appendChild(tr);
  }
  el.listViewBody.appendChild(frag);
}

// Selecting an entry must NOT tear down and rebuild the grid/list DOM.
// Double-click detection relies on the browser seeing the same node across
// both clicks; replacing it mid-gesture (e.g. via a full renderAll()) makes
// dblclick fail intermittently depending on click timing. So selection only
// toggles a class on the existing nodes.
function selectEntry(name) {
  state.selectedName = name;
  applySelectionHighlight();
}

function applySelectionHighlight() {
  document.querySelectorAll('.tile, .list-view tbody tr').forEach((node) => {
    node.classList.toggle('selected', node.dataset.name === state.selectedName);
  });
}

function attachEntryEvents(node, entry) {
  node.addEventListener('click', (e) => {
    if (e.target.closest('.preview-btn')) return; // handled separately below
    selectEntry(entry.name);
  });
  node.addEventListener('dblclick', () => {
    if (entry.error) return;
    if (entry.isDir) {
      navigate(joinPath(state.currentPath, entry.name));
    } else if (isPreviewCandidate(entry)) {
      openPreview(entry);
    } else {
      copyPathToClipboard(entry);
    }
  });
  const previewBtn = node.querySelector('.preview-btn');
  if (previewBtn) {
    previewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectEntry(entry.name);
      openPreview(entry);
    });
  }
  node.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (entry.error) return;
    selectEntry(entry.name);
    openContextMenu(e.clientX, e.clientY, entry);
  });
}

function nodeForEntry(name) {
  return document.querySelector(`.tile[data-name="${CSS.escape(name)}"], .list-view tbody tr[data-name="${CSS.escape(name)}"]`);
}

function copyPathToClipboard(entry) {
  // For the home root the classic "~/" reads better; the other auto-detected
  // roots already have their absolute path as their label (see server.js),
  // so prefixing with that gives a real, unambiguous path either way.
  const prefix = state.currentRoot === 'home' ? '~' : currentRootInfo().label;
  const text = `${prefix}/${joinPath(state.currentPath, entry.name)}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => showToast(`已复制路径：${text}`),
      () => showToast('复制失败，请手动复制路径')
    );
  } else {
    showToast(text);
  }
}

/* ---------------------------------------------------------------------
 * Right-click context menu (download / rename / copy path) — styled and
 * behaves like Finder's: solid-highlight items, dismiss on outside click
 * or Escape, no icons.
 * ------------------------------------------------------------------- */
let contextMenuItems = [];

function buildContextMenuItems(entry) {
  const items = [];
  if (entry.isDir) {
    items.push({ label: '打开', action: () => navigate(joinPath(state.currentPath, entry.name)) });
    items.push({ sep: true });
  } else if (isPreviewCandidate(entry)) {
    items.push({ label: '快速查看', action: () => openPreview(entry) });
    items.push({ sep: true });
  }
  items.push({ label: entry.isDir ? '下载（压缩为 zip）' : '下载', action: () => downloadEntry(entry) });
  items.push({ label: '重命名', action: () => startRename(entry) });
  items.push({ label: '复制路径', action: () => copyPathToClipboard(entry) });
  return items;
}

function openContextMenu(x, y, entry) {
  contextMenuItems = buildContextMenuItems(entry);
  el.contextMenu.innerHTML = '';
  contextMenuItems.forEach((item, i) => {
    if (item.sep) {
      el.contextMenu.appendChild(Object.assign(document.createElement('li'), { className: 'context-menu-sep' }));
      return;
    }
    const li = document.createElement('li');
    li.className = 'context-menu-item';
    li.textContent = item.label;
    li.dataset.index = String(i);
    el.contextMenu.appendChild(li);
  });

  el.contextMenu.classList.remove('hidden');
  el.contextMenu.style.left = '0px';
  el.contextMenu.style.top = '0px';
  const rect = el.contextMenu.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 8;
  const maxY = window.innerHeight - rect.height - 8;
  el.contextMenu.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
  el.contextMenu.style.top = `${Math.max(8, Math.min(y, maxY))}px`;

  document.addEventListener('mousedown', handleContextMenuOutsideMouseDown, true);
  document.addEventListener('keydown', handleContextMenuKeydown, true);
  el.content.addEventListener('scroll', closeContextMenu, { once: true });
}

function closeContextMenu() {
  el.contextMenu.classList.add('hidden');
  el.content.removeEventListener('scroll', closeContextMenu);
  document.removeEventListener('mousedown', handleContextMenuOutsideMouseDown, true);
  document.removeEventListener('keydown', handleContextMenuKeydown, true);
}

function handleContextMenuOutsideMouseDown(e) {
  if (!el.contextMenu.contains(e.target)) closeContextMenu();
}
function handleContextMenuKeydown(e) {
  if (e.key === 'Escape') closeContextMenu();
}

el.contextMenu.addEventListener('click', (e) => {
  const li = e.target.closest('.context-menu-item');
  if (!li) return;
  const item = contextMenuItems[Number(li.dataset.index)];
  closeContextMenu();
  if (item) item.action();
});

function downloadEntry(entry) {
  const relPath = joinPath(state.currentPath, entry.name);
  const url = `/api/download?root=${encodeURIComponent(state.currentRoot)}&path=${encodeURIComponent(relPath)}`;
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function renameOnServer(entry, newName) {
  try {
    const res = await apiFetch('/api/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root: state.currentRoot, path: joinPath(state.currentPath, entry.name), newName }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || '重命名失败');
      return false;
    }
    state.selectedName = data.newName;
    await navigate(state.currentPath, { pushHistory: false });
    return true;
  } catch {
    return false; // apiFetch already surfaced a login screen or the error is otherwise unrecoverable here
  }
}

// Swaps the on-screen name label for a text input, Finder-style: the
// "stem" (name minus extension) comes pre-selected so typing immediately
// replaces just that part, exactly like Finder/Explorer rename.
function startRename(entry) {
  const node = nodeForEntry(entry.name);
  if (!node) return;
  const labelEl = node.classList.contains('tile') ? node.querySelector('.tile-name') : node.querySelector('.name-text');
  if (!labelEl) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename-input';
  input.value = entry.name;
  input.spellcheck = false;
  labelEl.replaceWith(input);
  input.focus();

  const dot = entry.name.lastIndexOf('.');
  if (!entry.isDir && dot > 0) input.setSelectionRange(0, dot);
  else input.select();

  let settled = false;
  const restore = () => {
    if (input.isConnected) input.replaceWith(labelEl);
  };
  const cancel = () => {
    if (settled) return;
    settled = true;
    restore();
  };
  const commit = async () => {
    if (settled) return;
    const newName = input.value.trim();
    if (!newName || newName === entry.name) {
      settled = true;
      restore();
      return;
    }
    settled = true;
    input.disabled = true;
    const ok = await renameOnServer(entry, newName);
    if (!ok) restore(); // success re-renders the whole list, replacing this node anyway
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // don't let global shortcuts (space/backspace) fire while typing
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('blur', commit);
}

function renderStatusbar(visible) {
  const dirCount = visible.filter((e) => e.isDir).length;
  const fileCount = visible.length - dirCount;
  const totalSize = visible.filter((e) => !e.isDir && e.size != null).reduce((sum, e) => sum + e.size, 0);
  const parts = [];
  if (dirCount) parts.push(`${dirCount} 个文件夹`);
  if (fileCount) parts.push(`${fileCount} 个文件`);
  if (fileCount) parts.push(`共 ${formatBytes(totalSize)}`);
  el.statusbar.textContent = parts.length ? parts.join('，') : '空文件夹';
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------------------------------------------------------------
 * Quick Look preview (code + markdown)
 * ------------------------------------------------------------------- */
const preview = {
  files: [],   // previewable entries currently on screen, in display order
  index: -1,
};

async function fetchFilePreview(relPath) {
  const res = await apiFetch(`/api/file?root=${encodeURIComponent(state.currentRoot)}&path=${encodeURIComponent(relPath)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

function openPreview(entry) {
  preview.files = getVisibleEntries().filter(isPreviewCandidate);
  preview.index = preview.files.findIndex((e) => e.name === entry.name);
  if (preview.index === -1) { preview.files = [entry]; preview.index = 0; }
  el.previewOverlay.classList.remove('hidden');
  showPreviewAt(preview.index);
}

function closePreview() {
  el.previewOverlay.classList.add('hidden');
  el.previewBody.innerHTML = '';
}

function previewStep(delta) {
  const next = preview.index + delta;
  if (next < 0 || next >= preview.files.length) return;
  showPreviewAt(next);
}

async function showPreviewAt(index) {
  preview.index = index;
  const entry = preview.files[index];
  selectEntry(entry.name);

  el.previewPrev.disabled = index <= 0;
  el.previewNext.disabled = index >= preview.files.length - 1;

  const { icon, color, kind } = iconInfoFor(entry);
  el.previewIcon.className = icon;
  el.previewIcon.style.color = color;
  el.previewName.textContent = entry.name;

  const relPath = joinPath(state.currentPath, entry.name);
  const ext = extOf(entry.name);
  const requestToken = (preview.token = Symbol());

  // Images and PDFs already have size/mtime from the directory listing —
  // no need to round-trip through /api/file, just point the element at the
  // raw bytes.
  if (IMAGE_EXT.has(ext)) {
    el.previewMeta.textContent = `${kind} · ${formatBytes(entry.size)} · 修改于 ${formatAbsolute(entry.mtimeMs)}`;
    renderImagePreview(relPath, entry.name);
    return;
  }
  if (PDF_EXT.has(ext)) {
    el.previewMeta.textContent = `${kind} · ${formatBytes(entry.size)} · 修改于 ${formatAbsolute(entry.mtimeMs)}`;
    renderPdfPreview(relPath);
    return;
  }

  el.previewMeta.textContent = `${kind} · 加载中…`;
  el.previewBody.innerHTML = '<div class="preview-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> 正在加载预览…</div>';

  try {
    const data = await fetchFilePreview(relPath);
    if (preview.token !== requestToken) return; // a newer preview request superseded this one
    el.previewMeta.textContent = `${kind} · ${formatBytes(data.size)} · 修改于 ${formatAbsolute(data.mtimeMs)}`;
    renderPreviewContent(data, entry);
  } catch (e) {
    if (preview.token !== requestToken) return;
    el.previewMeta.textContent = kind;
    renderPreviewFallback('fa-solid fa-triangle-exclamation', `加载失败：${e.message}`);
  }
}

function renderImagePreview(relPath, name) {
  el.previewBody.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'preview-image-wrap';
  const img = document.createElement('img');
  img.className = 'preview-image';
  img.alt = name;
  img.src = rawFileUrl(relPath);
  img.addEventListener('error', () => renderPreviewFallback('fa-regular fa-image', '图片加载失败'), { once: true });
  wrap.appendChild(img);
  el.previewBody.appendChild(wrap);
}

function renderPdfPreview(relPath) {
  el.previewBody.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.className = 'preview-pdf-frame';
  iframe.title = 'PDF 预览';
  iframe.src = rawFileUrl(relPath);
  el.previewBody.appendChild(iframe);
}

function renderPreviewContent(data, entry) {
  if (data.tooLarge) {
    renderPreviewFallback('fa-regular fa-file', '文件过大，无法预览', `大小 ${formatBytes(data.size)}，超出预览上限`);
    return;
  }
  if (data.binary) {
    renderPreviewFallback('fa-regular fa-file-code', '该文件类型暂不支持预览');
    return;
  }
  if (data.content === '') {
    renderPreviewFallback('fa-regular fa-file', '（空文件）');
    return;
  }

  const ext = extOf(entry.name);
  if (ext === '.md' || ext === '.markdown') {
    const rawHtml = marked.parse(data.content);
    const cleanHtml = DOMPurify.sanitize(rawHtml);
    el.previewBody.innerHTML = `<article class="markdown-body">${cleanHtml}</article>`;
    el.previewBody.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
    return;
  }

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.className = `language-${langFor(entry.name)}`;
  code.textContent = data.content; // textContent, never innerHTML — this is untrusted file content
  pre.appendChild(code);
  el.previewBody.innerHTML = '';
  el.previewBody.appendChild(pre);
  hljs.highlightElement(code);
}

function renderPreviewFallback(iconClass, message, hint) {
  el.previewBody.innerHTML = `
    <div class="preview-fallback">
      <i class="${iconClass}"></i>
      <p>${escapeHtml(message)}</p>
      ${hint ? `<p class="fallback-hint">${escapeHtml(hint)}</p>` : ''}
    </div>
  `;
}

el.previewClose.addEventListener('click', closePreview);
el.previewOverlay.addEventListener('click', (e) => {
  if (e.target === el.previewOverlay) closePreview();
});
el.previewPrev.addEventListener('click', () => previewStep(-1));
el.previewNext.addEventListener('click', () => previewStep(1));
el.previewCopyPath.addEventListener('click', () => {
  const entry = preview.files[preview.index];
  if (entry) copyPathToClipboard(entry);
});

/* ---------------------------------------------------------------------
 * Appearance: theme (auto / light / glass) + custom desktop background
 * ------------------------------------------------------------------- */
const THEME_KEY = 'fm_theme';
const BG_KEY = 'fm_bg_image';
const MAX_BG_DIMENSION = 1920; // downscale before storing so localStorage doesn't choke on phone-camera photos

const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function effectiveColorScheme(theme) {
  if (theme === 'light' || theme === 'glass') return 'light';
  return systemDarkQuery.matches ? 'dark' : 'light';
}

// The hljs/markdown theme CSS only has OS-level dark-mode awareness built
// in (media queries can't see our data-theme attribute), so app.js decides
// which pair of stylesheets is active instead.
function applyHljsTheme(theme) {
  const scheme = effectiveColorScheme(theme);
  el.hljsLight.disabled = scheme !== 'light';
  el.hljsDark.disabled = scheme !== 'dark';
  el.mdLight.disabled = scheme !== 'light';
  el.mdDark.disabled = scheme !== 'dark';
}

function applyTheme(theme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;

  applyHljsTheme(theme);
  document.querySelectorAll('.theme-option').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.themeChoice === theme);
  });
}

function getCurrentTheme() {
  return localStorage.getItem(THEME_KEY) || 'auto';
}

systemDarkQuery.addEventListener('change', () => {
  if (getCurrentTheme() === 'auto') applyHljsTheme('auto');
});

function closeAppearancePanel() {
  el.appearancePanel.classList.add('hidden');
}

function applyStoredBackground() {
  const saved = localStorage.getItem(BG_KEY);
  if (saved) document.body.style.backgroundImage = `url("${saved}")`;
}

function handleBgFileSelected() {
  const file = el.bgFileInput.files[0];
  el.bgFileInput.value = ''; // allow re-selecting the same file later
  if (!file) return;

  const reader = new FileReader();
  reader.onerror = () => showToast('读取图片失败');
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => showToast('图片加载失败');
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_BG_DIMENSION || height > MAX_BG_DIMENSION) {
        const scale = MAX_BG_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      try {
        localStorage.setItem(BG_KEY, dataUrl);
        document.body.style.backgroundImage = `url("${dataUrl}")`;
        showToast('背景已更新');
      } catch {
        showToast('图片过大，无法保存为背景');
      }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function initAppearance() {
  applyTheme(getCurrentTheme());
  applyStoredBackground();

  document.querySelectorAll('.theme-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.themeChoice;
      localStorage.setItem(THEME_KEY, theme);
      applyTheme(theme);
    });
  });

  el.btnAppearance.addEventListener('click', (e) => {
    e.stopPropagation();
    el.appearancePanel.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (el.appearancePanel.classList.contains('hidden')) return;
    if (el.appearancePanel.contains(e.target) || el.btnAppearance.contains(e.target)) return;
    closeAppearancePanel();
  });

  el.bgFileInput.addEventListener('change', handleBgFileSelected);
  el.btnResetBg.addEventListener('click', () => {
    localStorage.removeItem(BG_KEY);
    document.body.style.backgroundImage = '';
    showToast('已恢复默认背景');
  });
}

/* ---------------------------------------------------------------------
 * Login
 *
 * Only relevant when the server has FM_USER/FM_PASS set — /api/session
 * tells us that up front. When it's not set, none of this ever shows and
 * the app behaves exactly like before (zero-friction local use).
 * ------------------------------------------------------------------- */
async function checkSession() {
  try {
    const res = await fetch('/api/session');
    return await res.json();
  } catch {
    // Can't reach the server at all — showing a login dead-end wouldn't
    // help either; let the rest of init() surface that failure instead.
    return { authRequired: false, authenticated: true };
  }
}

function showLogin() {
  stopDashboardPolling();
  el.loginOverlay.classList.remove('hidden');
  el.loginError.classList.add('hidden');
  el.loginPassword.value = '';
  setTimeout(() => el.loginUsername.focus(), 0);
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const username = el.loginUsername.value;
  const password = el.loginPassword.value;
  el.loginSubmit.disabled = true;
  el.loginError.classList.add('hidden');
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (res.ok) {
      // A full reload is simplest and most robust here: it re-runs init()
      // from scratch with the now-valid session cookie, which naturally
      // restores the last-visited folder via the usual startup path.
      location.reload();
      return;
    }
    el.loginError.textContent = data.error || '登录失败';
    el.loginError.classList.remove('hidden');
  } catch {
    el.loginError.textContent = '网络错误，请重试';
    el.loginError.classList.remove('hidden');
  } finally {
    el.loginSubmit.disabled = false;
  }
}

async function handleLogout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch {
    /* best-effort — reload shows the login screen either way once the cookie is gone or expires */
  }
  location.reload();
}

function initLogin() {
  el.loginForm.addEventListener('submit', handleLoginSubmit);
  el.btnLogout.addEventListener('click', handleLogout);
}

/* ---------------------------------------------------------------------
 * Server usage dashboard
 * ------------------------------------------------------------------- */
const DASH_POLL_MS = 3000;
let dashTimer = null;
let cpuMemChart = null;
let netChart = null;

function showFiles() {
  if (state.view === 'files') return;
  state.view = 'files';
  stopDashboardPolling();
  el.dashboardView.classList.add('hidden');
  el.toolbar.classList.remove('hidden');
  el.statusbar.classList.remove('hidden');
  renderAll();
}

function showDashboard() {
  if (!el.previewOverlay.classList.contains('hidden')) closePreview();
  state.view = 'dashboard';
  el.toolbar.classList.add('hidden');
  el.statusbar.classList.add('hidden');
  el.gridView.classList.add('hidden');
  el.listView.classList.add('hidden');
  el.emptyState.classList.add('hidden');
  el.errorBanner.classList.add('hidden');
  el.dashboardView.classList.remove('hidden');
  el.windowTitle.textContent = '服务器状态';
  el.btnBack.disabled = true;
  el.btnForward.disabled = true;
  highlightSidebar();
  loadStats();
  startDashboardPolling();
}

function startDashboardPolling() {
  stopDashboardPolling();
  dashTimer = setInterval(loadStats, DASH_POLL_MS);
}
function stopDashboardPolling() {
  clearInterval(dashTimer);
  dashTimer = null;
}

async function fetchStats() {
  const res = await apiFetch('/api/stats');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} 天 ${h} 小时`;
  if (h > 0) return `${h} 小时 ${m} 分钟`;
  return `${m} 分钟`;
}

function formatRate(bytesPerSec) {
  return `${formatBytes(bytesPerSec)}/s`;
}

// Chart.js only reads colors once at creation; theme can change at any
// time via the appearance panel, so grid/tick colors are recomputed from
// the live CSS variables on every poll rather than fixed at chart setup.
function chartThemeColors() {
  const cs = getComputedStyle(document.documentElement);
  return {
    text: cs.getPropertyValue('--text-secondary').trim() || '#6e6e73',
    grid: cs.getPropertyValue('--border').trim() || '#d9d9de',
    accent: cs.getPropertyValue('--accent').trim() || '#0a84ff',
  };
}

// If the Chart.js CDN request failed (offline, blocked, ad-blocker, ...)
// `window.Chart` never gets defined. Previously that threw partway through
// loadStats() and silently aborted before the disk list (which runs after
// the chart code) ever rendered — so a blocked CDN script took the whole
// dashboard down without any visible error. Now each piece fails on its own
// and shows a specific fallback instead.
let chartLoadFailed = false;

function showChartFallback() {
  chartLoadFailed = true;
  const msg = '<div class="dash-chart-fallback"><i class="fa-solid fa-triangle-exclamation"></i>图表库加载失败<br><span>请检查网络是否能访问 cdnjs.cloudflare.com</span></div>';
  el.chartCpuMem.closest('.dash-chart-wrap').innerHTML = msg;
  el.chartNet.closest('.dash-chart-wrap').innerHTML = msg;
}

function ensureCharts() {
  if (cpuMemChart || chartLoadFailed) return;
  if (typeof Chart === 'undefined') { showChartFallback(); return; }
  const c = chartThemeColors();
  const commonScales = {
    x: { display: false },
    y: { min: 0, max: 100, ticks: { color: c.text, font: { size: 10 }, callback: (v) => `${v}%` }, grid: { color: c.grid } },
  };

  cpuMemChart = new Chart(el.chartCpuMem, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'CPU', data: [], borderColor: '#ff9f0a', backgroundColor: 'rgba(255,159,10,0.12)', tension: 0.3, pointRadius: 0, fill: true, borderWidth: 2 },
        { label: '内存', data: [], borderColor: '#0a84ff', backgroundColor: 'rgba(10,132,255,0.12)', tension: 0.3, pointRadius: 0, fill: true, borderWidth: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: true, labels: { color: c.text, boxWidth: 10, font: { size: 11 } } } },
      scales: commonScales,
    },
  });

  netChart = new Chart(el.chartNet, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: '下载', data: [], borderColor: '#30d158', backgroundColor: 'rgba(48,209,88,0.12)', tension: 0.3, pointRadius: 0, fill: true, borderWidth: 2 },
        { label: '上传', data: [], borderColor: '#bf5af2', backgroundColor: 'rgba(191,90,242,0.12)', tension: 0.3, pointRadius: 0, fill: true, borderWidth: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: true, labels: { color: c.text, boxWidth: 10, font: { size: 11 } } } },
      scales: {
        x: { display: false },
        y: { min: 0, ticks: { color: c.text, font: { size: 10 }, callback: (v) => formatBytes(v) + '/s' }, grid: { color: c.grid } },
      },
    },
  });
}

function updateCharts(payload) {
  ensureCharts();
  if (!cpuMemChart) return; // Chart.js unavailable — fallback message already shown
  const c = chartThemeColors();
  const labels = payload.history.map((h) => new Date(h.t).toLocaleTimeString('zh-CN', { hour12: false }));

  cpuMemChart.data.labels = labels;
  cpuMemChart.data.datasets[0].data = payload.history.map((h) => h.cpu);
  cpuMemChart.data.datasets[1].data = payload.history.map((h) => h.mem);
  cpuMemChart.options.scales.y.ticks.color = c.text;
  cpuMemChart.options.scales.y.grid.color = c.grid;
  cpuMemChart.options.plugins.legend.labels.color = c.text;
  cpuMemChart.update('none');

  const netAvailable = payload.net.available;
  el.netChartCard.classList.toggle('hidden', !netAvailable);
  if (netAvailable) {
    netChart.data.labels = labels;
    netChart.data.datasets[0].data = payload.history.map((h) => h.net.rxRate);
    netChart.data.datasets[1].data = payload.history.map((h) => h.net.txRate);
    netChart.options.scales.y.ticks.color = c.text;
    netChart.options.scales.y.grid.color = c.grid;
    netChart.options.plugins.legend.labels.color = c.text;
    netChart.update('none');
  }
}

function diskBarClass(percent) {
  if (percent >= 90) return 'danger';
  if (percent >= 75) return 'warning';
  return '';
}

function renderDisks(disks) {
  el.diskList.innerHTML = '';
  if (disks.length === 0) {
    el.diskList.innerHTML = '<div class="disk-empty">无法读取磁盘信息</div>';
    return;
  }
  for (const d of disks) {
    const row = document.createElement('div');
    row.className = 'disk-row';
    const pct = Math.min(100, d.percent);
    row.innerHTML = `
      <div class="disk-row-top">
        <span class="disk-mount">${escapeHtml(d.mount)}</span>
        <span class="disk-meta">${escapeHtml(d.fs)} · ${d.type} · ${formatBytes(d.used)} / ${formatBytes(d.size)}</span>
      </div>
      <div class="disk-bar"><div class="disk-bar-fill ${diskBarClass(pct)}" style="width:${pct.toFixed(1)}%"></div></div>
    `;
    el.diskList.appendChild(row);
  }
}

async function loadStats() {
  let data;
  try {
    data = await fetchStats();
  } catch (e) {
    // Keep last-known values on screen rather than blanking the dashboard
    // over a single flaky poll, but don't swallow the error entirely.
    console.error('FolderManager: /api/stats 请求失败', e);
    return;
  }

  el.dashHostname.textContent = data.hostname;
  el.dashPlatform.textContent = `${data.platform} · ${data.cpu.model}`;
  el.dashUptime.textContent = `运行时间 ${formatUptime(data.uptimeSec)}`;

  el.tileCpuValue.textContent = `${data.cpu.percent.toFixed(1)}%`;
  el.tileCpuSub.textContent = `${data.cpu.cores} 核心`;

  el.tileMemValue.textContent = `${data.mem.percent.toFixed(1)}%`;
  el.tileMemSub.textContent = `${formatBytes(data.mem.used)} / ${formatBytes(data.mem.total)}`;

  el.tileLoadValue.textContent = data.cpu.loadavg.map((v) => v.toFixed(2)).join(' / ');

  if (data.net.available) {
    el.tileNetValue.textContent = formatRate(data.net.rxRate);
    el.tileNetSub.textContent = `↓ ${formatRate(data.net.rxRate)}  ↑ ${formatRate(data.net.txRate)}`;
  } else {
    el.tileNetValue.textContent = '不可用';
    el.tileNetSub.textContent = '当前系统不支持读取';
  }

  // Each rendered independently — a Chart.js hiccup shouldn't take the disk
  // list down with it, and vice versa.
  try {
    updateCharts(data);
  } catch (e) {
    console.error('FolderManager: 图表渲染失败', e);
  }
  try {
    renderDisks(data.disks);
  } catch (e) {
    console.error('FolderManager: 磁盘用量渲染失败', e);
  }
}

el.navDashboard.addEventListener('click', showDashboard);

/* ---------------------------------------------------------------------
 * View / sort controls
 * ------------------------------------------------------------------- */
function applyViewMode() {
  el.btnGridView.classList.toggle('active', state.viewMode === 'grid');
  el.btnListView.classList.toggle('active', state.viewMode === 'list');
  localStorage.setItem('fm_viewMode', state.viewMode);
  renderAll();
}

function applySortDirIcon() {
  el.btnSortDir.innerHTML = state.sortDir === 'asc'
    ? '<i class="fa-solid fa-arrow-up-wide-short"></i>'
    : '<i class="fa-solid fa-arrow-down-wide-short"></i>';
}

/* ---------------------------------------------------------------------
 * Event wiring
 * ------------------------------------------------------------------- */
el.btnBack.addEventListener('click', goBack);
el.btnForward.addEventListener('click', goForward);
el.btnUp.addEventListener('click', goUp);

el.btnGridView.addEventListener('click', () => { state.viewMode = 'grid'; applyViewMode(); });
el.btnListView.addEventListener('click', () => { state.viewMode = 'list'; applyViewMode(); });

el.sortSelect.value = state.sortKey;
el.sortSelect.addEventListener('change', () => {
  state.sortKey = el.sortSelect.value;
  localStorage.setItem('fm_sortKey', state.sortKey);
  renderAll();
});

el.btnSortDir.addEventListener('click', () => {
  state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  localStorage.setItem('fm_sortDir', state.sortDir);
  applySortDirIcon();
  renderAll();
});

let searchDebounce = null;
el.searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(renderAll, 120);
});

document.addEventListener('keydown', (e) => {
  if (!el.loginOverlay.classList.contains('hidden')) return; // let the login form handle its own keys
  if (!el.contextMenu.classList.contains('hidden')) return; // context menu has its own Escape handling

  const typing = document.activeElement === el.searchInput;
  const previewOpen = !el.previewOverlay.classList.contains('hidden');

  if (e.key === 'Escape' && !el.appearancePanel.classList.contains('hidden')) {
    closeAppearancePanel();
    return;
  }

  if (previewOpen) {
    if (e.key === 'Escape' || e.key === ' ') {
      e.preventDefault();
      closePreview();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      previewStep(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      previewStep(1);
    }
    return;
  }

  if (e.key === 'Escape' && typing) {
    el.searchInput.value = '';
    renderAll();
    el.searchInput.blur();
  } else if (e.key === 'Backspace' && !typing) {
    e.preventDefault();
    goUp();
  } else if (e.key === ' ' && !typing && state.view === 'files') {
    const entry = state.entries.find((en) => en.name === state.selectedName);
    if (entry && isPreviewCandidate(entry)) {
      e.preventDefault();
      openPreview(entry);
    }
  }
});

// Clicking empty space in the content area clears selection.
document.getElementById('gridView').addEventListener('click', (e) => {
  if (e.target === el.gridView) selectEntry(null);
});
el.gridView.addEventListener('contextmenu', (e) => {
  if (e.target === el.gridView) e.preventDefault();
});
el.listView.addEventListener('contextmenu', (e) => {
  if (e.target === el.listView || e.target.tagName === 'TBODY') e.preventDefault();
});

/* ---------------------------------------------------------------------
 * Init
 * ------------------------------------------------------------------- */
async function completeInit() {
  try {
    const info = await apiFetch('/api/home').then((r) => r.json());
    state.roots = info.roots || [];
    state.currentRoot = info.defaultRoot || (state.roots[0] && state.roots[0].id) || 'home';
  } catch {
    state.roots = [];
    state.currentRoot = 'home';
  }
  renderRootsList();
  refreshSidebar();

  const saved = loadLastLocation();
  const savedRootStillExists = saved && state.roots.some((r) => r.id === saved.root);
  if (savedRootStillExists && (await navigate(saved.path, { root: saved.root, silent: true }))) return;
  navigate('');
}

(async function init() {
  applyViewMode();
  applySortDirIcon();
  initAppearance();
  initLogin();

  const session = await checkSession();
  el.btnLogout.classList.toggle('hidden', !session.authRequired);
  if (session.authRequired && !session.authenticated) {
    showLogin();
    return; // completeInit() runs after a successful login reloads the page
  }
  await completeInit();
})();
