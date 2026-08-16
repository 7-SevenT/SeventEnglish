import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listUnits } from "../api/listen";
import type { Unit } from "../../worker/src/db";

export function BookUnits() {
  const { bookId } = useParams();
  const [units, setUnits] = useState<Unit[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!bookId) return;
    setError("");
    listUnits(Number(bookId))
      .then(setUnits)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "单元加载失败"));
  }, [bookId]);
  return (
    <div className="container">
      <Link className="back-link" to="/listen">← 返回单词书</Link>
      <h1 className="page-title">选择单元</h1>
      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {units.length === 0 && !error && <p className="empty">暂无单元。</p>}
      <ul className="card-list">
        {units.map((u) => (
          <li key={u.id}>
            <Link className="card card-link" to={`/listen/${bookId}/${u.id}`}>
              <span className="card-title">{u.name}</span>
              <span className="card-meta">#{u.id}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
