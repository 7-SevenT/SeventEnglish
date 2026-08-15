// 浏览器原生 TTS 封装：window.speechSynthesis（Web Speech API）。
// 零依赖、零成本；语音/语速偏好持久化到 localStorage（个人工具不做跨端同步）。
import { useCallback, useEffect, useRef, useState } from "react";

const VOICE_STORAGE_KEY = "dictation.voiceURI";
const RATE_STORAGE_KEY = "dictation.rate";
export const DEFAULT_RATE = 0.9;
export const MIN_RATE = 0.5;
export const MAX_RATE = 1.5;

/** 非 hook 场景（如管理后台试听）判断浏览器是否支持语音合成。 */
export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function loadSavedRate(): number {
  try {
    const raw = localStorage.getItem(RATE_STORAGE_KEY);
    if (raw === null) return DEFAULT_RATE;
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.min(MAX_RATE, Math.max(MIN_RATE, n));
  } catch {
    // localStorage 不可用时忽略
  }
  return DEFAULT_RATE;
}

export interface UseSpeechSynthesisResult {
  supported: boolean;
  voices: SpeechSynthesisVoice[];
  voice: SpeechSynthesisVoice | null;
  setVoice: (v: SpeechSynthesisVoice) => void;
  rate: number;
  setRate: (r: number) => void;
  speak: (text: string, onEnd?: () => void) => void;
  cancel: () => void;
  speaking: boolean;
}

export function useSpeechSynthesis(): UseSpeechSynthesisResult {
  const supported = isSpeechSynthesisSupported();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voice, setVoiceState] = useState<SpeechSynthesisVoice | null>(null);
  const [rate, setRateState] = useState<number>(loadSavedRate);
  const [speaking, setSpeaking] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const rateRef = useRef(rate);
  const endRef = useRef<(() => void) | null>(null);
  rateRef.current = rate;

  // 加载英文语音列表（Safari 需要监听 voiceschanged）
  useEffect(() => {
    if (!supported) return;
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      setVoices(list.filter((v) => v.lang.toLowerCase().startsWith("en")));
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [supported]);

  // 恢复/选择默认语音：localStorage 的 voiceURI > en-US > en-GB > 第一个英文语音
  useEffect(() => {
    if (!supported || voices.length === 0) return;
    let savedURI: string | null = null;
    try {
      savedURI = localStorage.getItem(VOICE_STORAGE_KEY);
    } catch {
      // ignore
    }
    const preferred =
      voices.find((v) => v.voiceURI === savedURI) ??
      voices.find((v) => v.lang.toLowerCase().startsWith("en-us")) ??
      voices.find((v) => v.lang.toLowerCase().startsWith("en-gb")) ??
      voices[0];
    if (preferred) setVoice(preferred);
  }, [supported, voices]);

  const setVoice = useCallback((v: SpeechSynthesisVoice) => {
    voiceRef.current = v;
    setVoiceState(v);
    try {
      localStorage.setItem(VOICE_STORAGE_KEY, v.voiceURI);
    } catch {
      // ignore
    }
  }, []);

  const setRate = useCallback((r: number) => {
    setRateState(r);
    try {
      localStorage.setItem(RATE_STORAGE_KEY, String(r));
    } catch {
      // ignore
    }
  }, []);

  const finish = useCallback(() => {
    setSpeaking(false);
    endRef.current?.();
    endRef.current = null;
  }, []);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!supported) return;
      endRef.current = onEnd ?? null;
      const utterance = new SpeechSynthesisUtterance(text);
      if (voiceRef.current) utterance.voice = voiceRef.current;
      utterance.rate = rateRef.current;
      utterance.onend = finish;
      utterance.onerror = finish;
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [supported, finish]
  );

  const cancel = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  return { supported, voices, voice, setVoice, rate, setRate, speak, cancel, speaking };
}
