import type { ParagraphAnalysis } from "../../worker/src/db";

type ArticleAnalysisPanelProps = {
  analysis: ParagraphAnalysis;
};

export function ArticleAnalysisPanel({ analysis }: ArticleAnalysisPanelProps) {
  return (
    <div className="article-analysis" aria-label="段落分析">
      <details className="analysis-disclosure">
        <summary>本段词汇 & 句型解析</summary>
        <div className="analysis-content">
          <section className="analysis-section">
            <h4>重点词/短语</h4>
            {analysis.highlights.length > 0 ? (
              <div className="analysis-highlight-list">
                {analysis.highlights.map((highlight, index) => (
                  <div className="analysis-word" key={`${highlight.text}-${index}`}>
                    <strong className="analysis-word__text">{highlight.text}</strong>
                    <span className="analysis-word__definition"><span>{highlight.meaning}</span>{highlight.usage && <em> | {highlight.usage}</em>}</span>
                  </div>
                ))}
              </div>
            ) : <p className="muted">本段暂无重点词汇。</p>}
          </section>
          <section className="analysis-section">
            <h4>段落翻译</h4>
            <p className="analysis-translation">{analysis.translation}</p>
          </section>
          {analysis.writing_sentences.length > 0 && (
            <section className="analysis-section">
              <h4>雅思句型分析</h4>
              <div className="analysis-sentence-list">
                {analysis.writing_sentences.slice(0, 1).map((sentence, index) => (
                  <div className="analysis-sentence" key={`${sentence.text}-${index}`}>
                    <p className="analysis-sentence__english">{sentence.text}</p>
                    <p className="analysis-sentence__analysis">{sentence.translation} {sentence.usage}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </details>
    </div>
  );
}
