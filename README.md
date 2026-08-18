# FolderManager

一个文件夹管理器，界面参照 Mac Finder 设计，专门用来快速浏览、检索积累的一堆项目文件夹，省得每次都要开终端 `cd` 半天才能想起某个项目放在哪儿。既可以跑在本地 WSL / Linux 主目录，也可以部署到真正的服务器上，自动识别站点目录、`/srv`、`/opt` 等常见位置，并附带一个实时的服务器用量监控面板。

零依赖：后端只用 Node.js 内置模块（`http`/`fs`/`path`/`os`/`child_process`），前端是纯 HTML + CSS + JS，不需要构建工具，`node server.js` 一行命令就能跑起来。

## 功能

- **Finder 风格界面**：红黄绿交通灯标题栏、图标网格 / 列表两种视图、面包屑导航、侧边栏“位置” / “收藏” / “最近修改的项目”
- **多位置自动识别**：启动时自动探测本机上有哪些“值得浏览”的目录（主目录、`/var/www`、`/srv`、`/opt`、`/data`、Docker 数据卷……），只展示实际存在的那些，可在侧边栏“位置”里随时切换；也可以用 `FM_ROOT` 强制指定一个额外的根目录（比如某个站点的具体路径）
- **浏览与检索**：前进 / 后退 / 上一级（跨“位置”切换也会正确记录在历史里）、按名称实时搜索、按名称 / 大小 / 修改时间排序（正序倒序可切换）
- **Quick Look 快速预览**：选中文件按空格键（或悬停点眼睛图标 / 双击）即可打开预览，无需下载或用外部程序打开
  - 代码与配置文件：语法高亮（highlight.js），自动识别 JS/TS/Python/Go/Rust/Java/HTML/CSS/JSON/YAML/Shell/SQL 等常见语言
  - Markdown 文件：渲染成排版后的富文本（marked + DOMPurify 净化，代码块同样带高亮）
  - 图片：png/jpg/jpeg/gif/webp/bmp/svg/ico 直接预览
  - PDF：内嵌浏览器原生 PDF 阅读器，支持翻页、缩放、搜索，大文件走 Range 分段加载不卡顿——方便直接翻论文
  - 预览窗口内支持左右方向键在当前文件夹的可预览文件间连续切换
  - 过大文件（>1.5MB 文本）或二进制文件会给出提示而不是硬加载
- **服务器状态面板**（侧边栏“系统” → “服务器状态”）：CPU / 内存使用率曲线、系统负载、运行时长、网络实时吞吐、各挂载磁盘的用量进度条（超过 75%/90% 会变色提醒），每 3 秒自动刷新
- **登录保护**（设置 `FM_USER`/`FM_PASS` 后启用）：应用内的登录页（不是浏览器原生的 Basic Auth 弹窗），登录状态用 HttpOnly Session Cookie 保持 7 天，标题栏有单独的退出登录按钮；登录接口自带失败次数限制，防止密码被暴力破解
- **刷新不丢位置**：当前浏览到的“位置 + 路径”会记在浏览器本地，刷新页面会自动回到刷新前的那个文件夹，而不是每次都跳回主目录
- **右键菜单**（视觉和交互对齐 macOS Finder：实心蓝色高亮、无图标、点击外部或 Esc 关闭）
  - 下载：文件直接下载；文件夹会在服务端实时打包成 zip 再下载（zip 打包是纯 Node 实现，不依赖系统装没装 `zip` 命令）
  - 重命名：原地把名称变成输入框，默认预选“去掉扩展名”的部分，和 Finder/Explorer 的重命名体验一致；只允许改名，不能通过改名把文件“移动”到别的目录
  - 复制路径
- **外观设置**（标题栏调色板图标）
  - 三套主题：跟随系统深浅色（默认）、始终亮色、毛玻璃（半透明磨砂效果）
  - 支持自定义桌面背景图片，本地压缩后保存在浏览器 `localStorage`，无需上传到服务器
- 单击复制文件路径到剪贴板（图片 / PDF / 代码等可预览类型改为双击直接预览）

## 快速开始

```bash
npm start
# 或者
node server.js
```

默认监听 `http://0.0.0.0:5173`，浏览器打开即可。启动时会打印检测到的所有可浏览位置。

需要 Node.js 16 及以上版本。

### 后台常驻运行

`scripts/` 下有几个用 `nohup` + PID 文件管理进程的小脚本，关掉终端 / 断开 SSH 都不会中断：

```bash
./scripts/start.sh    # 启动（已经在跑的话会提示，不会重复启动）
./scripts/status.sh   # 查看是否在跑、监听在哪个端口
./scripts/stop.sh     # 停止
./scripts/restart.sh  # 重启（改完代码 / 换了环境变量后用这个）
```

