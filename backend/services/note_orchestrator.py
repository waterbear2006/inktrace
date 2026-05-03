# backend/services/note_orchestrator.py
import logging
import os
import re
import asyncio
from typing import Dict
from backend.services.parsers import KindleParser, LLMParser # 引入解析器
from backend.services.cleaner_pipeline import DataCleaningPipeline
from backend.services.book_matcher import BookMatcherService
from backend.services.llm_service import L3SemanticAnalyzer
from backend.services.semantic_index import LocalSemanticIndex
from backend.services.exporters import MarkdownExporter

logger = logging.getLogger(__name__)

class NoteRouter:
    """智能解析路由分发器"""
    def __init__(self):
        # 优先级极其重要！把免费、极速的正则解析器放前面，把烧钱的 AI 放最后面
        self.parsers = [KindleParser(), LLMParser()]
        
    async def route_and_parse(self, raw_text: str) -> Dict[str, str]:
        for parser in self.parsers:
            if parser.identify(raw_text):
                logger.info(f"✅ 路由匹配成功: 正在使用 {parser.__class__.__name__} 进行切分")
                return await parser.parse(raw_text)
        return {"未分类笔记": raw_text} # 理论上不会走到这里，因为有 LLM 兜底

class NoteOrchestrator:
    """全局业务调度中枢"""
    def __init__(self):
        self.router = NoteRouter()
        self.matcher = BookMatcherService()
        self.cleaner = DataCleaningPipeline()
        self.l3_analyzer = L3SemanticAnalyzer()
        self.l4_index = LocalSemanticIndex()
        self.exporter = MarkdownExporter()

    async def process_all_notes(self, raw_text: str, enable_l3: bool = False, enable_l4: bool = False, on_progress=None) -> str:
        """主大动脉：传入一整坨脏数据，返回一整篇干净漂亮的 Markdown"""
        
        # 1. 路由分发，切分出处
        if on_progress: await on_progress(10, "L1: 解析原始笔记结构...")
        note_chunks = await self.router.route_and_parse(raw_text)
        
        final_markdown_blocks = []
        
        # 2. 循环处理每一本书
        for book_title, book_notes in note_chunks.items():
            logger.info(f"⚙️ 正在处理图书: 《{book_title}》")
            
            # 3. 猎人去寻找原著
            if on_progress: await on_progress(20, "L2: 匹配原著全文...")
            matched_filename, match_msg = self.matcher.find_best_match(book_title)
            
            full_text = ""
            if matched_filename:
                logger.info(f"  ✨ 原著匹配成功 ({match_msg}) -> 激活 L2 修复")
                full_text = self.matcher.read_book_content(matched_filename)
            else:
                logger.warning(f"  ⚠️ 原著匹配失败 ({match_msg}) -> 优雅降级，跳过 L2")

            # 4. 清洗流水线开动！
            if on_progress: await on_progress(28, "清洗中: 剔除冗余噪声...")
            clean_chunk = self.cleaner.run(raw_text=book_notes, full_text=full_text)
            structured_blocks = self.cleaner.get_structured_blocks()
            
            # 5. L3 语义延伸层 (按需开启)
            if enable_l3 and structured_blocks:
                total_blocks = len(structured_blocks)
                logger.info(f"🧠 开启 L3 并发分析，共 {total_blocks} 个区块...")
                
                # 为了让进度条动起来，我们不再用 asyncio.gather 一把梭
                # 而是创建一个带进度的处理逻辑
                extensions = [None] * total_blocks
                completed = 0
                
                async def analyze_with_progress(idx, block):
                    nonlocal completed
                    ext = await self.l3_analyzer.analyze_block(book_title, block)
                    extensions[idx] = ext
                    completed += 1
                    if on_progress:
                        # 在 30% 到 80% 之间动态增加进度
                        dynamic_progress = 30 + int((completed / total_blocks) * 50)
                        await on_progress(dynamic_progress)
                
                tasks = [analyze_with_progress(i, b) for i, b in enumerate(structured_blocks)]
                await asyncio.gather(*tasks)
                
                final_book_lines = []
                for block, ext in zip(structured_blocks, extensions):
                    md = block["markdown"]
                    if ext:
                        # 绑定原文和 L3 数据，确保前端可以进行对比
                        md += f"\n<!-- L3_DATA_START\n"
                        md += f"term: {ext.distilled_title}\n"
                        md += f"explanation: {ext.deep_trace}\n"
                        md += f"context: {ext.original_echo}\n"
                        md += f"cognitive: {ext.cognitive_extension}\n"
                        md += f"original: {block.get('raw_text', '无原文对照')[:200]}...\n"
                        md += f"tags: {', '.join(ext.tags)}\n"
                        network_items = [f'{item.get("term")}:{item.get("note") or "深度关联逻辑待补充"}' for item in ext.semantic_network]
                        network_str = ' | '.join(network_items)
                        ref_items = [f'{ref.get("title")}|{ref.get("url")}' for ref in ext.references]
                        ref_str = ' , '.join(ref_items)
                        
                        md += f"network: {network_str}\n"
                        md += f"references: {ref_str}\n"
                        
                        dialogue_items = [f'{d.get("q")}|{d.get("a")}' for d in (ext.saved_dialogues or [])]
                        dialogue_str = ' || '.join(dialogue_items)
                        md += f"dialogues: {dialogue_str}\n"
                        
                        md += f"L3_DATA_END -->"
                    
                    final_book_lines.append(md)
                    # 反向更新 block 里的 markdown，供 L4 导出使用
                    block["markdown"] = md
                    
                book_markdown = f"## 📖 《{book_title}》\n\n" + "\n\n".join(final_book_lines) + "\n"
            else:
                book_markdown = f"## 📖 《{book_title}》\n\n{clean_chunk}\n"
            
            # 6. L4 资产化集成 (按需开启) - 即使无原著也要保存文件
            if enable_l4:
                logger.info(f"📦 正在执行 L4 资产化：保存清洗结果...")
                if on_progress: await on_progress(85)
                
                # 如果有结构化块，更新语义索引
                if structured_blocks:
                    await asyncio.to_thread(self.l4_index.add_blocks, book_title, structured_blocks)
                
                # 始终导出到 Obsidian（确保文件持久化到磁盘）
                await asyncio.to_thread(self.exporter.export_to_obsidian, book_title, "Unknown Author", book_markdown)
                logger.info(f"✅ 已保存到磁盘: {book_title}")
                
                if on_progress: await on_progress(95)
            
            # 7. 装盘
            final_markdown_blocks.append(book_markdown)
            
        return "\n---\n\n".join(final_markdown_blocks)

    def update_saved_dialogue(self, book_title: str, block_idx: int, question: str, answer: str):
        """物理持久化：将对话沉淀进 Markdown 文件的元数据区"""
        # 尝试探测真实存在的路径
        safe_title = "".join([c for c in book_title if c.isalnum() or c in (' ', '-', '_')]).strip()
        possible_paths = [
            os.path.join("data", "output", book_title, f"{book_title}_Notes.md"),
            os.path.join("data", "output", f"{book_title}_Notes.md"),
            os.path.join("data", "inktrace_obsidian", "Cleaning Extracts", f"{safe_title}.md")
        ]
        
        filepath = None
        for p in possible_paths:
            if os.path.exists(p):
                filepath = p
                break
        
        # 兜底：全局扫描 data/output/ 目录下所有 _Notes.md 文件
        if not filepath:
            import glob
            all_notes = glob.glob(os.path.join("data", "output", "**", "*_Notes.md"), recursive=True)
            if all_notes:
                filepath = all_notes[0]  # 取第一个找到的文件
                logger.warning(f"⚠️ 直接路径未命中，兜底使用: {filepath}")
        
        if not filepath:
            logger.error(f"❌ 无法定位笔记文件。尝试路径: {possible_paths}")
            return False
            
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                
            blocks = content.split('\n\n')
            # 找到所有包含 L3 元数据的块
            l3_block_indices = [i for i, b in enumerate(blocks) if '<!-- L3_DATA_START' in b]
            
            if block_idx >= len(l3_block_indices):
                logger.error(f"❌ 索引越界: {block_idx} / {len(l3_block_indices)}")
                return False
                
            # 使用更健壮的切分方式
            target_idx = l3_block_indices[block_idx]
            target_block = blocks[target_idx]
            
            # 使用 pinned_dialogues 避免与现有的 dialogue 冲突
            field_name = "pinned_dialogues"
            new_entry = f"{question}|{answer}"
            
            # 查找是否已有该字段 (支持跨行或行尾)
            pattern = rf'{field_name}: (.*?)(?=\n|$)'
            match = re.search(pattern, target_block)
            
            if match:
                old_val = match.group(1).strip()
                new_val = f"{old_val} || {new_entry}" if old_val else new_entry
                new_block = target_block.replace(f"{field_name}: {old_val}", f"{field_name}: {new_val}")
            else:
                # 插入新字段，放在 L3_DATA_END 之前
                new_block = target_block.replace("L3_DATA_END -->", f"{field_name}: {new_entry}\nL3_DATA_END -->")
            
            blocks[target_idx] = new_block
            
            blocks[target_idx] = new_block
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write('\n\n'.join(blocks))
                
            logger.info(f"✅ 对话已成功沉淀至: {book_title} [块 {block_idx}]")
            return True
        except Exception as e:
            logger.error(f"❌ 保存对话失败: {e}")
            return False
