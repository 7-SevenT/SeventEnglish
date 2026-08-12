const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".ogg", ".aac"] as const;
const ARTICLE_EXTENSIONS = [".md", ".markdown", ".txt"] as const;

function extension(name: string): string {
  const lower = name.trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot) : "";
}

export function isSupportedAudioFile(file: File): boolean {
  return file.type.startsWith("audio/") || AUDIO_EXTENSIONS.includes(extension(file.name) as (typeof AUDIO_EXTENSIONS)[number]);
}

export function audioWordFromFilename(name: string): string {
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf(".");
  return (dot > 0 ? trimmed.slice(0, dot) : trimmed).trim();
}

export async function readArticleSource(file: File): Promise<string> {
  const ext = extension(file.name);
  if (!ARTICLE_EXTENSIONS.includes(ext as (typeof ARTICLE_EXTENSIONS)[number]) && file.type !== "text/plain") {
    throw new Error("Only Markdown or TXT files are supported");
  }
  const content = await file.text();
  if (!content.trim()) throw new Error("Article file is empty");
  return content;
}
