import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AssignmentController } from "./assignment.controller";
import { AssignmentValidation } from "./assignment.validation";

const router = Router();

router.get(
	"/",
	auth(Role.TECHNICIAN, Role.MANAGER, Role.ADMIN),
	AssignmentController.getAssignments,
);

router.get(
	"/:id",
	auth(Role.TECHNICIAN, Role.MANAGER, Role.ADMIN),
	AssignmentController.getAssignmentById,
);

router.post(
	"/:id/accept",
	auth(Role.TECHNICIAN),
	AssignmentController.acceptAssignment,
);

router.post(
	"/:id/reject",
	auth(Role.TECHNICIAN),
	validateRequest(AssignmentValidation.RejectAssignmentSchema),
	AssignmentController.rejectAssignment,
);

router.patch(
	"/:id",
	auth(Role.MANAGER, Role.ADMIN),
	validateRequest(AssignmentValidation.ReassignAssignmentSchema),
	AssignmentController.reassignAssignment,
);

export const AssignmentRoutes = router;
