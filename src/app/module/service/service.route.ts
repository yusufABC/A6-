import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { ServiceController } from "./service.controller";
import { ServiceValidation } from "./service.validation";

const router = Router();

// /all must be registered before /:id so it is not treated as an id.
router.get("/all", auth(Role.ADMIN), ServiceController.getAllServices);

router.get("/", ServiceController.getPublicServices);
router.get("/:id", ServiceController.getServiceById);

router.post(
	"/",
	auth(Role.ADMIN),
	validateRequest(ServiceValidation.CreateServiceSchema),
	ServiceController.createService,
);

router.patch(
	"/:id",
	auth(Role.ADMIN),
	validateRequest(ServiceValidation.UpdateServiceSchema),
	ServiceController.updateService,
);

router.delete("/:id", auth(Role.ADMIN), ServiceController.deleteService);

export const ServiceRoutes = router;
