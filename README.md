# FolderManager

一个跑在本地的文件夹管理器，界面参照 Mac Finder 设计，专门用来快速浏览、检索 WSL / Linux 主目录下积累的一堆项目文件夹，省得每次都要开终端 `cd` 半天才能想起某个项目放在哪儿。

零依赖：后端只用 Node.js 内置的 `http` 模块，前端是纯 HTML + CSS + JS，不需要构建工具，`node server.js` 一行命令就能跑起来。

## 功能

- **Finder 风格界面**：红黄绿交通灯标题栏、图标网格 / 列表两种视图、面包屑导航、侧边栏"位置"与"最近修改的项目"
- **浏览与检索**：前进 / 后退 / 上一级、按名称实时搜索、按名称 / 大小 / 修改时间排序（正序倒序可切换）
- **Quick Look 快速预览**：选中文件按空格键（或悬停点眼睛图标 / 双击）即可打开预览，无需下载或用外部程序打开
  - 代码与配置文件：语法高亮（highlight.js），自动识别 JS/TS/Python/Go/Rust/Java/HTML/CSS/JSON/YAML/Shell/SQL 等常见语言
  - Markdown 文件：渲染成排版后的富文本（marked + DOMPurify 净化，代码块同样带高亮）
  - 图片：png/jpg/jpeg/gif/webp/bmp/svg/ico 直接预览
  - PDF：内嵌浏览器原生 PDF 阅读器，支持翻页、缩放、搜索，大文件走 Range 分段加载不卡顿——方便直接翻论文
  - 预览窗口内支持左右方向键在当前文件夹的可预览文件间连续切换
  - 过大文件（>1.5MB 文本）或二进制文件会给出提示而不是硬加载
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

默认监听 `http://localhost:5173`，浏览器打开即可。启动时会打印实际监听的主目录路径。

需要 Node.js 16 及以上版本。

### 自定义端口

```bash
PORT=8080 node server.js
```

## 安全说明

- 服务只读取、列出当前系统用户的主目录（`os.homedir()`）及其子目录，所有接口都会校验请求路径不能越出主目录范围（防路径穿越）
- 只用于本机本地访问，没有做身份鉴权，**不要**把这个服务暴露到公网或不受信任的网络

## 项目结构

```
FolderManager/
├── server.js          # 零依赖 HTTP 服务：静态资源 + /api/list /api/file /api/raw /api/home
├── package.json
└── public/
    ├── index.html
    ├── style.css       # Finder 风格样式 + 三套主题
    └── app.js           # 前端交互逻辑
```

## 技术栈

- 后端：Node.js 内置 `http` / `fs` / `path`，无第三方依赖
- 前端：原生 HTML / CSS / JavaScript
- 通过 CDN 引入的展示类库：Font Awesome（图标）、highlight.js（代码高亮）、marked + DOMPurify（Markdown 渲染与净化）、github-markdown-css（Markdown 排版样式）
