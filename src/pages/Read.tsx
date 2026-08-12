import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listArticles } from "../api/articles";
import type { ArticleGroup } from "../api/articles";

export function Read() {
  const [groups, setGroups] = useState<ArticleGroup[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    listArticles()
      .then(setGroups)
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  return (
    <div className="container">
      <h1 className="page-title">阅读时间线</h1>
      {error && <p className="alert alert--error">{error}</p>}
      {groups.length === 0 && !error && <p className="empty">暂无文章</p>}
      {groups.map((g) => (
        <section key={g.date}>
          <h2 className="section-title">{g.date}</h2>
          <ul className="card-list">
            {g.articles.map((a) => (
              <li key={a.id}>
                <Link className="card card-link" to={`/read/${a.id}`}>
                  <span className="card-title">{a.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
