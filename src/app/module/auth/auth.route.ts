import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { AuthController } from "./auth.controller";

const router = Router();

router.post("/register", AuthController.registerCustomer);
router.post("/login", AuthController.loginUser);
router.post("/google", AuthController.googleLogin);
router.get(
	"/me",
	auth(Role.ADMIN, Role.CUSTOMER, Role.MANAGER, Role.TECHNICIAN),
	AuthController.getMe,
);
router.post("/refresh-token", AuthController.refreshToken);
router.post("/forgot-password", AuthController.forgotPassword);
router.post("/reset-password", AuthController.resetPassword);

export const AuthRoutes = router;
