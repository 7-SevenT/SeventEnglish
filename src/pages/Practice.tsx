import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { listWords } from "../api/listen";
import type { Word } from "../../worker/src/db";
import { parseAnswer, isCorrectInput } from "../lib/answer";
import type { ParsedAnswer } from "../lib/answer";

interface RoundItem {
  id: number;
  word: string;
  audioUrl: string;
  parsed: ParsedAnswer;
}

type Phase = "loading" | "ready" | "submitted" | "done";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function Practice() {
  const { unitId } = useParams();

  const [phase, setPhase] = useState<Phase>("loading");
  const [pool, setPool] = useState<RoundItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, boolean>>({});
  const [wrongIds, setWrongIds] = useState<Set<number>>(new Set());
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isPlayed, setIsPlayed] = useState<boolean[]>([]);
  const [totalRounds, setTotalRounds] = useState(1);

  // Refs to avoid stale closures in audio event handlers
  const activeIndexRef = useRef<number | null>(null);
  const poolRef = useRef<RoundItem[]>([]);
  const isPlayingRef = useRef(false);
  const replayModeRef = useRef(false); // true when playing a single non-current item
  const autoSequenceIndexRef = useRef<number | null>(null); // saved auto-sequence index before replay
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);
  useEffect(() => {
    poolRef.current = pool;
  }, [pool]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Load words on mount
  useEffect(() => {
    if (!unitId) return;
    let cancelled = false;
    listWords(Number(unitId))
      .then((words) => {
        if (cancelled) return;
        if (words.length === 0) {
          setPhase("done");
          return;
        }
        const items: RoundItem[] = words.map((w: Word) => ({
          id: w.id,
          word: w.word,
          audioUrl: `/api/audio?key=${encodeURIComponent(w.audio_key)}`,
          parsed: parseAnswer(w.word),
        }));
        setPool(shuffle(items));
        setIsPlayed(new Array(items.length).fill(false));
        setPhase("ready");
      })
      .catch(() => {
        if (!cancelled) setPhase("done");
      });
    return () => {
      cancelled = true;
    };
  }, [unitId]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function clearTimer() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function playItem(i: number) {
    clearTimer();
    const p = poolRef.current;
    if (i < 0 || i >= p.length) return;
    setActiveIndex(i);
    activeIndexRef.current = i;
    const audio = audioRef.current;
    if (audio) {
      audio.src = p[i].audioUrl;
      audio.load();
      const playPromise = audio.play();
      if (playPromise) {
        playPromise.catch(() => {
          // Autoplay may be blocked; ignore silently
        });
      }
    }
  }

  function onEnded() {
    // Mark current as played
    const idx = activeIndexRef.current;
    if (idx !== null) {
      setIsPlayed((prev) => {
        const next = [...prev];
        next[idx] = true;
        return next;
      });
    }

    // If replay mode (single listen of non-current item), stop or resume auto sequence
    if (replayModeRef.current) {
      replayModeRef.current = false;
      // If auto-play was active before replay, resume the auto sequence
      if (isPlayingRef.current) {
        const savedIdx = autoSequenceIndexRef.current;
        const p = poolRef.current;
        if (savedIdx !== null && savedIdx < p.length - 1) {
          timer.current = setTimeout(() => {
            playItem(savedIdx + 1);
          }, 5000);
        } else {
          // Was at last item when replay interrupted
          setIsPlaying(false);
          setIsFinished(true);
        }
      }
      return;
    }

    // Auto-sequence: advance if not finished
    if (!isPlayingRef.current) return;
    const p = poolRef.current;
    if (idx !== null && idx < p.length - 1) {
      timer.current = setTimeout(() => {
        playItem(idx + 1);
      }, 5000);
    } else {
      // All done
      setIsPlaying(false);
      setIsFinished(true);
    }
  }

  function togglePlay() {
    if (phase !== "ready") return;
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      // Pause
      audio.pause();
      clearTimer();
      setIsPlaying(false);
    } else {
      // Start or resume
      setIsPlaying(true);
      setIsFinished(false);
      replayModeRef.current = false;
      if (activeIndex === null) {
        playItem(0);
      } else {
        // Resume from current position
        const playPromise = audio.play();
        if (playPromise) {
          playPromise.catch(() => {});
        }
      }
    }
  }

  /**
   * Replay scheme (simplified, bug-resistant):
   * - Clicking the dot for the CURRENT active index during auto-play:
   *   replays that item and continues the auto sequence afterwards.
   * - Clicking any other dot: plays that single item once, then stops.
   *   Does NOT affect the auto sequence state or enable submit.
   */
  function playSingle(audioUrl: string, dotIndex: number) {
    if (phase !== "ready") return;
    clearTimer();
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying && dotIndex === activeIndexRef.current) {
      // Replaying current item in auto sequence — stay in auto mode
      replayModeRef.current = false;
      audio.src = audioUrl;
      audio.load();
      const playPromise = audio.play();
      if (playPromise) playPromise.catch(() => {});
    } else {
      // Single replay of a different item (or paused state)
      // Save the auto-sequence position BEFORE overwriting activeIndex
      autoSequenceIndexRef.current = activeIndexRef.current;
      replayModeRef.current = true;
      setActiveIndex(dotIndex);
      activeIndexRef.current = dotIndex;
      audio.src = audioUrl;
      audio.load();
      const playPromise = audio.play();
      if (playPromise) playPromise.catch(() => {});
    }
  }

  function setInput(id: number, value: string) {
    setInputs((prev) => ({ ...prev, [id]: value }));
  }

  function submit() {
    const res: Record<number, boolean> = {};
    const wrong: number[] = [];
    for (const item of pool) {
      const c = isCorrectInput(inputs[item.id] ?? "", item.parsed);
      res[item.id] = c;
      if (!c) wrong.push(item.id);
    }
    setResults(res);
    setPhase("submitted");
    setWrongIds(new Set(wrong));
    setIsPlaying(false);
    clearTimer();
  }

  function goNextRound() {
    const wrongItems = pool.filter((x) => wrongIds.has(x.id));
    if (wrongItems.length === 0) {
      setPhase("done");
    } else {
      setPool(shuffle(wrongItems));
      setInputs({});
      setResults({});
      setWrongIds(new Set());
      setActiveIndex(null);
      setIsPlayed(new Array(wrongItems.length).fill(false));
      setIsFinished(false);
      setIsPlaying(false);
      setPhase("ready");
      setTotalRounds((r) => r + 1);
      clearTimer();
    }
  }

  const canSubmit = isFinished && phase === "ready";

  return (
    <div className="container container--wide">
      <Link className="back-link" to="/listen">
        ← 返回
      </Link>
      <div className="practice-card">
        <h1 className="page-title">听写练习</h1>

        {phase === "loading" && <p className="empty">加载中...</p>}

        {phase === "done" && (
          <div style={{ textAlign: "center" }}>
            <p className="feedback feedback--correct">
              本单元练习完成 🎉
            </p>
            <p className="listen-rounded">共 {totalRounds} 轮</p>
          </div>
        )}

        {(phase === "ready" || phase === "submitted") && (
          <>
            <p className="listen-rounded">
              第 {totalRounds} 轮 · {pool.length} 题
              {phase === "submitted" && " · 已提交"}
            </p>

            {/* Dot navigation */}
            <div className="listen-dots">
              {pool.map((item, i) => (
                <button
                  key={item.id}
                  className={
                    "listen-dot" +
                    (activeIndex === i ? " listen-dot--active" : "") +
                    (isPlayed[i] ? " listen-dot--done" : "")
                  }
                  onClick={() => playSingle(item.audioUrl, i)}
                  title={item.parsed.full}
                  aria-label={`复听 ${i + 1}`}
                />
              ))}
            </div>

            {/* Play/Pause control */}
            {phase !== "submitted" && (
              <div className="listen-controls">
                <button
                  className="btn btn--primary"
                  onClick={togglePlay}
                  disabled={phase !== "ready"}
                >
                  {isPlaying ? "暂停" : activeIndex === null ? "开始播放" : "继续播放"}
                </button>
              </div>
            )}

            {/* Word grid: 4 cells per row, each numbered */}
            <div className="listen-grid">
              {pool.map((item, i) => {
                const result = results[item.id];
                const num = i + 1;
                return (
                  <div
                    key={item.id}
                    className={
                      "listen-cell" +
                      (activeIndex === i ? " listen-cell--active" : "") +
                      (result === true ? " listen-cell--correct" : "") +
                      (result === false ? " listen-cell--wrong" : "")
                    }
                  >
                    <div className="listen-cell-input">
                      <span className="listen-idx">{num}</span>
                      {item.parsed.prefix && (
                        <span className="listen-prefill">{item.parsed.prefix}</span>
                      )}
                      <input
                        className="input listen-digits"
                        value={inputs[item.id] ?? ""}
                        onChange={(e) => setInput(item.id, e.target.value)}
                        disabled={phase === "submitted"}
                      />
                      {item.parsed.suffix && (
                        <span className="listen-prefill">{item.parsed.suffix}</span>
                      )}
                    </div>
                    {result !== undefined && (
                      <span
                        className={
                          "listen-feedback" +
                          (result ? " listen-feedback--right" : " listen-feedback--wrong")
                        }
                        title="点击圆点可复听"
                      >
                        {result ? "✓" : `✗ ${item.parsed.full}`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Submit / Next round */}
            <div className="practice-actions" style={{ marginTop: "var(--space-4)" }}>
              {phase === "ready" && (
                <button
                  className="btn btn--primary"
                  onClick={submit}
                  disabled={!canSubmit}
                >
                  提交判断对错
                </button>
              )}
              {phase === "submitted" && (
                <button className="btn btn--primary" onClick={goNextRound}>
                  {wrongIds.size === 0 ? "完成" : "下一轮（错词重练）"}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} onEnded={onEnded} />
    </div>
  );
}
