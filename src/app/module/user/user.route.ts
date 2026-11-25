import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { upload } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { UserController } from "./user.controller";
import { UserValidation } from "./user.validation";

const router = Router();

// /me routes are registered before any future /:id route so they are never shadowed.
router.get(
	"/me",
	auth(Role.ADMIN, Role.CUSTOMER, Role.MANAGER, Role.TECHNICIAN),
	UserController.getMe,
);

router.patch(
	"/me",
	auth(Role.ADMIN, Role.CUSTOMER, Role.MANAGER, Role.TECHNICIAN),
	validateRequest(UserValidation.UpdateProfileSchema),
	UserController.updateProfile,
);

router.patch(
	"/me/address",
	auth(Role.ADMIN, Role.CUSTOMER, Role.MANAGER, Role.TECHNICIAN),
	validateRequest(UserValidation.UpdateAddressSchema),
	UserController.updateAddress,
);

router.post(
	"/me/profile-image",
	auth(Role.ADMIN, Role.CUSTOMER, Role.MANAGER, Role.TECHNICIAN),
	upload.single("profileImage"),
	UserController.updateProfileImage,
);

export const UserRoutes = router;
