import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { WorkOrderController } from "./work-order.controller";
import { WorkOrderValidation } from "./work-order.validation";

const router = Router();

router.get(
	"/",
	auth(Role.MANAGER, Role.ADMIN),
	WorkOrderController.getWorkOrders,
);

router.get(
	"/:id",
	auth(Role.MANAGER, Role.ADMIN, Role.TECHNICIAN, Role.CUSTOMER),
	WorkOrderController.getWorkOrderById,
);

router.post(
	"/:id/assignment",
	auth(Role.MANAGER, Role.ADMIN),
	validateRequest(WorkOrderValidation.AssignTechnicianSchema),
	WorkOrderController.assignTechnician,
);

router.post(
	"/:id/cancel",
	auth(Role.MANAGER, Role.ADMIN),
	validateRequest(WorkOrderValidation.CancelWorkOrderSchema),
	WorkOrderController.cancelWorkOrder,
);

export const WorkOrderRoutes = router;
