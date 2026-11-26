import httpStatus from "http-status";
import multer from "multer";
import { AppError } from "../utils/AppError";

const storage = multer.memoryStorage();

const allowedMimeTypes = ["image/jpeg", "image/png"];

const allowedAttachmentMimeTypes = [
	"image/jpeg",
	"image/png",
	"application/pdf",
];

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

export const uploadAttachments = multer({
	storage,
	limits: { fileSize: 5 * 1024 * 1024 },
	fileFilter: (_req, file, cb) => {
		if (!allowedAttachmentMimeTypes.includes(file.mimetype)) {
			return cb(
				new AppError(
					httpStatus.BAD_REQUEST,
					"Only JPEG, PNG and PDF files are allowed",
				),
			);
		}
		cb(null, true);
	},
});
