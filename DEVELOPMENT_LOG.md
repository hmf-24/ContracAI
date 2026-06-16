# ContracAI 开发日志与进度管理

本文档用于记录 **ContracAI**（采购合同台账智能管理系统）的日常开发内容、架构决策、各模块进度及后续待办事项（TODO）。

---

## 📅 每日开发记录

### 2026-06-16 (进阶分析与 Agent Copilot 深度融合)
- **【数据看板与现金流沙盘推演】**：
  - 引入 Recharts 实现未来 6 个月现金流安全底线预测与预警。
  - 将现金流推演面板置顶显示，直观揭示“资金风险”与“合规预警”。
- **【全景关系图谱】**：
  - 采用 ForceGraph2D 构建“供应商-合同-经办人”关联关系星空图。
  - 扩大了图谱文字标签的点击热区，增强了点击反馈联动，实现跨组件路由至台账搜索。
- **【Agent Copilot 深度融合架构】**：
  - 将“台账预览”升格为主视图，移除独立的“智能对话”路由。
  - 在右侧嵌入悬浮抽屉式 AI 助理（Drawer），支持无缝随叫随到，极大节省屏幕空间。
  - 实现了 **隐式上下文联动 (Auto-Context)**：在台账中勾选多条合同后，唤醒 AI 助理时自动读取并分析勾选的数据。
  - 完善闭环录入：支持在对话框中直接上传 PDF 进行解析，在气泡中生成确认卡片，点击后即刻入账并热刷新左侧台账。

### 2026-06-12 (体验升级与智能化重构)
- **【AI 智能风控体系 (TaskTree)】**：
  - 在后端新增了 `/api/analyze_risk` 接口。
  - 在前端台账详情抽屉中集成了【AI 风险评估】按钮，通过 LLM 生成基于 TaskTree 格式的深度诊断。
  - 前端使用 `Tree` 组件渲染多维度的评估结果，直观揭示“资金风险”、“合规预警”与“行动建议”。
- **【LLM 模型预设与本地化支持】**：
  - 彻底重构了 `SettingsPanel.tsx`，现在支持“云端”和“本地”两种部署模式。
  - 内置了国内四大主流模型厂商（Minimax海螺、GLM智谱、Qwen通义千问、OpenAI）的极速预设，可一键补全 URL 与基座模型。
- **【数据大屏科技风美学升级】**：
  - 将 `DashboardPanel.tsx` 全局背景重绘为深邃的径向渐变科技风 (`#0c1831` -> `#030614`)。
  - 为所有数据卡片增加 Glassmorphism 半透明毛玻璃和边框高光特效。
  - 将图表的纯色填充替换为充满赛博朋克感的荧光青、蓝紫色渐变 (`linearGradient`)。
- **【业务体验闭环优化】**：
  - 编写 Python 脚本自动生成了涵盖极端的 `mock_ledger.xlsx`，并已设为默认体验数据源。
  - 将冗余的“合同导入”独立菜单页摘除，聚合并重构成台账页右上角的全局弹窗，实现操作内聚。

### 2026-06-12 (引入数据可视化大屏与台账预览体验升级)
- **【数据看板 (Dashboard)】**：
  - 引入了 `recharts` 数据图表库，新增了前端 `DashboardPanel.tsx` 页面。
  - 在大屏顶部新增了四个核心 KPI 指标卡片：总合同数、采购总金额、已付款总计、敞口未付总计，通过读取底层 Excel 数据实时计算得出。
  - 增加了可视化的业务图表：**经办人负责合同金额排行榜** (Top 8 横向柱状图) 与 **合同状态分布** (环形图)，提供对采购资金流的全局洞察。
  - 修改 `App.tsx` 的全局路由，将登录后的首页默认重定向至【数据看板】页面。
- **【台账预览页面增强 (LedgerPanel)】**：
  - 在前端主数据表格中新增了一列带自动着色的 **付款进度条 (Progress Bar)**，直观展现已付款项在总金额中的占比情况。
  - ** Drawer 抽屉详情优化**：
    - 精准适配并显式增加了 Excel 中的所有关键列，如【退履约/质保金】、【已开票情况】。
    - 移除了原生丑陋的分批次付款子表格，重构为现代化的**垂直时间轴 (Timeline) 追踪视图**，按批次以绿色高亮显示每一次的资金流出与时间节点。

