export interface CreateNoteInput {
  title?: string | null;
  content: string;
  color?: string;
}

export interface UpdateNoteInput {
  title?: string | null;
  content?: string;
  color?: string;
}

export interface NoteResponse {
  id: string;
  userId: string;
  title: string | null;
  content: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}
