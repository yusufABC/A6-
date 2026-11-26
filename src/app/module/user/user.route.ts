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

router.get("/", auth(Role.ADMIN), UserController.getAllUsers);

router.get("/:id", auth(Role.ADMIN), UserController.getUserById);

router.patch(
	"/:id/suspend",
	auth(Role.ADMIN),
	UserController.suspendUser,
);

router.patch(
	"/:id/activate",
	auth(Role.ADMIN),
	UserController.activateUser,
);

router.patch(
	"/:id/role",
	auth(Role.ADMIN),
	validateRequest(UserValidation.UpdateUserRoleSchema),
	UserController.updateUserRole,
);

router.delete("/:id", auth(Role.ADMIN), UserController.deleteUser);

export const UserRoutes = router;
