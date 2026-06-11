# ContracAI - 采购合同台账智能管理系统

> 基于 LLM 的采购合同全生命周期自动化管理工具

## 功能概览

- **自然语言交互**：通过对话即可完成合同建档、节点更新、资金支付等操作
- **智能文档解析**：支持 PDF（文字/扫描件）、Word、图片格式合同的自动识别与信息提取
- **Excel 台账精准操作**：基于 xlwings 直接操作原始 Excel 文件，保留合并单元格、多级表头和内置公式
- **人机协同安全机制**：所有写入操作均需用户二次确认，LLM 仅生成参数不直接写文件
- **桌面端应用**：pywebview 套壳，PyInstaller 打包为免安装 .exe

## 技术架构

```
┌─────────────────────────────────┐
│  Frontend (HTML/CSS/JS)         │  ← pywebview 桌面窗口
├─────────────────────────────────┤
│  FastAPI (REST API)             │  ← 业务接口层
├──────────┬──────────────────────┤
│ LLM      │ Ledger    │ Doc     │
│ Router   │ Manager   │ Parser  │  ← 核心业务模块
├──────────┴──────────┴──────────┤
│  LLM Client (OpenAI-compat)    │  ← 统一 LLM 抽象层
└─────────────────────────────────┘
     ↕              ↕
  MiniMax M3    Excel (xlwings)
  / 本地 LLM
```

## LLM 策略

| 阶段 | 模型 | 接入方式 |
|:---|:---|:---|
| 当前 (V1) | MiniMax M3 | OpenAI 兼容 API |
| 后期 | 本地 LLM (Qwen/GLM) | Ollama / vLLM (OpenAI 兼容) |

切换模型只需修改配置文件中的 `base_url` / `api_key` / `model`，无需改动代码。

## 快速开始

```bash
# 1. 安装依赖
cd backend
pip install -r requirements.txt

# 2. 配置 (首次运行会在 ~/.contrac-ai/ 下生成配置文件)
# 编辑 ~/.contrac-ai/config.json 填入 API Key 和 Excel 路径

# 3. 运行
python -m app.main
```

## 项目结构

```
contrac-ai/
├── backend/                # Python 后端
│   ├── app/
│   │   ├── main.py         # FastAPI + pywebview 入口
│   │   ├── config.py       # 配置管理
│   │   ├── llm_client.py   # 统一 LLM 抽象层
│   │   ├── ledger_manager.py  # Excel 台账操作核心
│   │   ├── llm_router.py   # 意图识别 & Function Calling
│   │   ├── doc_parser.py   # 文档解析 (PDF/Word/图片)
│   │   └── dingtalk.py     # 钉钉集成 (预留)
│   └── requirements.txt
├── frontend/               # 桌面端 Web UI
│   ├── index.html
│   ├── index.css
│   ├── app.js
│   └── assets/
├── scripts/
│   └── build.py            # PyInstaller 打包
├── tests/
│   ├── test_ledger.py
│   └── test_parser.py
└── README.md
```

## 所属

- **应用单位**：云南云上云信息化有限公司
- **所属部门**：运维技术部
