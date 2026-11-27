import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { WorkOrderController } from "./work-order.controller";
import { WorkOrderValidation } from "./work-order.validation";

const router = Router();

router.post(
	"/:id/assignment",
	auth(Role.MANAGER, Role.ADMIN),
	validateRequest(WorkOrderValidation.AssignTechnicianSchema),
	WorkOrderController.assignTechnician,
);

export const WorkOrderRoutes = router;