日志在 `logs/server.log`（这个目录已经加进 `.gitignore`）。

这几个脚本只保证“终端关闭不影响它”，**不会**在机器重启后自动拉起——如果是在 WSL 里跑，WSL 实例本身也不是持续在线的东西，一般不需要考虑“开机自启”；如果确实需要开机自启，有两个方向：

- 在 WSL 里正儿八经启用 systemd（`/etc/wsl.conf` 加 `[boot]\nsystemd=true`，然后 Windows 侧执行 `wsl --shutdown` 重启 WSL），再用下面「部署到服务器」里给的 systemd unit —— 这也是普通 Linux 服务器上更标准的做法
- 部署在真正常年开机的服务器上，直接走下面的 systemd 方案

### 环境变量

| 变量 | 作用 | 默认值 |
| --- | --- | --- |
| `PORT` | 监听端口 | `5173` |
| `HOST` | 监听地址 | `0.0.0.0` |
| `FM_ROOT` | 额外强制指定一个根目录（优先级最高，出现在“位置”列表最前面），适合直接指向某个站点/项目目录 | 无 |
| `FM_USER` / `FM_PASS` | 同时设置后开启登录页鉴权，未设置则不鉴权、直接可用 | 无 |

```bash
PORT=8080 FM_ROOT=/var/www/myapp FM_USER=admin FM_PASS=change-me node server.js
```

## 部署到服务器

这个工具最初是给本机用的，但既然能读取文件系统，直接扔到一台服务器上管理站点目录 / 日志 / Docker 数据卷也是可以的，只是需要注意：

1. **务必设置 `FM_USER`/`FM_PASS`**：这个应用没有别的访问控制，只要能连到端口就能浏览、下载、预览它探测到的所有目录下的任何文件。一旦监听地址不是 `127.0.0.1`，就等于把整个文件系统暴露出去，必须加身份验证。
2. **建议只监听本机回环，用反向代理接管公网入口**：`HOST=127.0.0.1 PORT=5173 FM_USER=... FM_PASS=... node server.js`，再用 Nginx/Caddy 做 TLS 终止和转发，避免登录密码和 Session Cookie 在公网明文传输。
3. **用 systemd 保活**，例如 `/etc/systemd/system/folder-manager.service`：

   ```ini
   [Unit]
   Description=FolderManager
   After=network.target

   [Service]
   Environment=HOST=127.0.0.1
   Environment=PORT=5173
   Environment=FM_USER=admin
   Environment=FM_PASS=change-me
   ExecStart=/usr/bin/node /path/to/FolderManager/server.js
   Restart=on-failure
   User=deploy

   [Install]
   WantedBy=multi-user.target
   ```

   然后 `systemctl enable --now folder-manager`。

4. 磁盘用量面板依赖系统自带的 `df` 命令，CPU/内存/网络数据来自 `/proc`，都是 Linux 环境自带的，不需要额外安装监控代理。

## 安全说明

- 每个“位置”（root）都有独立的越界检查：所有接口都会校验请求路径不能超出该位置自身的目录范围（防路径穿越），不同位置之间也互不可达
- 默认不鉴权，只适合本机本地访问；一旦部署到服务器或暴露到非回环地址，请配置 `FM_USER`/`FM_PASS`（见上）
- 登录会话是服务端内存里的随机 token（`crypto.randomBytes(32)`），存在 HttpOnly + SameSite=Strict 的 Cookie 里，JS 读不到、也不会被跨站请求带出去；重启进程会清空所有会话（需要重新登录），这是内存态存储的取舍，换来的是不用额外依赖数据库/文件存 session
- `/api/login` 按来源 IP 做了失败次数限制（10 分钟内最多 8 次），超过会返回 429
- 重命名是这个应用目前唯一的写操作：只能改同一目录下的名称（新名称里不允许出现 `/`），没法用它把文件“移动”到别的目录或别的“位置”
- **不要**在没有身份验证的情况下把这个服务暴露到公网或不受信任的网络

## 项目结构

```
FolderManager/
├── server.js          # 零依赖 HTTP 服务：静态资源 + /api/list /api/file /api/raw /api/download /api/rename /api/home /api/stats /api/session /api/login /api/logout
├── package.json
└── public/
    ├── index.html
    ├── style.css       # Finder 风格样式 + 三套主题 + 服务器状态面板样式
    └── app.js           # 前端交互逻辑
```

## 技术栈

- 后端：Node.js 内置 `http` / `fs` / `path` / `os` / `child_process`，无第三方依赖
- 前端：原生 HTML / CSS / JavaScript
- 通过 CDN 引入的展示类库：Font Awesome（图标）、highlight.js（代码高亮）、marked + DOMPurify（Markdown 渲染与净化）、github-markdown-css（Markdown 排版样式）、Chart.js（服务器状态面板的曲线图）
