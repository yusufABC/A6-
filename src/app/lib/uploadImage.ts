import type { UploadApiOptions, UploadApiResponse } from "cloudinary";
import httpStatus from "http-status";
import { AppError } from "../utils/AppError";
import { cloudinary } from "./cloudinary";

export const uploadToCloudinary = (
	buffer: Buffer,
	options: UploadApiOptions = { resource_type: "auto" },
) =>
	new Promise<UploadApiResponse>((resolve, reject) => {
		cloudinary.uploader
			.upload_stream(options, (error, result) => {
				if (error) {
					return reject(error);
				}
				if (!result) {
					return reject(
						new AppError(
							httpStatus.INTERNAL_SERVER_ERROR,
							"No result returned from Cloudinary",
						),
					);
				}
				resolve(result);
			})
			.end(buffer);
	});
