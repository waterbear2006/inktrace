# backend/services/semantic_index.py
import os
import json
import logging
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
        else:
            self._init_new_index()

    def _init_new_index(self):
        """初始化一个新的平面索引 (适用于万级数据)"""
        self.index = faiss.IndexFlatL2(self.dimension)
        self.metadata = []
        logger.info("🆕 已初始化全新的语义索引库")

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
        if not blocks:
            return
            
        # 准备待编码的文本列表 (以 core_concept 为主，辅以 markdown 内容)
        texts_to_encode = []
        new_metadata = []
        
        # 为了防止重复索引，我们基于 markdown 内容的哈希进行去重检测（可选）
        existing_hashes = {m.get("md5_hash") for m in self.metadata}
        
        import hashlib
        for block in blocks:
            content = block.get("markdown", "")
            if not content: continue
            
            md5_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
            if md5_hash in existing_hashes:
                continue
                
            # 我们将 core_concept 权重加大，放入编码文本
            concept = block.get("core_concept", "未分类笔记")
            # 编码内容: 标题 + 笔记正文
            texts_to_encode.append(f"{concept}: {content}")
            
            new_metadata.append({
                "book_title": book_title,
                "core_concept": concept,
                "markdown": content,
                "md5_hash": md5_hash
            })

        if not texts_to_encode:
            logger.info("ℹ️ 没有发现新的笔记内容，跳过索引更新")
            return

        logger.info(f"🚀 正在为 {len(texts_to_encode)} 条新笔记生成向量编码...")
        embeddings = self.model.encode(texts_to_encode)
        
        # 添加到 FAISS 索引
        self.index.add(np.array(embeddings).astype('float32'))
        self.metadata.extend(new_metadata)
        
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
