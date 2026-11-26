import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { uploadAttachments } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { ServiceRequestController } from "./service-request.controller";

const router = Router();

router.post(
	"/",
	auth(Role.CUSTOMER),
	uploadAttachments.array("attachments", 3),
	ServiceRequestController.createServiceRequest,
);

export const ServiceRequestRoutes = router;
