import type { ParagraphAnalysis } from "../../worker/src/db";

type ArticleAnalysisPanelProps = {
  analysis: ParagraphAnalysis;
};

export function ArticleAnalysisPanel({ analysis }: ArticleAnalysisPanelProps) {
  return (
    <div className="article-analysis" aria-label="段落分析">
      <details className="analysis-disclosure">
        <summary>段落翻译 & 表达积累</summary>
        <div className="analysis-content">
          <section className="analysis-section">
            <h4>段落翻译</h4>
            <p className="analysis-translation">{analysis.translation}</p>
          </section>
          <section className="analysis-section">
            <h4>最值得积累的英语表达</h4>
            {analysis.expressions.length > 0 ? (
              <div className="analysis-highlight-list">
                {analysis.expressions.map((expression, index) => (
                  <div className="analysis-word" key={`${expression.text}-${index}`}>
                    <strong className="analysis-word__text">{expression.text}</strong>
                    <span className="analysis-word__definition"><span>{expression.meaning}</span>{expression.usage && <em> | {expression.usage}</em>}</span>
                  </div>
                ))}
              </div>
            ) : <p className="muted">本段暂无值得积累的表达。</p>}
          </section>
        </div>
      </details>
    </div>
  );
}
