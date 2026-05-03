# backend/services/parsers.py
import re
import asyncio
from abc import ABC, abstractmethod
from typing import Dict, List
from backend.services.llm_service import AsyncLLMService

# --- 1. 制定翻译官的统一接口契约 ---
class BaseNoteParser(ABC):
    @abstractmethod
    def identify(self, raw_text: str) -> bool:
        """嗅探器：判断这段文本是不是我的活儿"""
        pass
        
    @abstractmethod
    async def parse(self, raw_text: str) -> Dict[str, str]:
        """执行切分，必须返回 { "书名": "正文", ... } 的标准格式"""
        pass

# --- 2. 专门处理 Kindle / 多看格式的王牌翻译官 ---
class KindleParser(BaseNoteParser):
    def identify(self, raw_text: str) -> bool:
        # 特征：有大量连续等于号
        return "==========" in raw_text 
        
    async def parse(self, raw_text: str) -> Dict[str, str]:
        chunks = {}
        blocks = re.split(r'={5,}', raw_text)
        
        for block in blocks:
            lines = [line.strip() for line in block.strip().splitlines() if line.strip()]
            if len(lines) < 2:
                continue
                
            # 极速卸妆，提取极其干净的书名
            raw_title_line = lines[0].replace('\ufeff', '').strip()
            book_title = re.sub(r'\s*\(.*?\)$', '', raw_title_line).strip()
            
            content_lines = []
            for line in lines[1:]:
                # 剔除 Kindle 元数据行，避免干扰 L2 引擎相似度计算
                if re.match(r'^-\s*您在位置', line) or line.startswith('- 您在位置'):
                    continue
                content_lines.append(line)
                    
            content = "\n".join(content_lines)
            
            if book_title not in chunks:
                chunks[book_title] = []
            chunks[book_title].append(content)
            
        # 把列表合并成一个长字符串
        return {book: "\n\n".join(texts) for book, texts in chunks.items()}

# --- 3. 大模型智能兜底翻译官 ---
class LLMParser(BaseNoteParser):
    def __init__(self):
        self.llm = AsyncLLMService()

    def identify(self, raw_text: str) -> bool:
        # 作为最后的兜底，永远返回 True
        return True
        
    async def parse(self, raw_text: str) -> Dict[str, str]:
        """使用大模型智能识别笔记的出处和内容"""
        prompt = f"""
你是一个精通文献管理的助手。请分析下面这段杂乱的笔记内容，识别出它主要出自哪本书。
如果包含多本书，请按书名切分。

【输出格式】：
只需输出合法的 JSON 字典，键为书名，值为该书对应的纯净笔记内容。
示例：{{"万历十五年": "笔记内容..."}}

【待分析文本】：
{raw_text[:2000]}
"""
        try:
            result = await self.llm.generate_json(prompt, system_msg="你只输出 JSON。")
            return result
        except Exception as e:
            print(f"LLM Parse error: {e}")
            return {"未分类笔记 (LLM处理失败)": raw_text}