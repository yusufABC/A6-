import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { uploadAttachments } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { TechnicianApplicationController } from "./technician-application.controller";
import { TechnicianApplicationValidation } from "./technician-application.validation";

const router = Router();

// /me is registered before /:id so it is never treated as an id.
router.get(
	"/me",
	auth(Role.CUSTOMER),
	TechnicianApplicationController.getMyApplications,
);

// The admin list ("/") is registered before /:id routes so it is never shadowed.
router.get(
	"/",
	auth(Role.ADMIN),
	TechnicianApplicationController.getTechnicianApplications,
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

router.post(
	"/:id/approve",
	auth(Role.ADMIN),
	validateRequest(
		TechnicianApplicationValidation.ApproveTechnicianApplicationSchema,
	),
	TechnicianApplicationController.approveTechnicianApplication,
);

router.post(
	"/:id/reject",
	auth(Role.ADMIN),
	validateRequest(
		TechnicianApplicationValidation.RejectTechnicianApplicationSchema,
	),
	TechnicianApplicationController.rejectTechnicianApplication,
);

router.delete(
	"/:id",
	auth(Role.CUSTOMER),
	TechnicianApplicationController.deleteTechnicianApplication,
);

export const TechnicianApplicationRoutes = router;
