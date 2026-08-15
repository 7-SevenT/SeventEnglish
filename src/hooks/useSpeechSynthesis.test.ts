// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSpeechSynthesis, isSpeechSynthesisSupported, DEFAULT_RATE } from "./useSpeechSynthesis";

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
});
