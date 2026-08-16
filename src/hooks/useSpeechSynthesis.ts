// 浏览器原生 TTS 封装：window.speechSynthesis（Web Speech API）。
// 零依赖、零成本；语音/语速偏好持久化到 localStorage（个人工具不做跨端同步）。
import { useCallback, useEffect, useRef, useState } from "react";
import { toEnglishSpokenText } from "../lib/englishSpoken";

const VOICE_STORAGE_KEY = "dictation.voiceURI";
const RATE_STORAGE_KEY = "dictation.rate";
export const DEFAULT_RATE = 0.9;
export const MIN_RATE = 0.5;
export const MAX_RATE = 1.5;

/** 非 hook 场景（如管理后台试听）判断浏览器是否支持语音合成。 */
export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * 从语音列表里挑选最合适的英文语音：en-US > en-GB > 其他 en。
 * 找不到英文语音时返回 null（调用方应显式指定 utterance.lang 兜底，
 * 否则浏览器会落回系统默认语音——中文系统即中文，数字会被中文朗读）。
 */
export function pickEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith("en-us")) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("en-gb")) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("en")) ??
    null
  );
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
      pickEnglishVoice(voices);
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
      // 朗读文本先做数字→英文单词预处理：即使语音引擎不是英文（如系统无英文语音退回中文），
      // 数字/时间/百分比也会以英文单词读出，避免读成中文数字。
      const utterance = new SpeechSynthesisUtterance(toEnglishSpokenText(text));
      let chosen = voiceRef.current;
      if (!chosen) {
        // voiceRef 为空（语音列表尚未加载完成 / 系统没有英文语音 / 从未选择过）时：
        // 先实时再查一次英文语音并选中；仍没有英文语音则显式指定 lang="en-US" 兜底，
        // 避免落回系统默认语音（中文系统即中文）——数字、符号等会被中文朗读。
        chosen = pickEnglishVoice(window.speechSynthesis.getVoices());
        if (chosen) {
          voiceRef.current = chosen;
          setVoiceState(chosen);
        }
      }
      if (chosen) utterance.voice = chosen;
      else utterance.lang = "en-US";
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
