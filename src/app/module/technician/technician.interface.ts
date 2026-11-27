import type { AssignmentStatus } from "../../../generated/prisma/enums";

export interface IWorkingDays {
	sun?: boolean;
	mon?: boolean;
	tue?: boolean;
	wed?: boolean;
	thu?: boolean;
	fri?: boolean;
	sat?: boolean;
}

export interface IUpdateTechnicianProfilePayload {
	professionalTitle?: string;
	yearsOfExperience?: number;
	bio?: string | null;
	skills?: string[];
	serviceAreas?: string[];
	workingDays?: IWorkingDays;
	preferredHours?: string;
}

export interface IAdminUpdateTechnicianPayload
	extends IUpdateTechnicianProfilePayload {
	isDeleted?: true;
}

export type TechnicianSortField =
	| "professionalTitle"
	| "yearsOfExperience"
	| "createdAt"
	| "updatedAt";

export interface ITechnicianListQuery {
	page: number;
	limit: number;
	searchTerm?: string;
	sortBy: TechnicianSortField;
	sortOrder: "asc" | "desc";
}

export type FeedbackSortField = "createdAt" | "rating";

export interface IFeedbackListQuery {
	page: number;
	limit: number;
	sortBy: FeedbackSortField;
	sortOrder: "asc" | "desc";
}

export interface ITechnicianStats {
	assignmentsByStatus: Record<AssignmentStatus, number>;
	totalAssignments: number;
	completedJobs: number;
	averageRating: number | null;
	totalReviews: number;
}
