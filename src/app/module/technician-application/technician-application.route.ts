import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { uploadAttachments } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { TechnicianApplicationController } from "./technician-application.controller";

const router = Router();

// /me is registered before /:id so it is never treated as an id.
router.get(
	"/me",
	auth(Role.CUSTOMER),
	TechnicianApplicationController.getMyApplications,
);

router.post(
	"/",
	auth(Role.CUSTOMER),
	uploadAttachments.fields([
		{ name: "resume", maxCount: 1 },
		{ name: "additionalFiles", maxCount: 5 },
	]),
	TechnicianApplicationController.createTechnicianApplication,
);

router.delete(
	"/:id",
	auth(Role.CUSTOMER),
	TechnicianApplicationController.deleteTechnicianApplication,
);

export const TechnicianApplicationRoutes = router;
