# 纯粹负责与大模型通信的封装

import json
import logging
import concurrent.futures
import time
import re
import os
import asyncio
import hashlib
from collections import OrderedDict
from threading import Lock
from typing import Optional, Dict, List
from pydantic import BaseModel, Field
from openai import OpenAI, AsyncOpenAI
from backend.core.config import settings
from backend.core.prompts import (
    STITCHING_SYSTEM_PROMPT,
    SINGLE_SOURCE_RESTRUCTURER_PROMPT,
    VALIDATOR_PROMPT,
    BEAUTIFY_PROMPT,
    TERM_EXPLAINER_PROMPT,
    CITATION_FORMATTER_PROMPT
)
from backend.services.cleaner_pipeline import (
    clean_basic_noise,
    split_by_source_as_chunks,
    build_safe_query
)

logger = logging.getLogger(__name__)


class AsyncLLMService:
    """极其纯粹的大模型通信层 (只负责发请求和解析 JSON)"""

    def __init__(self):
        self._client = None
        self.model_name = settings.MODEL_NAME
        self.base_url = settings.BASE_URL
        self.api_key = settings.DEEPSEEK_API_KEY
    
    @property
    def client(self):
        if self._client is None:
            self._client = AsyncOpenAI(
                api_key=self.api_key,
                base_url=self.base_url
            )
        return self._client

    async def generate_text(self, prompt: str, system_msg: str = "你是非常有帮助的AI助理") -> str:
        """通用文本生成接口"""
        response = await self.client.chat.completions.create(
            model=self.model_name,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7
        )
        return response.choices[0].message.content

    async def generate_json(self, prompt: str, system_msg: str = "你是一个返回JSON的AI") -> dict:
        """通用 JSON 生成接口"""
        # DeepSeek API 要求 prompt 中必须包含 "json" 字样才能使用 json_object 格式
        if "json" not in prompt.lower():
            prompt = prompt + "\n\n请以 JSON 格式输出结果。"
        response = await self.client.chat.completions.create(
            model=self.model_name,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.7
        )
        return json.loads(response.choices[0].message.content)

    async def extract_metadata(self, raw_text_head: str) -> Dict[str, Optional[str]]:
        """
        AI 辅助判断 1：从极其混乱的笔记头部提取书名和作者
        """
        logger.info("🤖 触发 AI 辅助：正在提取书名元数据...")

        # 为了省钱和速度，只取前 300 个字符，足够提取书名了
        text_sample = raw_text_head[:300]

        prompt = f"""你是一个极其精准的图书元数据提取引擎。
请从以下用户笔记的文本片段中，提取出这本书的「书名」和「作者」。
如果文本中包含了英文名或拼音（如 Sheng Yu Zhi Du - Fei Xiao Tong），请直接原样提取。

【提取要求】
1. 去掉书名号等标点。
2. 必须以纯 JSON 格式输出，不要有任何多余的解释。
3. 如果实在找不到，对应字段填 null。

【目标输出 JSON 格式】
{{"title": "书名", "author": "作者"}}

【用户笔记片段】
{text_sample}
"""
        try:
            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": prompt}],
                # 开启强制 JSON 模式 (如果是 DeepSeek/OpenAI 支持的话)
                response_format={"type": "json_object"},
                temperature=0.1, # 提取任务需要绝对冷静，不需要创造力
                timeout=10 # 严格超时控制
            )

            result_str = response.choices[0].message.content
            return json.loads(result_str)

        except Exception as e:
            logger.error(f"❌ AI 辅助提取失败: {e}")
            return {"title": None, "author": None}

    async def verify_book_match(self, note_title: str, db_title: str) -> bool:
        """
        AI 辅助判断 2：跨语言/拼音实体对齐 (当 L2 模糊匹配处于暧昧期时触发)
        """
        logger.info(f"🤖 触发 AI 判断：评估 '{note_title}' 与 '{db_title}' 是否为同一本书...")

        prompt = f"""判断输入 A 和 输入 B 是否极大概率指代同一本书。
考虑中英互译、拼音、别名等情况。
输入A: "{note_title}"
输入B: "{db_title}"

只输出纯 JSON，格式：{{"is_same": true 或 false}}"""

        try:
            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            result = json.loads(response.choices[0].message.content)
            return result.get("is_same", False)
        except Exception:
            return False


