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
