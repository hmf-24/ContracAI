# ContracAI 开发日志与进度管理

本文档用于记录 **ContracAI**（采购合同台账智能管理系统）的日常开发内容、架构决策、各模块进度及后续待办事项（TODO）。

---

## 📅 每日开发记录

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

### 1. 后端核心能力 (Done: 90%)
- [x] API 配置文件持久化 (`backend/app/config.py`)
- [x] 统一 OpenAI 兼容客户端封装 (`backend/app/llm_client.py`)
- [x] Excel 物理列映射与数据读写核心 (`backend/app/ledger_manager.py`)
- [x] LLM 意图识别与参数解析 (`backend/app/llm_router.py`)
- [x] 混合文件解析（Word、PDF、图片）及 LLM 信息提取 (`backend/app/doc_parser.py`)
- [x] 自动结项建议与截止日期到期预警机制
- [ ] 单元测试用例实现 (`tests/`) — *待补充具体断言测试*
- [ ] 钉钉机器人集成 (`backend/app/dingtalk.py`) — *当前为预留框架*

### 2. 前端桌面交互 (Done: 85%)
- [x] 现代深色玻璃微动特效 UI 布局 (`frontend/index.html` & `index.css`)
- [x] 智能对话气泡、输入框自动撑高与打字机动效
- [x] 操作二次确认卡片（防误触写入）
- [x] 合同拖拽上传、智能字段展示与手动核对确认
- [x] 配置项保存与测试连接
- [ ] 主动预警及弹窗提醒（到期预警、自动结项）的前端可视化展示

### 3. 系统集成与打包 (Done: 50%)
- [x] pywebview 桌面窗体外壳集成 (`backend/app/main.py`)
- [ ] 虚拟环境依赖精简与打包配置
- [ ] 使用 PyInstaller 打包为免安装单文件 `.exe`

---

## 🚀 后续待办事项 (TODO)

1. **功能联调与模型微调**：
   - 接入实际的 MiniMax M3 API Key 进行大模型解析测试。
   - 优化 Prompt，提高在面对复杂合同文本时信息提取的稳定度与字段准确率。
2. **物理 Excel 操作鲁棒性增强**：
   - 添加 Excel 文件占用检测（如用户在 WPS/Office 中打开了台账时，写入需要进行防占用的异常捕获）。
3. **一键打包**：
   - 编写 `scripts/build.py` 脚本，支持通过 PyInstaller 自动化将 Python 环境、FastAPI 以及前端文件打包为一个独立的 Windows `.exe` 程序。
