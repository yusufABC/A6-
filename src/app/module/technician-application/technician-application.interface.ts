import type { TechnicianApplicationStatus } from "../../../generated/prisma/enums";

export interface IAdditionalFile {
	url: string;
	publicId: string;
}

export interface IWorkingDays {
	sun?: boolean;
	mon?: boolean;
	tue?: boolean;
	wed?: boolean;
	thu?: boolean;
	fri?: boolean;
	sat?: boolean;
}

export interface ICreateTechnicianApplicationPayload {
	professionalTitle: string;
	yearsOfExperience: number;
	bio?: string | null;
	skills: string[];
	serviceAreas: string[];
	workingDays?: IWorkingDays | null;
	preferredHours?: string | null;
}

export interface ITechnicianApplicationFiles {
	resume?: Express.Multer.File[];
	additionalFiles?: Express.Multer.File[];
}

export type TechnicianApplicationSortField =
	| "status"
	| "professionalTitle"
	| "yearsOfExperience"
	| "createdAt"
	| "updatedAt";

export interface ITechnicianApplicationListQuery {
	page: number;
	limit: number;
	searchTerm?: string;
	status?: TechnicianApplicationStatus;
	sortBy: TechnicianApplicationSortField;
	sortOrder: "asc" | "desc";
}

export interface IApproveTechnicianApplicationPayload {
	reviewNote?: string;
}

export interface IRejectTechnicianApplicationPayload {
	reviewNote: string;
}
