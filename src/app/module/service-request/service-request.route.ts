import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { uploadAttachments } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { ServiceRequestController } from "./service-request.controller";
import { ServiceRequestValidation } from "./service-request.validation";

const router = Router();

router.get(
	"/",
	auth(Role.CUSTOMER, Role.TECHNICIAN, Role.MANAGER, Role.ADMIN),
	ServiceRequestController.getServiceRequests,
);

router.get(
	"/:id",
	auth(Role.CUSTOMER, Role.TECHNICIAN, Role.MANAGER, Role.ADMIN),
	ServiceRequestController.getServiceRequestById,
);

router.delete(
	"/:id",
	auth(Role.CUSTOMER, Role.TECHNICIAN, Role.MANAGER, Role.ADMIN),
	validateRequest(ServiceRequestValidation.CancelServiceRequestSchema),
	ServiceRequestController.cancelServiceRequest,
);

router.post(
	"/:id/approve",
	auth(Role.MANAGER, Role.ADMIN),
	ServiceRequestController.approveServiceRequest,
);

router.post(
	"/:id/decline",
	auth(Role.MANAGER, Role.ADMIN),
	validateRequest(ServiceRequestValidation.DeclineServiceRequestSchema),
	ServiceRequestController.declineServiceRequest,
);

router.post(
	"/",
	auth(Role.CUSTOMER),
	uploadAttachments.array("attachments", 3),
	ServiceRequestController.createServiceRequest,
);

export const ServiceRequestRoutes = router;