class SemanticExtension(BaseModel):
    distilled_title: str = Field(description="【精炼标题】：4-8个字，极具穿透力的学术核心词，如'明代财政之殇'")
    deep_trace: str = Field(description="【深度溯源】：识别文中晦涩、高密度的学术或历史概念，提供破茧成蝶式的背景解析")
    original_echo: str = Field(description="【原文回响】：基于上下文，解析该划线在作者整体思想链路中的关键作用")
    cognitive_extension: str = Field(description="【观念认知扩展】：从该概念出发，进行跨学科思维推演（如：从古代税制看现代治理逻辑），80字以内")
    tags: List[str] = Field(default_factory=list, description="【知识标签】：2-3 个核心学术分类")
    semantic_network: List[Dict[str, str]] = Field(
        default_factory=list,
        description="【语义网络】：2-3个强关联名词。格式：{'term': '名词', 'note': '具体的关联逻辑说明，严禁填None'}"
    )
    references: List[Dict[str, str]] = Field(
        default_factory=list,
        description="【外部链接】：2个真实的学术链接。格式：{'title': '名称', 'url': '真实URL'}"
    )
    saved_dialogues: List[Dict[str, str]] = Field(
        default_factory=list,
        description="【灵感采撷】：用户收藏的对话对，格式：{'q': '问题', 'a': '回答'}"
    )