### 2026-06-12 (双模型配置架构分离与前端设置页 UX 优化)
- **【双 LLM 配置分离】**：
  - 重构了后端 `AppConfig`，将原有的单一 `llm` 属性拆分为 `chat_llm` (用于意图理解和路由) 和 `ocr_llm` (专门用于带有视觉能力的合同文档扫描提取)。
  - 在 `config.py` 的 `load()` 中编写了平滑迁移逻辑，确保旧版本的单模型配置文件能够自动过渡并映射为 `chat_llm`。
  - 更新了 FastAPI 的 `/api/config` 路由，分别支持这两组模型配置的脱敏读取和分别写入。
  - 修改了 `LLMClient` 使其接受显式的 `LLMConfig` 对象。重构 `LLMRouter` 和 `DocParser` 使其分别注入各自的模型客户端。
- **【前端 SettingsPanel 体验优化】**：
  - 对“系统设置”页面进行了彻底的重构设计，引入了双列栅格 (`Row`/`Col`) 布局。
  - 增加了直观的分组模块：“数据存储”、“对话与推理模型”、“视觉与多模态模型”、“消息推送 (钉钉)”。
  - 为每一项配置增加了具有语义的图标（如 `RobotOutlined` 和 `CameraOutlined`）以及说明性副标题。
  - 为密码（API Key）字段增加了 `Tooltip` 悬浮提示，优化了用户的配置体验。

### 2026-06-12 (台账视图优化与多账户认证系统)
- **【认证与授权系统 (Auth & RBAC)】**：
  - 引入了轻量级本地 SQLite (`users.db`)，通过 `passlib[bcrypt]` 存储密码哈希。
  - 在后端 `auth.py` 中实现了基于 JWT (JSON Web Token) 的身份验证机制。
  - 实现了 `get_current_user` 和 `get_admin_user` 依赖，以保护所有业务 API（只有管理员可以上传文件、修改系统设置、执行台账变更）。
  - 在前端引入了全局 `AuthContext` 状态管理，拦截 401 响应并跳转至毛玻璃风格的全屏 `LoginPanel`。
  - 根据登录角色动态过滤侧边栏菜单（普通用户隐藏系统设置和导入面板）。
  - 首次启动自动初始化默认管理员账户：`admin` / `admin123`。
- **【台账展现体验优化 (Master-Detail View)】**：
  - 移除了 `LedgerPanel` 中横向拉伸极长的超多列表格设计。
  - 将主表格精简为核心 6 列（名称、金额、状态、截止日期等），保持清爽。
  - 引入了 Ant Design 的 `Drawer`（抽屉）与 `Descriptions`（描述列表）组件：点击任意合同行，右侧自动滑出抽屉，将全部 25+ 个字段按【基本信息】、【财务状况】、【执行节点】模块化展现。
  - 在抽屉内动态提取并子表格化展示所有批次的【付款明细记录】。
- **【构建更新】**：
  - 成功完成 TypeScript 编译并通过 Vite 重新构建了生产版本。

### 2026-06-12 (前端设计风格迁移 — Nexus Premium Minimalism)
- **【架构升级】**：
  - 将前端从原生 HTML/JS/CSS 全面升级为 **React 18 + TypeScript + Vite 5 + Tailwind CSS 3 + Ant Design 5** 现代前端工程架构。
  - 旧前端文件（`index.html`、`app.js`、`index.css`）已归档至 `frontend/_legacy/` 目录。
- **【设计系统迁移 (Nexus 风格同步)】**：
  - 从 `Nexus` 项目完整移植了 **Premium Utilitarian Minimalism（暖灰有机色调）** 设计规范：
    - **Tailwind 设计 Token**：暖灰色板（canvas/surface/ink/accent/brand）、圆角、阴影层级、过渡曲线等（`tailwind.config.js`）。
    - **全局 CSS 变量与毛玻璃类**：`.glass-panel`、`.glass-card`、`.glass-sidebar`、`.glass-topbar`（`src/index.css`）。
    - **Ant Design 主题注入**：通过 `<ConfigProvider>` 深度定制了按钮、输入框、下拉框、菜单、表格、弹窗等组件的视觉参数（`src/main.tsx`）。
    - **高分辨率水彩风景背景图**：从 Nexus 拷贝 `bg-landscape.png`（13.5MB）并配合 `backdrop-filter: blur(48px)` 实现柔和的遮罩渗透效果。
    - **字体排版**：西文 `Outfit` + `Inter`，中文 `HarmonyOS Sans SC`，等宽 `Geist Mono`。
