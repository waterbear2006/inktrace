# backend/services/exporters.py
import os
import yaml
import datetime
import re
from typing import List, Dict

class MarkdownExporter:
    """针对 Obsidian 优化并支持多种适配器的导出引擎"""
    
    def __init__(self, output_base_dir: str = "data/output"):
        self.output_base_dir = output_base_dir

    def export_to_obsidian(self, book_title: str, author: str, content: str) -> str:
        """导出为包含 Frontmatter 的 Obsidian 友好格式"""
        
        # 准备 Frontmatter
        frontmatter = {
            "book": book_title,
            "author": author,
            "exported_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "source": "InkTrace Engine",
            "tags": ["InkTrace", "ReadingNotes"]
        }
        
        fm_str = "---\n" + yaml.dump(frontmatter, allow_unicode=True) + "---\n\n"
        final_content = fm_str + content
        
        # 按照书名建立文件夹
        folder_path = os.path.join(self.output_base_dir, book_title)
        os.makedirs(folder_path, exist_ok=True)
        
        # 清理非法字符作为文件名
        safe_title = re.sub(r'[\\/:*?"<>|]', '_', book_title)
        file_path = os.path.join(folder_path, f"{safe_title}_Notes.md")
        
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(final_content)
            
        return file_path

class TencentDocsAdapter:
    """腾讯文档智能文档适配器"""
    
    @staticmethod
    def format_for_tencent(content: str) -> str:
        """
        腾讯文档对 Markdown 的特定语法对齐：
        1. 将 Obsidian Callouts (> [!NOTE]) 转换为标准的 > 引用块
        2. 将 details/summary HTML 标签转换为腾讯文档可解析的加粗/分隔线
        """
        # 将 <details> 替换为分隔符
        # 我们先移除所有 details 标签，因为腾讯文档目前不支持交互折叠
        content = content.replace("<details>", "\n\n---\n")
        content = content.replace("</details>", "\n---\n")
        
        # 将 summary 标签转换为四级标题样式
        content = content.replace("<summary>", "#### ")
        content = content.replace("</summary>", "")
        
        # 将 Obsidian Callouts 降级为标准引用
        # 匹配格式如: > [!QUOTE] 延伸阅读
        content = re.sub(r'> \[!.*?\]\s*(.*)', r'> **\1**', content)
        
        return content

    @staticmethod
    def get_rich_content(content: str) -> str:
        """返回适配腾讯文档粘贴的富文本 Markdown 内容"""
        return TencentDocsAdapter.format_for_tencent(content)
