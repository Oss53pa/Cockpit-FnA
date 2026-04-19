// Types pour la base de connaissance Proph3t (importé de WiseBook)
export interface SyscohadaKnowledgeChunk {
  id: string;
  category: string;
  title: string;
  content: string;
  legal_references?: string[];
  examples_fcfa?: string;
  keywords: string[];
}
