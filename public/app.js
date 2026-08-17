'use strict';

/* ---------------------------------------------------------------------
 * State
 * ------------------------------------------------------------------- */
const state = {
  currentPath: '',              // relative to home root, '' = root
  entries: [],                  // raw entries for currentPath
  history: [],                  // navigation stack of paths
  historyIndex: -1,
  viewMode: localStorage.getItem('fm_viewMode') || 'grid',
  sortKey: localStorage.getItem('fm_sortKey') || 'mtime',
  sortDir: localStorage.getItem('fm_sortDir') || 'desc',
  selectedName: null,
  homeLabel: '主目录',
};

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
  return `/api/raw?path=${encodeURIComponent(relPath)}`;
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
async function fetchListing(relPath) {
  const res = await fetch(`/api/list?path=${encodeURIComponent(relPath)}`);
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
 * Navigation
 * ------------------------------------------------------------------- */
async function navigate(relPath, { pushHistory = true } = {}) {
  el.loadingBar.classList.remove('hidden');
  el.errorBanner.classList.add('hidden');
  try {
    const data = await fetchListing(relPath);
    state.currentPath = data.path;
    state.entries = data.entries;
    state.selectedName = null;

    if (pushHistory) {
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(state.currentPath);
      state.historyIndex = state.history.length - 1;
    }

    renderAll();
    if (state.currentPath === '') refreshSidebar(); // keep sidebar in sync with fresh mtimes
  } catch (e) {
    el.errorBanner.textContent = `无法打开该文件夹：${e.message}`;
    el.errorBanner.classList.remove('hidden');
    el.gridView.innerHTML = '';
    el.listViewBody.innerHTML = '';
    el.emptyState.classList.add('hidden');
  } finally {
    el.loadingBar.classList.add('hidden');
  }
}

function goBack() {
  if (state.historyIndex <= 0) return;
  state.historyIndex--;
  navigate(state.history[state.historyIndex], { pushHistory: false });
}
function goForward() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex++;
  navigate(state.history[state.historyIndex], { pushHistory: false });
}
function goUp() {
  if (!state.currentPath) return;
  const parts = state.currentPath.split('/');
  parts.pop();
  navigate(parts.join('/'));
}

/* ---------------------------------------------------------------------
 * Sidebar
 * ------------------------------------------------------------------- */
const FAVORITE_CANDIDATES = [
  { match: null, label: state.homeLabel, icon: 'fa-solid fa-house', path: '' },
  { match: 'desktop', label: '桌面', icon: 'fa-solid fa-desktop' },
  { match: 'documents', label: '文稿', icon: 'fa-solid fa-file-lines' },
  { match: 'downloads', label: '下载', icon: 'fa-solid fa-download' },
  { match: 'pictures', label: '图片', icon: 'fa-solid fa-image' },
  { match: 'projects', label: '项目', icon: 'fa-solid fa-diagram-project' },
];

async function refreshSidebar() {
  try {
    const data = await fetchListing('');
    const dirs = data.entries.filter((e) => e.isDir && !e.error);
    const dirByLower = new Map(dirs.map((d) => [d.name.toLowerCase(), d]));

    // Favorites: home + any well-known folders that actually exist
    el.favList.innerHTML = '';
    for (const fav of FAVORITE_CANDIDATES) {
      if (fav.match === null) {
        el.favList.appendChild(buildSidebarItem(fav.label, fav.icon, ''));
        continue;
      }
      const found = dirByLower.get(fav.match);
      if (found) el.favList.appendChild(buildSidebarItem(fav.label, fav.icon, found.name));
    }

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
  li.title = label;
  li.innerHTML = `<i class="${icon}"></i><span>${escapeHtml(label)}</span>`;
  li.addEventListener('click', () => navigate(targetPath));
  return li;
}

function highlightSidebar() {
  document.querySelectorAll('.sidebar-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.path === state.currentPath);
  });
}

/* ---------------------------------------------------------------------
 * Breadcrumb
 * ------------------------------------------------------------------- */
function renderBreadcrumb() {
  el.breadcrumb.innerHTML = '';
  const homeCrumb = document.createElement('span');
  homeCrumb.className = 'crumb' + (state.currentPath === '' ? ' current' : '');
  homeCrumb.innerHTML = `<i class="fa-solid fa-house"></i> ${escapeHtml(state.homeLabel)}`;
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
  const folderName = state.currentPath === '' ? state.homeLabel : state.currentPath.split('/').pop();
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
}

function copyPathToClipboard(entry) {
  const text = `~/${joinPath(state.currentPath, entry.name)}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => showToast(`已复制路径：${text}`),
      () => showToast('复制失败，请手动复制路径')
    );
  } else {
    showToast(text);
  }
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
  const res = await fetch(`/api/file?path=${encodeURIComponent(relPath)}`);
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
  } else if (e.key === ' ' && !typing) {
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

/* ---------------------------------------------------------------------
 * Init
 * ------------------------------------------------------------------- */
(async function init() {
  applyViewMode();
  applySortDirIcon();
  initAppearance();
  try {
    const info = await fetch('/api/home').then((r) => r.json());
    if (info.home) {
      const short = info.home.split('/').filter(Boolean).pop();
      state.homeLabel = short || '主目录';
      FAVORITE_CANDIDATES[0].label = state.homeLabel;
    }
  } catch { /* keep default label */ }
  refreshSidebar();
  navigate('');
})();
