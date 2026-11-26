export interface ICreateServiceRequestPayload {
	serviceId: string;
	description: string;
	preferredDateTime?: Date;
}

export interface IAttachment {
	[key: string]: string;
	url: string;
	publicId: string;
}