- **【React 业务组件开发】**：
  - `App.tsx`：主框架含固定侧边栏（玻璃态 Logo + 导航菜单 + 状态指示灯）和面板切换。
  - `ChatPanel.tsx`：智能对话面板（markdown 气泡渲染 + Function Calling 确认卡片 + 加载动画）。
  - `LedgerPanel.tsx`：台账预览面板（AntD 玻璃态 Table + 到期预警 Alert + 一键结项按钮）。
  - `ImportPanel.tsx`：合同导入面板（AntD Dragger 拖拽上传 + 解析 Loading + 双列编辑表单 + 成功 Result 页）。
  - `SettingsPanel.tsx`：系统设置面板（玻璃卡片分组表单 + 密码可见切换 + 保存回调健康刷新）。
  - `api.ts`：统一 API 客户端，使用 Vite 代理（开发）/ 相对路径（生产）与 FastAPI 后端通信。
- **【Vite 构建配置】**：
  - 开发模式：Vite 启动 `http://localhost:3000/`，将 `/api` 请求代理到 FastAPI（`http://127.0.0.1:18920`），支持热模块替换（HMR）。
  - 生产构建：`npm run build` 输出至 `frontend/dist/`，FastAPI 优先挂载 `dist` 目录托管前端。
- **【后端适配】**：
  - 修改 `main.py`：静态文件挂载逻辑优先检测 `frontend/dist`（React 构建输出），兼容旧 `frontend` 目录。
  - 修改 `build.py`：PyInstaller 打包资源路径指向 `frontend/dist`。
- **【编译验证】**：TypeScript 类型检查零错误 + Vite 生产构建成功（CSS 4KB gzip / JS 377KB gzip）。

### 2026-06-12 (功能增强、Bug 修复、测试补全与打包发布)
- **【核心逻辑增强】**：
  - 在 `LedgerManager` 中添加了合同状态更新机制（如将状态流转为 `'已结项'`)，并解耦了 `openpyxl` 依赖，重写了纯 Python 自置的 `get_column_letter` 列字母转换算法，提升轻量性与鲁棒性。
  - 在 `main.py` 的应用启动生命周期中集成了后台定时任务 `check_warnings_loop`，每小时自动检查日期跨天，跨天后若满足条件则调用 `DingTalkBot` 自动向钉钉群推送即将到期的合同预警。
- **【前端功能升级】**：
  - 在前端台账预览页顶部新增了主动预警栏，用于渲染从 `/api/warnings` 接口获取的**合同即将到期预警**与**自动结项建议**。
  - 在自动结项卡片旁集成了「一键结项」功能，前端与后端交互，一键自动物理写入 Excel 将合同变更为 `已结项` 状态并自动重载。
- **【关键 Bug 修复】**：
  - 修复了 `doc_parser.py` 中由于 `EXTRACTION_PROMPT` 包含 JSON 格式单花括号 `{}` 导致调用 `.format()` 抛出 `KeyError` 报错的致命 Bug（已将其整体转义为双花括号 `{{}}`）。
- **【开发测试闭环】**：
  - 补全了 `tests/test_ledger.py`：对 Excel 台账的增删改查、资金追加及防呆超额进行了真实环境下的集成测试。
  - 补全了 `tests/test_parser.py`：利用 `unittest.mock` 实现了对大模型意图识别（NLU）和文档提取的全 Mock 测试。
  - 经测试，全部单元与集成测试均顺利通过（`Ran 8 tests, OK`）。
- **【虚拟环境与自动打包】**：
  - 建立了独立的本地 Python 虚拟环境（`venv`）并完整部署了依赖库。
  - 编写了 `scripts/build.py` 自动化 PyInstaller 打包构建脚本，并成功打包发布出精简独立的 Windows 桌面应用目录（可执行文件位于 `dist/ContracAI/ContracAI.exe`）。

### 2026-06-11 (项目初始化与结构搭建)
- **【后端开发】**：
  - 搭建了基于 FastAPI 的后端骨架，配置了 CORS 与静态文件托管。
  - 完成了 `config.py` 配置管理模块，支持将 LLM 及台账文件路径持久化保存于本地本地 JSON。
  - 编写了 `llm_client.py` 客户端，统一封装了兼容 OpenAI 的 API 请求，支持多模态视觉 OCR 解析。
  - 编写了 `doc_parser.py` 解析器，支持混合解析策略（文本 PDF 提取、扫描件/图片转视觉 OCR 识别、Word 表格提取）。
  - 实现了 `ledger_manager.py` 台账读写器，采用 `xlwings` 实现对 Excel 台账文件的高级操作，保证合并单元格、SUM/SUBTOTAL 内置公式及样式的完整性。
  - 实现了 `llm_router.py` 意图路由解析器，通过 Function Calling 工具调用将用户自然语言精准映射到 Excel 操作函数。
