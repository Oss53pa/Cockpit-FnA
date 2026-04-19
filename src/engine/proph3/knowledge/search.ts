// Moteur de recherche dans la base SYSCOHADA — recherche par keywords + scoring
import { syscohadaKnowledge } from './syscohada-knowledge';
import type { SyscohadaKnowledgeChunk } from './types';

function tokenize(s: string): string[] {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter((t) => t.length > 2);
}

function scoreChunk(chunk: SyscohadaKnowledgeChunk, queryTokens: string[]): number {
  let score = 0;
  const titleTokens = tokenize(chunk.title);
  const contentTokens = tokenize(chunk.content);
  const keywordTokens = (chunk.keywords || []).flatMap((k) => tokenize(k));
  for (const q of queryTokens) {
    if (titleTokens.includes(q)) score += 5;
    if (keywordTokens.includes(q)) score += 4;
    if (contentTokens.includes(q)) score += 1;
    if (chunk.category.includes(q)) score += 3;
    if (chunk.id.toLowerCase().includes(q)) score += 2;
  }
  return score;
}

export function searchKnowledge(query: string, limit = 3): SyscohadaKnowledgeChunk[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const scored = syscohadaKnowledge
    .map((c) => ({ c, score: scoreChunk(c, tokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((s) => s.c);
}

export function getByCategory(category: string): SyscohadaKnowledgeChunk[] {
  return syscohadaKnowledge.filter((c) => c.category === category);
}

export function getById(id: string): SyscohadaKnowledgeChunk | undefined {
  return syscohadaKnowledge.find((c) => c.id === id);
}

export function getAllCategories(): string[] {
  return Array.from(new Set(syscohadaKnowledge.map((c) => c.category)));
}

// Réponse formatée d'une recherche pour affichage dans le chat
export function answerFromKnowledge(query: string): string | null {
  const results = searchKnowledge(query, 1);
  if (results.length === 0) return null;
  const c = results[0];
  let answer = `📚 ${c.title}\n\n${c.content}`;
  if (c.legal_references?.length) {
    answer += `\n\n⚖ Références légales : ${c.legal_references.join(', ')}`;
  }
  if (c.examples_fcfa) {
    answer += `\n\n💡 Exemple : ${c.examples_fcfa}`;
  }
  return answer;
}
