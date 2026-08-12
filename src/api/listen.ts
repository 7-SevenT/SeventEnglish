import { apiFetch } from "./client";
import type { WordBook, Unit, Word } from "../../worker/src/db";

export function listBooks() {
  return apiFetch<WordBook[]>("/books");
}
export function listUnits(bookId: number) {
  return apiFetch<Unit[]>(`/books/${bookId}/units`);
}
export function listWords(unitId: number) {
  return apiFetch<Word[]>(`/units/${unitId}/words`);
}
