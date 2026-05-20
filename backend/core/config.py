# 环境变量与配置管理 (Pydantic BaseSettings)
import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    """全局配置类，自动从环境变量或 .env 文件加载配置"""
    
    # 项目基础信息
    PROJECT_NAME: str = "InkTrace API"
    VERSION: str = "1.0.0"
    
    # 大模型配置
    DEEPSEEK_API_KEY: str = Field(..., description="DeepSeek API 密钥")
    BASE_URL: str = Field("https://api.deepseek.com", description="大模型基础 URL")
    MODEL_NAME: str = Field("deepseek-chat", description="使用的模型名称")
    
    # 业务参数控制
    MAX_CHUNK_WORDS: int = Field(4000, description="单个处理块的最大字符数")
    ENABLE_LLM_FALLBACK: bool = Field(True, description="是否开启 L3 失败时的优雅降级")

    # 腾讯文档开放平台配置
    TENCENT_DOC_CLIENT_ID: str = Field("", description="腾讯文档应用 Client ID")
    TENCENT_DOC_CLIENT_SECRET: str = Field("", description="腾讯文档应用 Client Secret")
    TENCENT_DOC_REDIRECT_URI: str = Field("http://127.0.0.1:8000/api/v1/export/tencent/callback", description="腾讯文档授权回调地址")

    # 指定加载 .env 文件 (从项目根目录加载)
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"  # 允许 .env 中存在类未定义的额外变量
    )

# 实例化一个单例，全局只需导入这个 settings 即可
settings = Settings()