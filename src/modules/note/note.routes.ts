import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import { createNoteSchema, updateNoteSchema } from "../../validations/note.validation";
import * as noteController from "./note.controller";

const router = Router();

router.use(authenticate);

router.get("/", noteController.listNotes);
router.post("/", validate({ body: createNoteSchema }), noteController.createNote);
router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateNoteSchema }),
  noteController.updateNote,
);
router.delete("/:id", validate({ params: idParamSchema }), noteController.deleteNote);

export const noteRoutes = router;
