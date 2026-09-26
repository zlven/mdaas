/**
 * Tokenization — docs/02_TECH_SPEC.md §8.4
 *
 * The corpus and the queries are Chinese. `text.split(/\s+/)` on a Chinese
 * sentence returns one token for the whole sentence, which makes BM25 ask "does
 * this entire clause appear in the query" — retrieval that passes a smoke test
 * and returns nothing useful in practice.
 *
 * Two tokenizers, in order of preference:
 *
 *   1. `Intl.Segmenter` with `granularity: 'word'` — present in current Chrome,
 *      Safari and Firefox, and it segments Chinese into words.
 *   2. Character bigrams over each CJK run, plus lowercased Latin runs. Bigram
 *      BM25 is the established fallback for Chinese and is good enough at this
 *      corpus size (tens to low hundreds of chunks per agent).
 *
 * Corpus and query must be tokenized by the *same* implementation or the query
 * tokens will never match the index — the failure would look like "retrieval
 * doesn't work" with no error anywhere. Both go through `tokenize()` in one
 * browser session, so that holds by construction.
 */

/**
 * Han ideographs, including extension A and the compatibility block.
 *
 * Deliberately excludes CJK punctuation (`　`–`〿`) and fullwidth forms
 * (`＀`–`￯`): under the bigram fallback those must *break* a run rather
 * than join two characters that were never adjacent in a word.
 */
const HAN = /[㐀-䶿一-鿿豈-﫿]/;

/** The bigram fallback's own scan: Han runs and Latin/digit runs, in order. */
const RUN = /([㐀-䶿一-鿿豈-﫿]+)|([0-9A-Za-z]+)/g;

/**
 * A two-character word any Chinese dictionary segments as a single token.
 *
 * `Intl.Segmenter` can exist and still have no dictionary data behind it — a
 * runtime built without ICU's word-break tables exposes the constructor and then
 * returns one token per character. That would not throw; it would quietly turn
 * word segmentation into unigram matching and degrade every retrieval in the
 * product. So the segmenter is probed once with a word that is unambiguous.
 */
const PROBE = "会议";

let segmenter: Intl.Segmenter | null = null;
let probed = false;

function getSegmenter(): Intl.Segmenter | null {
  if (probed) return segmenter;
  probed = true;

  try {
    if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") return null;
    const candidate = new Intl.Segmenter("zh-Hans", { granularity: "word" });
    const tokens = [...candidate.segment(PROBE)].filter((s) => s.isWordLike);
    if (tokens.length === 1) segmenter = candidate;
  } catch {
    segmenter = null;
  }
  return segmenter;
}

function segmentWith(seg: Intl.Segmenter, text: string): string[] {
  const out: string[] = [];
  // The text goes to the segmenter untouched — CJK punctuation is not stripped
  // beforehand, because the segmenter uses it to find word boundaries. Filtering
  // happens after, on `isWordLike`.
  for (const part of seg.segment(text)) {
    if (!part.isWordLike) continue;
    const value = part.segment;
    out.push(HAN.test(value) ? value : value.toLowerCase());
  }
  return out;
}

function tokenizeByBigram(text: string): string[] {
  const out: string[] = [];
  RUN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = RUN.exec(text)) !== null) {
    const han = match[1];
    if (han !== undefined) {
      if (han.length === 1) {
        out.push(han);
      } else {
        for (let i = 0; i < han.length - 1; i++) out.push(han.slice(i, i + 2));
      }
      continue;
    }
    const latin = match[2];
    if (latin !== undefined) out.push(latin.toLowerCase());
  }

  return out;
}

/**
 * Function words that carry no retrieval signal in a Chinese query or corpus.
 *
 * Not an optimisation — a correctness fix, and the measurement is worth
 * recording. With ~50 chunks per agent, a term appearing in a single chunk gets
 * an IDF of about 3.6, so *any* incidental match lands in the same score band as
 * a real one. Measured against the office index:
 *
 *   今天天气怎么样   → 3.68  §工作汇报与状态罗列的区别   (via 怎么)
 *   推荐几部电影     → 3.56  §结论先行的组织方式        (via 推荐)
 *
 * These words match, the score looks like a real hit, and the floor in §8.3 —
 * which is a fraction of the top score — then has a junk score to anchor on.
 * Removing them from the index is the only fix that works: filtering the results
 * afterwards cannot, because the junk is already ranked first.
 *
 * A coverage rule ("a hit must match two query terms") was measured and rejected.
 * For `OKR 怎么写` it discarded the chunk containing OKR — the single most
 * specific term in the query — and kept one matching 写 and 怎么 instead. It
 * inverts the ranking it was meant to clean up.
 *
 * Latin has no equivalent list here; the corpus is Chinese and a stray English
 * function word would need to be in the corpus to score at all.
 *
 * The boundary is "carries no topical information", and generic verbs sit on the
 * wrong side of it. 做 and 写 were tried and removed again: a `X 怎么做` query
 * uses them to find procedural sections, and dropping them demoted
 * `项目复盘怎么做` from §复盘的基本步骤 to a weaker neighbouring section. They
 * only look like noise on a query from another domain (红烧肉怎么做), and that
 * case is the corpus's answer to give, not the tokenizer's.
 */
const STOPWORDS = new Set([
  // Particles, prepositions, conjunctions
  "的", "了", "是", "在", "和", "与", "及", "或", "也", "都", "就", "还", "很", "太", "更", "最",
  "因为", "所以", "但是", "但", "而且", "并且", "然后", "如果", "虽然", "即使", "而",
  // Pronouns and demonstratives
  "我", "你", "他", "她", "它", "我们", "你们", "他们", "这", "那", "这个", "那个", "这些", "那些",
  // Interrogatives
  "什么", "怎么", "怎么样", "怎样", "如何", "为什么", "哪些", "哪个", "多少", "是否",
  // Modals and generic verbs a question is wrapped in
  "可以", "能", "会", "要", "想", "该", "应该", "需要", "请", "帮我", "请问", "有没有", "一下",
  // Measure words and quantifiers
  "一个", "一些", "一点", "个", "部", "只", "条", "张", "次", "种", "些", "件", "位",
  // Locatives and time
  "上", "下", "里", "外", "前", "后", "中", "内", "时候", "现在", "今天", "明天", "昨天",
]);

export function tokenize(text: string): string[] {
  const seg = getSegmenter();
  const raw = seg ? segmentWith(seg, text) : tokenizeByBigram(text);
  return raw.filter((token) => !STOPWORDS.has(token));
}
