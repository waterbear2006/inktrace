# backend/services/semantic_index.py
import os
import re
import json
import logging
import random
import numpy as np
from typing import List, Dict, Optional
from sentence_transformers import SentenceTransformer
import faiss

logger = logging.getLogger(__name__)

class LocalSemanticIndex:
    """基于 FAISS 和 Sentence-Transformers 的本地语义索引引擎"""
    
    def __init__(self, model_name: str = "paraphrase-multilingual-MiniLM-L12-v2"):
        self.index_dir = os.path.join("data", "index")
        self.index_path = os.path.join(self.index_dir, "index.faiss")
        self.metadata_path = os.path.join(self.index_dir, "metadata.json")
        
        # 加载 Embedding 模型 (首次运行会下载)
        logger.info(f"正在初始化 Embedding 模型: {model_name}...")
        self.model = SentenceTransformer(model_name)
        # 获取 embedding 维度：兼容不同版本的 sentence-transformers
        try:
            self.dimension = self.model.get_embedding_dimension()
        except AttributeError:
            # 旧版本或某些模型没有此方法，用 encode 一个空字符串来获取维度
            self.dimension = self.model.encode("").shape[0]
        
        # 初始化 FAISS 索引
        self.index = None
        self.metadata = []
        self._load_index()

    def _load_index(self):
        """从磁盘加载现有的索引和元数据"""
        if os.path.exists(self.index_path) and os.path.exists(self.metadata_path):
            try:
                self.index = faiss.read_index(self.index_path)
                with open(self.metadata_path, "r", encoding="utf-8") as f:
                    self.metadata = json.load(f)
                logger.info(f"✅ 成功加载本地索引，包含 {len(self.metadata)} 条笔记")
            except Exception as e:
                logger.error(f"❌ 加载索引失败: {e}，将重新初始化")
                self._init_new_index()
        elif os.path.exists(self.metadata_path):
            self._rebuild_index_from_metadata()
        else:
            self._init_new_index()

    def _rebuild_index_from_metadata(self):
        """从 metadata.json 重建 FAISS 索引（HF Spaces 部署后 index.faiss 不在仓库中）"""
        try:
            with open(self.metadata_path, "r", encoding="utf-8") as f:
                self.metadata = json.load(f)
            self.index = faiss.IndexFlatL2(self.dimension)
            if self.metadata:
                texts = [f"{m.get('core_concept', '')}: {m.get('markdown', '')}" for m in self.metadata]
                embeddings = self.model.encode(texts)
                self.index.add(np.array(embeddings).astype('float32'))
                self._save_index()
                logger.info(f"✅ 从 metadata.json 重建 FAISS 索引，包含 {len(self.metadata)} 条笔记")
        except Exception as e:
            logger.error(f"❌ 从 metadata 重建索引失败: {e}")
            self._init_new_index()

    def _init_new_index(self):
        """初始化一个新的平面索引 (适用于万级数据)"""
        self.index = faiss.IndexFlatL2(self.dimension)
        self.metadata = []
        logger.info("🆕 已初始化全新的语义索引库")

    def reload(self):
        """从磁盘重新加载索引（用于同步其他实例的写入）"""
        self._load_index()

    def rebuild_from_files(self):
        """
        扫描 data/output/ 下所有已处理的书，从文件系统重建整个索引。
        用于删除书籍后清理索引，或修复不一致状态。
        """
        import glob

        output_dir = os.path.join("data", "output")
        if not os.path.exists(output_dir):
            logger.warning("⚠️ data/output/ 目录不存在，跳过索引重建")
            self._init_new_index()
            self._save_index()
            return

        # 收集所有 _Notes.md 文件
        note_files = glob.glob(os.path.join(output_dir, "**", "*_Notes.md"), recursive=True)
        if not note_files:
            note_files = glob.glob(os.path.join(output_dir, "**", "*.md"), recursive=True)

        logger.info(f"🔨 开始从 {len(note_files)} 个文件中重建索引...")

        self._init_new_index()
        total_blocks = 0

        for filepath in note_files:
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception as e:
                logger.warning(f"⚠️ 跳过无法读取的文件 {filepath}: {e}")
                continue

            # 从 markdown 内容中提取真实书名（优先 ## 标题，其次 frontmatter，最后文件名）
            book_title = self._extract_book_title(content)
            if not book_title:
                basename = os.path.splitext(os.path.basename(filepath))[0]
                book_title = basename.replace("_Notes", "").strip()
            if not book_title:
                book_title = os.path.basename(os.path.dirname(filepath))

            # 解析 markdown 中的笔记块（每个块自带 book_title）
            blocks = self._parse_markdown_to_blocks(content, book_title)
            if blocks:
                # 按块的 book_title 分组入库
                blocks_by_book: dict[str, list] = {}
                for b in blocks:
                    bt = b.get("book_title", book_title)
                    blocks_by_book.setdefault(bt, []).append(b)
                for bt, bt_blocks in blocks_by_book.items():
                    self._add_blocks_internal(bt, bt_blocks)
                total_blocks += len(blocks)

        self._save_index()
        logger.info(f"✅ 索引重建完成: {len(note_files)} 本书, {total_blocks} 个笔记块")

    @staticmethod
    def _extract_book_title(content: str) -> str:
        """从 markdown 内容中提取真实书名。

        优先级：
        1. 第一个 `## 《xxx》` 标题中的书名
        2. frontmatter 中的 `book:` 字段
        3. 返回空字符串，由调用方回退到文件名
        """
        for line in content.split('\n'):
            stripped = line.strip()
            # 匹配 `## 《书名》` 或 `## 书名`
            m = re.match(r'^#{1,2}\s+[📖💡🔗📚]*\s*《?(.+?)》?\s*$', stripped)
            if m:
                title = m.group(1).strip()
                # 过滤掉明显是章节名的（如包含"第X章"、"一、"等）
                if title and not re.search(r'^第[一二三四五六七八九十\d]+[章节]', title):
                    return title
            # 匹配 frontmatter book: xxx
            m = re.match(r'^book:\s*(.+)$', stripped)
            if m:
                return m.group(1).strip()
        return ""

    def _parse_markdown_to_blocks(self, content: str, book_title: str) -> List[Dict]:
        """从清洗后的 markdown 中提取笔记块，供 rebuild 使用。

        追踪 `## 《书名》` 标题，确保每个块归属到正确的书。
        """
        blocks = []
        lines = content.split('\n')
        in_l3 = False
        l3_lines = []
        current_note: Dict | None = None
        current_book = book_title  # 默认使用文件名，但会被 ## 标题覆盖

        for line in lines:
            # 跳过 frontmatter
            stripped = line.strip()
            if stripped.startswith('---') or stripped.startswith('book:') or stripped.startswith('author:'):
                continue
            # 追踪书名标题：`## 《xxx》` 或 `## xxx`
            heading_match = re.match(r'^#{1,2}\s+[📖💡🔗📚]*\s*《?(.+?)》?\s*$', stripped)
            if heading_match:
                heading_title = heading_match.group(1).strip()
                # 过滤掉章节名
                if heading_title and not re.search(r'^第[一二三四五六七八九十\d]+[章节]', heading_title):
                    current_book = heading_title
                if current_note and current_note.get("markdown"):
                    current_note["book_title"] = current_book
                    blocks.append(current_note)
                current_note = None
                continue
            if stripped.startswith('<!-- L3_DATA_START'):
                if current_note and current_note.get("markdown"):
                    blocks.append(current_note)
                current_note = None
                in_l3 = True
                l3_lines = []
                continue
            if stripped.startswith('L3_DATA_END -->') or stripped == 'L3_DATA_END -->':
                in_l3 = False
                # L3 块是 AI 生成的语义分析，不是用户划线，不纳入每日回顾索引
                continue
            if in_l3:
                l3_lines.append(line)
                continue

            # 匹配普通笔记行
            note_match = re.match(r'^[▪\-]\s+(.+)', stripped)
            if note_match:
                if current_note and current_note.get("markdown"):
                    blocks.append(current_note)
                current_note = {"markdown": note_match.group(1), "core_concept": ""}
                continue

            # 续行或来源行
            if current_note and stripped and not stripped.startswith('>'):
                current_note["markdown"] = current_note.get("markdown", "") + " " + stripped

        if current_note and current_note.get("markdown"):
            current_note["book_title"] = current_book
            blocks.append(current_note)

        for b in blocks:
            b.setdefault("book_title", current_book)
            if not b.get("core_concept"):
                b["core_concept"] = b["markdown"][:40]

        return blocks

    def _add_blocks_internal(self, book_title: str, blocks: List[Dict]):
        """内部方法：不做去重检查，直接编码入库"""
        if not blocks:
            return

        import hashlib
        texts_to_encode = []
        new_metadata = []
        existing_hashes = {m.get("md5_hash") for m in self.metadata}

        for block in blocks:
            content = block.get("markdown", "")
            if not content:
                continue

            md5_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
            if md5_hash in existing_hashes:
                continue

            concept = block.get("core_concept", "未分类笔记")
            texts_to_encode.append(f"{concept}: {content}")
            new_metadata.append({
                "book_title": book_title,
                "core_concept": concept,
                "markdown": content,
                "md5_hash": md5_hash
            })

        if not texts_to_encode:
            return

        embeddings = self.model.encode(texts_to_encode)
        self.index.add(np.array(embeddings).astype('float32'))
        self.metadata.extend(new_metadata)

    def remove_by_book_title(self, book_title: str):
        """从索引中移除指定书的所有条目（通过过滤重建）"""
        before = len(self.metadata)
        self.metadata = [m for m in self.metadata if m.get("book_title") != book_title]
        removed = before - len(self.metadata)

        if removed > 0:
            # FAISS IndexFlatL2 不支持删除，需要重建
            if self.metadata:
                embeddings = self.model.encode([f"{m.get('core_concept', '')}: {m.get('markdown', '')}" for m in self.metadata])
                self.index = faiss.IndexFlatL2(self.dimension)
                self.index.add(np.array(embeddings).astype('float32'))
            else:
                self._init_new_index()
            self._save_index()
            logger.info(f"🗑️ 已从索引移除《{book_title}》的 {removed} 条记录")
        else:
            logger.info(f"ℹ️ 《{book_title}》在索引中没有记录")

    def _save_index(self):
        """将索引和元数据持久化到磁盘"""
        os.makedirs(self.index_dir, exist_ok=True)
        faiss.write_index(self.index, self.index_path)
        with open(self.metadata_path, "w", encoding="utf-8") as f:
            json.dump(self.metadata, f, ensure_ascii=False, indent=2)
        logger.info("💾 索引已成功同步至本地磁盘")

    def add_blocks(self, book_title: str, blocks: List[Dict]):
        """
        批量添加结构化笔记块。
        blocks 格式: [{"markdown": "...", "core_concept": "...", "context_window": "..."}]
        """
        self._add_blocks_internal(book_title, blocks)
        self._save_index()

    def search(self, query: str, top_k: int = 3) -> List[Dict]:
        """
        语义搜索最相关的笔记
        """
        if self.index.ntotal == 0:
            return []

        query_vector = self.model.encode([query])
        distances, indices = self.index.search(np.array(query_vector).astype('float32'), top_k)

        results = []
        for i, idx in enumerate(indices[0]):
            if idx != -1 and idx < len(self.metadata):
                res = self.metadata[idx].copy()
                res["distance"] = float(distances[0][i])
                results.append(res)

        return results

    def get_random_notes(self, k: int = 10, exclude_hashes: Optional[List[str]] = None) -> List[Dict]:
        """随机采样 k 条笔记，用于每日回顾。"""
        if not self.metadata:
            return []
        exclude_set = set(exclude_hashes or [])
        pool = [m for m in self.metadata if m.get("md5_hash", "") not in exclude_set]
        sample_size = min(k, len(pool))
        if sample_size == 0:
            return []
        sampled = random.sample(pool, sample_size)
        return [s.copy() for s in sampled]

    def get_notes_by_book(self, book_title: str, k: int = 20) -> List[Dict]:
        """获取某本书的笔记块列表。"""
        results = [m.copy() for m in self.metadata if m.get("book_title") == book_title]
        if len(results) > k:
            results = random.sample(results, k)
        return results

    def get_clusters(self, n_clusters: int = 5, min_books: int = 2) -> List[Dict]:
        """
        基于 FAISS 向量做简易主题聚类，返回跨书主题组。
        用 k-means 对索引中的向量聚类，每组取最近的几条作为代表。
        """
        if self.index.ntotal < n_clusters * 2:
            return []
        try:
            # 重建所有向量
            vectors = np.zeros((self.index.ntotal, self.dimension), dtype=np.float32)
            for i in range(len(self.metadata)):
                md = self.metadata[i].get("markdown", "")
                vec = self.model.encode([md])
                vectors[i] = vec[0].astype(np.float32)

            kmeans = faiss.Kmeans(self.dimension, n_clusters, niter=20, verbose=False)
            kmeans.train(vectors)
            _, assignments = kmeans.index.search(vectors, 1)

            # 每组取最近的条目，要求来自至少 2 本书
            clusters = []
            for c in range(n_clusters):
                indices = [i for i, a in enumerate(assignments.flatten()) if a == c]
                if not indices:
                    continue
                books_in_cluster = set()
                members = []
                for idx in indices:
                    md = self.metadata[idx]
                    books_in_cluster.add(md.get("book_title", ""))
                    members.append(md.copy())
                if len(books_in_cluster) < min_books:
                    continue
                clusters.append({
                    "cluster_id": c,
                    "book_count": len(books_in_cluster),
                    "books": list(books_in_cluster),
                    "members": members[:4],
                    "total_members": len(members),
                })
            return sorted(clusters, key=lambda x: x["book_count"], reverse=True)[:5]
        except Exception as e:
            logger.error(f"聚类失败: {e}")
            return []


# 模块级单例，确保所有消费者共享同一个索引实例
_default_index: LocalSemanticIndex | None = None

def get_index() -> LocalSemanticIndex:
    global _default_index
    if _default_index is None:
        _default_index = LocalSemanticIndex()
    return _default_index
