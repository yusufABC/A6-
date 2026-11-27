import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { TechnicianController } from "./technician.controller";
import { TechnicianValidation } from "./technician.validation";

const router = Router();

// /me routes are registered before /:id routes so they are never shadowed.
router.get(
	"/me/profile",
	auth(Role.TECHNICIAN),
	TechnicianController.getMyProfile,
);

router.patch(
	"/me/profile",
	auth(Role.TECHNICIAN),
	validateRequest(TechnicianValidation.UpdateMyProfileSchema),
	TechnicianController.updateMyProfile,
);

router.get(
	"/me/feedbacks",
	auth(Role.TECHNICIAN),
	TechnicianController.getMyFeedbacks,
);

router.get("/me/stats", auth(Role.TECHNICIAN), TechnicianController.getMyStats);

// Admin list is registered before /:id so it is not shadowed.
router.get("/", auth(Role.ADMIN), TechnicianController.getTechnicians);

// /available must be registered before /:id so it is not treated as an id.
router.get(
	"/available",
	auth(Role.MANAGER, Role.ADMIN),
	TechnicianController.getAvailableTechnicians,
);

router.get("/:id/feedbacks", TechnicianController.getPublicFeedbacks);
router.get("/:id", TechnicianController.getPublicProfile);

router.patch(
	"/:id",
	auth(Role.ADMIN),
	validateRequest(TechnicianValidation.AdminUpdateTechnicianSchema),
	TechnicianController.adminUpdateTechnician,
);

export const TechnicianRoutes = router;
