import httpStatus from "http-status";
import multer from "multer";
import { AppError } from "../utils/AppError";

const storage = multer.memoryStorage();

const allowedMimeTypes = ["image/jpeg", "image/png"];

export const upload = multer({
	storage,
	limits: { fileSize: 5 * 1024 * 1024 },
	fileFilter: (_req, file, cb) => {
		if (!allowedMimeTypes.includes(file.mimetype)) {
			return cb(
				new AppError(
					httpStatus.BAD_REQUEST,
					"Only JPEG and PNG images are allowed",
				),
			);
		}
		cb(null, true);
	},
});
