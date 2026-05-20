import os
import time
from dotenv import load_dotenv
from backend.services.llm_service import InkTraceBrain
from backend.services.cleaner_pipeline import clean_basic_noise, split_by_source_as_chunks

def run_document_test():
    load_dotenv()
    API_KEY = os.getenv("DEEPSEEK_API_KEY")
    BASE_URL = "https://api.deepseek.com"
    MODEL_NAME = "deepseek-chat"

    if not API_KEY:
        print("🚨 错误: 未读取到 API_KEY，请检查 .env 文件。")
        return

    input_notes_path = os.path.join("data", "raw_notes", "dirty_sample_2.txt")
    source_book_path = os.path.join("data", "source_books", "source_full.txt")
    output_path = os.path.join("data", "output", "clean_result_2.md")

    if not os.path.exists(input_notes_path):
        print(f"🚨 错误: 找不到测试数据 {input_notes_path}")
        return

    with open(input_notes_path, "r", encoding="utf-8") as f:
        messy_text = f.read()

    overall_start = time.time()

    print("=" * 50)
    print("🛠️  InkTrace 文档级重塑测试启动")
    print("=" * 50)
    print(f"📂 读取脏数据: {input_notes_path} (共 {len(messy_text)} 字符)")

    # 提前分块，用于验证
    clean = clean_basic_noise(messy_text)
    chunks = split_by_source_as_chunks(clean)
    expected_sources = set(ch["source"] for ch in chunks)
    print(f"📚 已识别 {len(expected_sources)} 本书籍，共拆分为 {len(chunks)} 个处理单元。")
    print("⚙️ 正在并行调用 AI 进行笔记整理与美化，请稍候...\n")

    engine = InkTraceBrain(api_key=API_KEY, base_url=BASE_URL, model_name=MODEL_NAME)

    clean_markdown = engine.restructure_by_topic(messy_text)

    # 验证是否有书籍缺失
    missing = [s for s in expected_sources if s not in clean_markdown]
    if missing:
        print(f"⚠️ 警告：以下来源未在最终输出中出现：{missing}")
    else:
        print("✅ 所有来源均已在最终文档中出现。")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(clean_markdown)

    total_time = time.time() - overall_start
    print("✨ 重塑完成！")
    print(f"💾 纯净文档已导出至: {output_path}")
    print(f"⏱️ 总用时 {total_time:.1f} 秒。")
    print("\n💡 提示：以上笔记已按主题整理完毕，建议你基于这些原材料，写下自己的思考和关联。")
    print("=" * 50)

if __name__ == "__main__":
    run_document_test()