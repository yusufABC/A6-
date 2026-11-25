import { Role } from "../../../generated/prisma/enums";

export interface ILoginUserPayload {
	email: string;
	password: string;
}

export interface IRegisterCustomerPayload {
	name: string;
	email: string;
	password: string;

contactNumber:string


}

export interface IVerifyPaitentPayload {
	
	email: string;
	otp:string
}

export interface IGoogleLoginPayload {
	idToken: string;
}

export interface IRequestUser {
	userId: string;
	email: string;
	name: string;
	role: Role;
}


export interface IForgotPasswordPaylod{
	email:string
}
export interface IResetPasswordPayload{
	email:string
	newPassword:string
	otp:string
}