class L3SemanticAnalyzer(AsyncLLMService):
    """L3 语义智能层：对单条清洗后的笔记进行深度结构化洞察"""

    def __init__(self):
        super().__init__()
        self.semaphore = asyncio.Semaphore(5)
        self.cache_file = os.path.join("data", "l3_semantic_cache.json")
        self.cache = self._load_cache()

    def _load_cache(self) -> Dict[str, dict]:
        if os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"无法读取 L3 缓存文件: {e}")
        return {}

    def _save_cache(self):
        try:
            os.makedirs(os.path.dirname(self.cache_file), exist_ok=True)
            with open(self.cache_file, "w", encoding="utf-8") as f:
                json.dump(self.cache, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning(f"无法保存 L3 缓存文件: {e}")

    async def analyze_block(self, book_title: str, block: dict) -> Optional[SemanticExtension]:
        core_concept = block.get("core_concept", "").strip()
        if not core_concept or len(core_concept) < 2:
            return None

        cache_key = hashlib.md5(f"{book_title}_{core_concept}".encode('utf-8')).hexdigest()

        if cache_key in self.cache:
            try:
                return SemanticExtension(**self.cache[cache_key])
            except Exception:
                pass

        async with self.semaphore:
            logger.info(f"🧠 L3 延伸分析中: {core_concept[:15]}...")

            schema_json = SemanticExtension.model_json_schema()

            prompt = f"""你是一个顶级的学术考据与思想延伸引擎。请根据提供的读书笔记片段以及原著上下文，为其构建一个具备"认知穿透力"的考据卡片。

【任务指令】
1. 识别：从笔记中识别出最不易理解的、具备高度信息密度的学术名词、典故或逻辑断层。
2. 解析：在「deep_trace」中进行深度考据，解释其在特定时空背景下的含义。
3. 关联：在「semantic_network」中提供关联词，必须明确说明关联逻辑（note），例如：'A是B的底层架构'。
4. 真实：references 必须提供真实存在的网页链接，不得伪造。

【当前分析的图书】
《{book_title}》

【笔记片段】
{block.get('markdown', '')}

【原著上下文】
{block.get('context_window', '无原文对照')}

请严格按照提供的 JSON Schema 输出，并保持学术严谨性：
{json.dumps(schema_json, ensure_ascii=False, indent=2)}
"""

            try:
                response = await self.client.chat.completions.create(
                    model=self.model_name,
                    messages=[
                        {"role": "system", "content": "你是一个严格输出 JSON 的高级学术延伸智能体，擅长识别并解析隐晦概念。"},
                        {"role": "user", "content": prompt}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.4, # 降低随机性，提升严谨度
                    timeout=60
                )

                result_str = response.choices[0].message.content
                extension = SemanticExtension.model_validate_json(result_str)

                self.cache[cache_key] = extension.model_dump()
                self._save_cache()

                return extension
            except Exception as e:
                logger.error(f"❌ L3 延伸失败 ({core_concept[:15]}): {e}")
                return None


class InkTraceBrain:
    """InkTrace 核心引擎：文本缝合 + 多源笔记结构化整理 + 安全联网增强 + 术语/引用生成"""

    def __init__(self, api_key: str, base_url: str, model_name: str,
                 max_chunk_words: int = 4000, stitch_temperature: float = 0.1,
                 restructure_temperature: float = 0.2, merge_temperature: float = 0.1,
                 enable_glossary: bool = True, enable_references: bool = True):
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.model = model_name
        self.max_chunk_words = max_chunk_words
        self.stitch_temperature = stitch_temperature
        self.restructure_temperature = restructure_temperature
        self.merge_temperature = merge_temperature
        self.enable_glossary = enable_glossary
        self.enable_references = enable_references

    # ------------------------------------------------------------------
    # 文本缝合（备用）
    # ------------------------------------------------------------------
    def stitch_texts(self, text_a: str, text_b: str) -> dict:
        """执行文本缝合术（修复重叠、断裂、标点丢失）"""
        user_input = f"片段A：{text_a}\n片段B：{text_b}"
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": STITCHING_SYSTEM_PROMPT},
                    {"role": "user", "content": user_input}
                ],
                response_format={"type": "json_object"},
                temperature=self.stitch_temperature
            )
            result_str = response.choices[0].message.content
            return json.loads(result_str)
        except Exception as e:
            logger.error(f"文本缝合失败: {e}")
            return {"status": "error", "pure_text": text_a + text_b}

    # ------------------------------------------------------------------
    # 主流程：多源笔记重塑
    # ------------------------------------------------------------------
    def restructure_by_topic(self, messy_text: str, full_text: str = "", max_workers: int = 5) -> str:
        """
        多源笔记重塑，支持原文辅助修复。
        full_text: 可选，用于规则修复引擎的原文全文。
        """
        logger.info("开始笔记结构化整理……")
        clean_text = clean_basic_noise(messy_text, full_text)

        chunks = split_by_source_as_chunks(
            clean_text,
            max_chunk_words=self.max_chunk_words
        )
        if not chunks:
            logger.warning("没有识别到任何有效笔记块，返回空字符串。")
            return ""

        logger.info(f"共拆分出 {len(chunks)} 个来源块，启用 {max_workers} 个并发线程。")

        # 为每本书获取背景信息（安全联网，失败则跳过）
        unique_sources = list({chunk["source"] for chunk in chunks})
        source_contexts = {}
        for src in unique_sources:
            ctx = self.retrieve_book_context(src)
            source_contexts[src] = ctx

        lock = Lock()
        restructured_parts = [None] * len(chunks)

        def process_single_chunk(idx: int, chunk: dict):
            source = chunk["source"]
            part = chunk["part"]
            try:
                current_part, total_parts = part.split("/")
            except ValueError:
                current_part, total_parts = "1", "1"

            # 预置背景信息
            context = source_contexts.get(source, "")
            enriched_text = context + "\n---\n" + chunk["text"] if context else chunk["text"]
            chunk["text"] = enriched_text

            prompt = SINGLE_SOURCE_RESTRUCTURER_PROMPT.format(
                source=source,
                part=f"{current_part}/{total_parts}",
                total_parts=total_parts,
                text=chunk["text"]
            )

            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "system", "content": prompt}],
                    temperature=self.restructure_temperature,
                    max_tokens=4096,
                    response_format={"type": "json_object"}
                )
                json_str = response.choices[0].message.content
                data = self._safe_json_parse(json_str)
            except Exception as e:
                logger.error(f"整理失败: {e}")
                return idx, source, chunk["text"]

            md_body = self._convert_structured_json_to_markdown(data)
            beautified_body = self.beautify_single_block(md_body)
            return idx, source, beautified_body

        start_time = time.time()
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(process_single_chunk, i, chunk) for i, chunk in enumerate(chunks)]
            completed = 0
            total = len(chunks)
            print(f"⏳ 开始并行处理 {total} 个笔记块...")
            for future in concurrent.futures.as_completed(futures):
                idx, source, body = future.result()
                with lock:
                    restructured_parts[idx] = (source, body)
                completed += 1
                elapsed = time.time() - start_time
                print(f"✅ 进度：{completed}/{total} 完成 → {source} (已耗时 {elapsed:.1f}秒)")

        print(f"\n✨ 全部分块整理完成，耗时 {time.time() - start_time:.0f} 秒。")
        print("🧩 正在按书籍合并笔记...")

        # 合并相同书名
        source_bodies = OrderedDict()
        for source, body in restructured_parts:
            if source not in source_bodies:
                source_bodies[source] = []
            source_bodies[source].append(body)

        merged_count = len(source_bodies)
        print(f"📖 已合并为 {merged_count} 本书的笔记，生成最终文档...")

        final_output = "# 📚 InkTrace 重塑笔记\n\n"
        for source, bodies in source_bodies.items():
            final_output += f"# {source}\n\n"
            final_output += "\n\n".join(bodies) + "\n\n---\n\n"
        final_output = final_output.rstrip('- \n')

        # 后处理：术语注释 + 参考文献
        if self.enable_glossary:
            glossary = self.generate_glossary(final_output)
            if glossary and glossary != "无":
                final_output += "\n\n---\n\n## 📖 术语注释\n" + glossary

        if self.enable_references:
            refs = self.generate_references(final_output)
            if refs and refs != "无":
                final_output += "\n\n---\n\n## 📚 参考文献\n" + refs

        return final_output

    # ------------------------------------------------------------------
    # 辅助方法
    # ------------------------------------------------------------------
    def _convert_structured_json_to_markdown(self, data: dict) -> str:
        lines = []
        for section in data.get("sections", []):
            heading = section.get("heading", "其他")
            lines.append(f"## {heading}")
            for note in section.get("notes", []):
                text = note.get("text", "")
                src = note.get("source", "")
                lines.append(f"- {text} {src}")
            lines.append("")
        return "\n".join(lines).strip()

    def beautify_single_block(self, markdown_text: str) -> str:
        prompt = BEAUTIFY_PROMPT.format(raw_markdown=markdown_text)
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": prompt}],
                temperature=0.0,
                max_tokens=2048
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"美化失败: {e}")
            return markdown_text

    def _safe_json_parse(self, text: str) -> dict:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        start = text.find('{')
        if start == -1:
            raise ValueError("未找到 JSON 对象")
        brace_count = 0
        for i in range(start, len(text)):
            if text[i] == '{':
                brace_count += 1
            elif text[i] == '}':
                brace_count -= 1
                if brace_count == 0:
                    return json.loads(text[start:i+1])
        raise ValueError("JSON 对象未闭合")

    def retrieve_book_context(self, source: str) -> str:
        query = build_safe_query(source)
        system_prompt = (
            "你是一个书籍信息助手。请使用网络搜索，用2-3句话简介以下书籍的核心主题与创作背景。"
            "禁止提及任何版权内容，只使用公开的书评或作者介绍。"
        )
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": query}
                ],
                temperature=0.1,
                max_tokens=200
            )
            context = response.choices[0].message.content.strip()
            logger.info(f"已获取《{source}》背景信息。")
            return f"\n【公开背景信息】（来源：网络搜索结果）\n{context}\n"
        except Exception as e:
            logger.warning(f"无法获取《{source}》背景：{e}")
            return ""

    def validate_document(self, document: str) -> str:
        prompt = VALIDATOR_PROMPT.format(document=document)
        logger.info("开始文档真实性校验...")
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": prompt}],
                temperature=0.1,
                max_tokens=2048
            )
            report = response.choices[0].message.content
            logger.info("校验完成。")
            return report
        except Exception as e:
            logger.error(f"校验时出错: {e}")
            return f"❌ 校验失败: {str(e)}"

    def generate_glossary(self, document: str) -> str:
        prompt = TERM_EXPLAINER_PROMPT.format(document=document)
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": prompt}],
                temperature=0.0,
                max_tokens=300
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.warning(f"术语生成失败: {e}")
            return ""

    def generate_references(self, document: str) -> str:
        prompt = CITATION_FORMATTER_PROMPT.format(document=document)
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": prompt}],
                temperature=0.0,
                max_tokens=400
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.warning(f"引用生成失败: {e}")
            return ""