import type { Note } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import type {
  CreateNoteInput,
  NoteResponse,
  UpdateNoteInput,
} from "../../types/note.types";

const toNoteResponse = (note: Note): NoteResponse => ({
  id: note.id,
  userId: note.userId,
  title: note.title,
  content: note.content,
  color: note.color,
  createdAt: note.createdAt.toISOString(),
  updatedAt: note.updatedAt.toISOString(),
});

export const listNotes = async (userId: string): Promise<NoteResponse[]> => {
  const notes = await prisma.note.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  return notes.map(toNoteResponse);
};

export const createNote = async (
  userId: string,
  input: CreateNoteInput,
): Promise<NoteResponse> => {
  const note = await prisma.note.create({
    data: {
      userId,
      title: input.title?.trim() || null,
      content: input.content.trim(),
      color: input.color?.trim() || "#facc15",
    },
  });

  return toNoteResponse(note);
};

const findOwnedNote = async (userId: string, noteId: string): Promise<Note> => {
  const note = await prisma.note.findFirst({ where: { id: noteId, userId } });

  if (!note) {
    throw ApiError.notFound("Note not found");
  }

  return note;
};

export const updateNote = async (
  userId: string,
  noteId: string,
  input: UpdateNoteInput,
): Promise<NoteResponse> => {
  await findOwnedNote(userId, noteId);

  const note = await prisma.note.update({
    where: { id: noteId },
    data: {
      ...(input.title !== undefined && { title: input.title?.trim() || null }),
      ...(input.content !== undefined && { content: input.content.trim() }),
      ...(input.color !== undefined && { color: input.color.trim() }),
    },
  });

  return toNoteResponse(note);
};

export const deleteNote = async (userId: string, noteId: string): Promise<void> => {
  await findOwnedNote(userId, noteId);
  await prisma.note.delete({ where: { id: noteId } });
};
