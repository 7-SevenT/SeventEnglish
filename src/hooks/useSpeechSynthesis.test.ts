// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSpeechSynthesis, isSpeechSynthesisSupported, pickEnglishVoice, DEFAULT_RATE } from "./useSpeechSynthesis";

type SpeechListener = (() => void) | null;

function makeSpeechMock(voices: Array<{ voiceURI: string; lang: string; name: string }> = []) {
  const listeners: SpeechListener[] = [];
  const synthesis = {
    getVoices: vi.fn(() => voices),
    speak: vi.fn(),
    cancel: vi.fn(),
    addEventListener: vi.fn((_type: string, cb: () => void) => {
      listeners.push(cb);
    }),
    removeEventListener: vi.fn((_type: string, cb: () => void) => {
      const idx = listeners.indexOf(cb);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
  };
  return { synthesis, listeners };
}

class MockUtterance {
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  lang = "";
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function stubSpeech(voices: Array<{ voiceURI: string; lang: string; name: string }> = []) {
  const { synthesis, listeners } = makeSpeechMock(voices);
  vi.stubGlobal("speechSynthesis", synthesis);
  vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
  localStorage.clear();
  return { synthesis, listeners };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSpeechSynthesis", () => {
  it("supported=false when speechSynthesis is unavailable; speak/cancel are safe no-ops", () => {
    expect(isSpeechSynthesisSupported()).toBe(false);
    const { result } = renderHook(() => useSpeechSynthesis());
    expect(result.current.supported).toBe(false);
    expect(() => {
      result.current.speak("hello");
      result.current.cancel();
    }).not.toThrow();
    expect(result.current.voices).toEqual([]);
  });

  it("loads English voices only and fires voiceschanged to refresh", () => {
    const { synthesis, listeners } = stubSpeech([
      { voiceURI: "us", lang: "en-US", name: "David" },
      { voiceURI: "uk", lang: "en-GB", name: "Zira" },
      { voiceURI: "cn", lang: "zh-CN", name: "Huihui" },
      { voiceURI: "fr", lang: "fr-FR", name: "Julie" },
    ]);
    const { result } = renderHook(() => useSpeechSynthesis());
    expect(synthesis.getVoices).toHaveBeenCalled();
    expect(result.current.voices.map((v) => v.voiceURI)).toEqual(["us", "uk"]);
    // 触发 voiceschanged → 重新加载
    act(() => {
      listeners.forEach((cb) => cb?.());
    });
    expect(result.current.voices.length).toBe(2);
  });

  it("picks en-US by default and persists voice choice to localStorage", () => {
    stubSpeech([
      { voiceURI: "uk", lang: "en-GB", name: "Zira" },
      { voiceURI: "us", lang: "en-US", name: "David" },
    ]);
    const { result } = renderHook(() => useSpeechSynthesis());
    expect(result.current.voice?.voiceURI).toBe("us");
    act(() => {
      result.current.setVoice({ voiceURI: "uk", lang: "en-GB", name: "Zira" } as SpeechSynthesisVoice);
    });
    expect(result.current.voice?.voiceURI).toBe("uk");
    expect(localStorage.getItem("dictation.voiceURI")).toBe("uk");
  });

  it("speak() creates an utterance with the chosen voice/rate and fires onEnd on end", () => {
    const { synthesis } = stubSpeech([
      { voiceURI: "us", lang: "en-US", name: "David" },
    ]);
    const { result } = renderHook(() => useSpeechSynthesis());
    const onEnd = vi.fn();
    act(() => {
      result.current.speak("apple", onEnd);
    });
    expect(synthesis.speak).toHaveBeenCalledTimes(1);
    const utterance = synthesis.speak.mock.calls[0][0] as MockUtterance;
    expect(utterance.text).toBe("apple");
    expect(utterance.voice?.voiceURI).toBe("us");
    expect(utterance.rate).toBe(DEFAULT_RATE);
    expect(result.current.speaking).toBe(true);
    act(() => {
      utterance.onend?.();
    });
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(result.current.speaking).toBe(false);
  });

  it("speak() fires onEnd on error too (avoids stuck sequence)", () => {
    const { synthesis } = stubSpeech([{ voiceURI: "us", lang: "en-US", name: "David" }]);
    const { result } = renderHook(() => useSpeechSynthesis());
    const onEnd = vi.fn();
    act(() => {
      result.current.speak("banana", onEnd);
    });
    const utterance = synthesis.speak.mock.calls[0][0] as MockUtterance;
    act(() => {
      utterance.onerror?.();
    });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("setRate persists and clamps to [MIN, MAX]; cancel() stops synthesis", () => {
    const { synthesis } = stubSpeech([{ voiceURI: "us", lang: "en-US", name: "David" }]);
    const { result } = renderHook(() => useSpeechSynthesis());
    act(() => {
      result.current.setRate(1.2);
    });
    expect(result.current.rate).toBe(1.2);
    expect(localStorage.getItem("dictation.rate")).toBe("1.2");
    act(() => {
      result.current.speak("x");
    });
    act(() => {
      result.current.cancel();
    });
    expect(synthesis.cancel).toHaveBeenCalledTimes(1);
    expect(result.current.speaking).toBe(false);
  });

  it("speak() falls back to lang=en-US when no English voice exists (avoids Chinese reading)", () => {
    // 系统无任何英文语音：恢复逻辑不会设置 voice，speak 必须显式兜底英文，否则落回默认（中文）语音
    const { synthesis } = stubSpeech([]);
    const { result } = renderHook(() => useSpeechSynthesis());
    expect(result.current.voice).toBeNull();
    act(() => {
      result.current.speak("3:00 pm");
    });
    const utterance = synthesis.speak.mock.calls[0][0] as MockUtterance;
    expect(utterance.voice).toBeNull();
    expect(utterance.lang).toBe("en-US");
  });

  it("speak() picks an English voice on the fly when the voice list had not loaded yet", () => {
    // 语音列表异步加载（初始为空，恢复逻辑未选中任何语音），speak 时实时兜底选中英文语音
    const voices: Array<{ voiceURI: string; lang: string; name: string }> = [];
    const { synthesis } = stubSpeech(voices);
    const { result } = renderHook(() => useSpeechSynthesis());
    expect(result.current.voices).toEqual([]);
    act(() => {
      voices.push({ voiceURI: "us", lang: "en-US", name: "David" });
      result.current.speak("take off");
    });
    const utterance = synthesis.speak.mock.calls[0][0] as MockUtterance;
    expect(utterance.voice?.voiceURI).toBe("us");
    expect(result.current.voice?.voiceURI).toBe("us");
  });

  it("speak() pre-processes digits into English words before reading", () => {
    const { synthesis } = stubSpeech([{ voiceURI: "us", lang: "en-US", name: "David" }]);
    const { result } = renderHook(() => useSpeechSynthesis());
    act(() => {
      result.current.speak("3:30 pm");
    });
    const utterance = synthesis.speak.mock.calls[0][0] as MockUtterance;
    expect(utterance.text).toBe("three thirty pm");
  });
});

describe("pickEnglishVoice", () => {
  const v = (voiceURI: string, lang: string) => ({ voiceURI, lang, name: voiceURI }) as SpeechSynthesisVoice;

  it("prefers en-US, then en-GB, then any other en", () => {
    expect(pickEnglishVoice([v("fr", "fr-FR"), v("uk", "en-GB"), v("us", "en-US")])?.voiceURI).toBe("us");
    expect(pickEnglishVoice([v("fr", "fr-FR"), v("uk", "en-GB")])?.voiceURI).toBe("uk");
    expect(pickEnglishVoice([v("au", "en-AU")])?.voiceURI).toBe("au");
  });

  it("returns null when no English voice is available", () => {
    expect(pickEnglishVoice([v("cn", "zh-CN"), v("fr", "fr-FR")])).toBeNull();
    expect(pickEnglishVoice([])).toBeNull();
  });
});
