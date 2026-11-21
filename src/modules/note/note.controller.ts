import type { CreateNoteInput, UpdateNoteInput } from "../../types/note.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as noteService from "./note.service";

export const listNotes = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const notes = await noteService.listNotes(user.id);

  sendSuccess(res, { data: { notes }, message: "Notes retrieved successfully" });
});

export const createNote = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const note = await noteService.createNote(user.id, req.body as CreateNoteInput);

  sendSuccess(res, { statusCode: 201, data: { note }, message: "Note created" });
});

export const updateNote = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const note = await noteService.updateNote(
    user.id,
    req.params.id,
    req.body as UpdateNoteInput,
  );

  sendSuccess(res, { data: { note }, message: "Note updated" });
});

export const deleteNote = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  await noteService.deleteNote(user.id, req.params.id);

  sendSuccess(res, { data: { id: req.params.id }, message: "Note deleted" });
});
