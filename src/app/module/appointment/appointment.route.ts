import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AppointmentController } from "./appointment.controller";
import { AppointmentValidation } from "./appointment.validation";

const router = Router();

router.patch(
	"/:id",
	auth(Role.MANAGER, Role.ADMIN),
	validateRequest(AppointmentValidation.RescheduleAppointmentSchema),
	AppointmentController.rescheduleAppointment,
);

router.delete(
	"/:id",
	auth(Role.MANAGER, Role.ADMIN),
	AppointmentController.cancelAppointment,
);

export const AppointmentRoutes = router;
