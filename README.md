# InkTrace - 智能笔记清洗与深度思考系统

## 📖 项目简介

InkTrace 是一个基于AI的智能笔记清洗与深度思考系统，支持：
- 📝 **智能笔记清洗**：自动清洗和重构原始笔记
- 🧠 **L3语义分析**：深度语义理解和概念提取
- 🔍 **L4语义搜索**：跨文档语义搜索和关联分析
- 💭 **深度思考**：段落绑定的思考卡片系统
- 📊 **可视化分析**：语义网络和认知延伸

## 🚀 快速开始

### 环境要求
- Python 3.8+
- Node.js 16+
- DeepSeek API Key

### 1. 后端服务启动

```bash
# 安装Python依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，添加 DEEPSEEK_API_KEY

# 启动后端服务
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. 前端服务启动

```bash
# 安装前端依赖
cd frontend
npm install

# 构建前端
npm run build

# 启动开发服务器
npm run dev
```

### 3. 访问应用
- 前端地址：http://localhost:3000
- 后端API：http://localhost:8000
- API文档：http://localhost:8000/docs

## 📁 项目结构

```
InkTrace-Core-withPassage/
├── backend/                 # 后端服务
│   ├── api/                # API路由
│   ├── core/               # 核心配置
│   ├── services/           # 业务服务
│   ├── schemas/            # 数据模型
│   └── main.py             # 主入口
├── frontend/               # 前端应用
│   ├── src/                # 源码目录
│   ├── dist/               # 构建输出
│   └── package.json        # 依赖配置
├── data/                   # 数据目录
│   ├── source_books/       # 原著文件
│   ├── raw_notes/          # 原始笔记
│   └── output/             # 清洗输出
└── README.md               # 项目文档
```

## 🔧 核心功能

### 笔记清洗流程
1. **导入笔记**：支持TXT格式笔记导入
2. **智能清洗**：自动识别和清洗冗余内容
3. **语义分析**：提取核心概念和语义网络
4. **深度思考**：生成L4深度思考内容

### 深度思考功能
- **段落绑定**：思考卡片与具体段落关联
- **语义搜索**：跨文档语义关联搜索
- **卡片钉入**：重要思考内容钉入左栏
- **会话保存**：完整的思考会话保存

## 🔌 API接口

### 主要端点
- `POST /api/v1/notes/process_book` - 处理笔记清洗
- `POST /api/v1/notes/chat` - 深度对话
- `POST /api/v1/search/semantic` - 语义搜索
- `POST /api/v1/deepwork/save` - 保存会话
- `GET /api/v1/notes/content` - 获取笔记内容

## 🛠️ 开发指南

### 环境配置
```bash
# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\\Scripts\\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 前端开发
cd frontend
npm install
npm run dev
```

### 测试
```bash
# 运行后端测试
python -m pytest tests/

# 前端构建测试
cd frontend
npm run build
```

## 📊 数据管理

### 数据目录结构
```
data/
├── source_books/           # 原著文件 (.txt)
├── raw_notes/             # 原始笔记 (.txt)
├── output/                # 清洗后笔记 (.md)
├── deepwork_sessions.json # 会话数据
└── l3_semantic_cache.json # 语义缓存
```

### 文件命名规范
- 原著文件：`《书名》.txt`
- 原始笔记：`《书名》notes.txt`
- 清洗输出：`《书名》_Notes.md`

## 🔒 安全配置

### 环境变量
```bash
DEEPSEEK_API_KEY=sk-your-api-key-here
BACKEND_PORT=8000
FRONTEND_PORT=3000
```

### 注意事项
- 确保API密钥安全存储
- 生产环境禁用CORS或配置白名单
- 定期清理缓存文件

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 📞 技术支持

如有问题或建议，请提交 Issues 或联系开发团队。