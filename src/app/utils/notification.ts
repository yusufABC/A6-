import type { Prisma } from "../../generated/prisma/client";
import type { NotificationCategory } from "../../generated/prisma/enums";

export interface ICreateNotificationPayload {
	userId: string;
	category: NotificationCategory;
	title?: string;
	message: string;
}

export const createNotification = async (
	tx: Prisma.TransactionClient,
	payload: ICreateNotificationPayload,
) => {
	const { userId, category, title, message } = payload;

	return tx.notification.create({
		data: {
			userId,
			category,
			title,
			message,
		},
	});
};
