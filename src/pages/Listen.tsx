import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listBooks } from "../api/listen";
import type { WordBook } from "../../worker/src/db";

export function Listen() {
  const [books, setBooks] = useState<WordBook[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    listBooks()
      .then(setBooks)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "单词书加载失败"));
  }, []);
  return (
    <div className="container">
      <h1 className="page-title">选择单词书</h1>
      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {books.length === 0 && !error && <p className="empty">暂无单词书，请先在管理后台创建。</p>}
      <ul className="card-list">
        {books.map((b) => (
          <li key={b.id}>
            <Link className="card card-link" to={`/listen/${b.id}`}>
              <span className="card-title">{b.name}</span>
              {b.description ? <span className="card-desc">{b.description}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
