# Copilot Model Manager

> GitHub Copilot 自定义模型配置的 GUI 管理工具

管理 VS Code `chatLanguageModels.json` 配置文件，提供可视化界面添加、编辑、删除 Provider 和 Model，支持从远程 API 自动拉取模型列表。

## 功能特性

- **Provider 管理** — 添加/编辑/删除 Provider，支持自定义 Vendor、API Type、Base URL
- **Model 管理** — 为每个 Provider 配置多个模型，支持 Tool Calling / Vision / Thinking 标记
- **模型列表折叠** — 模型列表支持折叠/展开，状态持久化到 localStorage
- **自动拉取** — 通过 API Key + Models URL 自动获取远程模型列表，一键导入
- **用量限额** — 可视化展示每个 Provider 的用量/余额/订阅状态，支持远程 API 自动查询
- **订阅管理** — 支持订阅模式，显示订阅状态、起止时间、剩余天数、控制台链接
- **DeepSeek 余额** — 自动解析 DeepSeek `balance_infos` 格式，彩色余额显示
- **API Key 安全存储** — 密钥独立存储在本地 `.api-keys.json`，不写入 VS Code 配置
- **快速添加模板** — 内置火山引擎、DeepSeek、OpenAI、Ollama 等常用服务商模板
- **CC Switch 导入** — 从 `cc-switch.db` 一键导入已有配置
- **服务器日志** — 内置日志系统，支持级别筛选和自动轮转
- **关于页面** — 显示版本信息、许可证、GitHub 链接等
- **独立窗口** — 启动后以 Edge/Chrome App 模式打开独立窗口（无地址栏和标签页）
- **EXE 打包** — 支持打包为单文件 Windows 可执行程序，双击即用

## 快速开始

### 前置条件

- [Node.js](https://nodejs.org/) >= 14

### 安装 & 启动

```bash
# 克隆项目
git clone <repo-url>
cd Copilot-Model-Manager

# 安装依赖
npm install

# 启动服务
npm start
# 或
node server.js

# 自定义端口
node server.js 8080
```

启动后自动在 Edge/Chrome 独立窗口中打开（无地址栏），无需手动访问浏览器。

Windows 用户也可直接双击 `启动.bat`。

### 打包为 EXE

```bash
# 一键打包（需要先 npm install）
双击 build.bat
```

打包产物为 `CopilotModelManager.exe`（约 42MB），双击即可运行，无需安装 Node.js。

打包说明：
- 基于 [@yao-pkg/pkg](https://github.com/yao-pkg/pkg) 打包，内含 Node.js 20 运行时
- 启动后自动在 Edge/Chrome 独立窗口中打开
- PE 子系统已修补为 GUI 模式，运行时不弹出 CMD 窗口
- 无 Edge 时自动回退到 Chrome，都没有则用系统默认浏览器

## 项目结构

```
Copilot-Model-Manager/
├── server.js          # 后端服务（纯 Node.js，无框架依赖）
├── index.html         # 单文件前端（HTML + CSS + JS）
├── package.json
├── 启动.bat           # Windows 一键启动脚本
├── build.bat          # Windows 一键打包脚本
├── icon.ico           # 应用图标（Edge 窗口左上角）
├── .api-keys.json     # [自动生成] API Key 存储（已 gitignore）
├── .url-history.json  # [自动生成] URL 历史记录（已 gitignore）
├── .quota-data.json   # [自动生成] 用量限额数据（已 gitignore）
├── .edge-profile/     # [自动生成] Edge 独立窗口数据（已 gitignore）
└── logs/              # [自动生成] 服务器日志（已 gitignore）
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/config` | 读取 chatLanguageModels.json |
| `POST` | `/api/config` | 写入 chatLanguageModels.json |
| `GET` | `/api/keys` | 获取所有 Key 名称（脱敏） |
| `POST` | `/api/keys` | 保存 API Key |
| `GET` | `/api/key/:name` | 获取指定 Key 明文（用于复制） |
| `GET` | `/api/url-history` | 获取 URL 历史 |
| `POST` | `/api/url-history` | 保存 URL 历史 |
| `GET` | `/api/ccswitch` | 读取 CC Switch 数据库 |
| `POST` | `/api/fetch-models` | 从远程 API 拉取模型列表 |
| `POST` | `/api/open-config` | 用 VS Code 打开配置文件 |
| `GET` | `/api/quota` | 读取用量限额数据 |
| `POST` | `/api/quota` | 保存用量限额数据 |
| `POST` | `/api/quota/fetch` | 从远程 API 查询用量/余额 |
| `GET` | `/api/heartbeat` | 心跳检测 |
| `GET` | `/api/logs` | 读取服务器日志 |
| `DELETE` | `/api/logs` | 清空日志 |
| `GET` | `/api/paths` | 获取所有路径信息 |

## 配置路径

| 文件 | 路径 |
|------|------|
| VS Code 模型配置 | `%APPDATA%\Code\User\chatLanguageModels.json` |
| API Key 存储 | 项目目录下 `.api-keys.json` |
| URL 历史 | 项目目录下 `.url-history.json` |
| 用量限额数据 | 项目目录下 `.quota-data.json` |
| CC Switch 数据库 | `~\.cc-switch\cc-switch.db` |
| 服务器日志 | 项目目录下 `logs/server.log` |

## 安全说明

- `.api-keys.json` 包含明文 API Key，已加入 `.gitignore`，**请勿提交到公开仓库**

## 许可证

[Apache-2.0](LICENSE)
- API Key 仅存储在本地，服务端不外传
- 前端显示 Key 时默认脱敏（`sk-****`），点击眼睛图标临时显示明文

## 技术栈

- **后端**: 纯 Node.js（`http` / `fs` / `path`），零框架依赖
- **前端**: 单文件 HTML，内嵌 CSS + JS，VS Code 暗色主题风格
- **数据库读取**: sql.js（可选，用于读取 CC Switch 的 SQLite 数据库）

## License

[Apache-2.0](LICENSE)