- **【前端开发】**：
  - 完成了桌面端 Web 界面框架的搭建，使用了现代深色玻璃拟态风格（Dark Glassmorphism）。
  - 实现了「智能对话」、「台账预览」、「合同导入」、「系统设置」四个交互面板的切换及数据绑定。
  - 前端逻辑采用原生 JavaScript（`app.js`）开发，通过 AJAX 与本地 FastAPI 进行高速通信。
- **【代码规范化】**：
  - 根据用户要求，对整个项目（后端 Python 文件、前端 CSS/JS/HTML 以及单元测试文件）的所有注释和 docstring 进行了**全中文翻译汉化**。
- **【版本控制】**：
  - 新建了 `.gitignore`，过滤了 Python 缓存、虚拟环境、PyInstaller 缓存和 Excel 临时文件（如 `~$*.xlsx`）。
  - 初始化 Git 本地仓库，并成功将代码推送到 GitHub 远程仓库：`https://github.com/hmf-24/ContracAI`。

---

## 📊 模块进度清单

### 1. 后端核心能力 (Done: 100%)
- [x] API 配置文件持久化 (`backend/app/config.py`)
- [x] 统一 OpenAI 兼容客户端封装 (`backend/app/llm_client.py`)
- [x] Excel 物理列映射与数据读写核心 (`backend/app/ledger_manager.py`)
- [x] LLM 意图识别与参数解析 (`backend/app/llm_router.py`)
- [x] 混合文件解析（Word、PDF、图片）及 LLM 信息提取 (`backend/app/doc_parser.py`)
- [x] 自动结项建议与截止日期到期预警机制
- [x] 单元测试用例实现 (`tests/`) 
- [x] 钉钉机器人集成 (`backend/app/dingtalk.py` & lifespan 轮询) 

### 2. 前端桌面交互 (Done: 100%)
- [x] 现代深色玻璃微动特效 UI 布局 (`frontend/index.html` & `index.css`)
- [x] 智能对话气泡、输入框自动撑高与打字机动效
- [x] 操作二次确认卡片（防误触写入）
- [x] 合同拖拽上传、智能字段展示与手动核对确认
- [x] 配置项保存与测试连接
- [x] 主动预警及弹窗提醒（到期预警、自动结项）的前端可视化展示与一键结项交互

### 4. 阶段四与阶段五：进阶分析与 Copilot 融合 (Done: 100%)
- [x] **数据看板与现金流沙盘推演**：引入 Recharts 实现未来 6 个月现金流安全底线预测与预警。
- [x] **全景关系图谱**：采用 ForceGraph2D 构建“供应商-合同-经办人”关联关系星空图，增强点击反馈联动。
- [x] **Agent Copilot 深度融合架构**：
  - 将台账列表升格为主视图，移除独立的智能对话路由。
  - 右侧嵌入悬浮抽屉式 AI 助理（Drawer），支持无缝随叫随到。
  - 实现 **隐式上下文联动 (Auto-Context)**：在台账中勾选多条合同后，AI 助理自动读取并分析勾选的数据。
  - 完善闭环录入：支持在对话框中直接上传 PDF 拖拽解析，并在对话气泡中生成确认卡片，点击即刻入账并热刷新左侧台账。

### 3. 系统集成与打包 (Done: 100%)
- [x] pywebview 桌面窗体外壳集成 (`backend/app/main.py`)
- [x] 虚拟环境依赖精简与打包配置
- [x] 使用 PyInstaller 打包为免安装桌面应用文件夹 (`dist/ContracAI/`)

---

## 🚀 后续待办事项 (TODO)

1. **实际运行测试与大模型联调**：
   - 填入实际的 MiniMax M3 API Key 进行真实合同的智能解析和 NLU 对话调试。
   - 对视觉 OCR 识别提取的字段进行校验，针对特殊格式合同进行微调和 Prompt 升级。
2. **多用户协同与文件锁捕获**：
   - 当他人通过 WPS 或 Office 占用 Excel 文件导致无法写入时，增加友好的错误重试与通知引导（当前系统已有防呆提示，仍可进一步优化交互）。
3. **打包为单文件 .exe**：
   - 目前使用 `--onedir` 方便查看与调试打包结果，未来在测试无误后，可在 `scripts/build.py` 中将参数变更为 `--onefile` 打包为纯单个 `.exe` 程序。
