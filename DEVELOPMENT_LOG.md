# ContracAI 开发日志与进度管理

本文档用于记录 **ContracAI**（采购合同台账智能管理系统）的日常开发内容、架构决策、各模块进度及后续待办事项（TODO）。

---

## 📅 每日开发记录

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
