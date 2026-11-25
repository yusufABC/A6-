import crypto from "crypto";
import bcrypt from "bcryptjs";
import ejs from "ejs";
import { JwtPayload, SignOptions } from "jsonwebtoken";
import path from "node:path";
import { AuthProvider, Role, UserStatus } from "../../../generated/prisma/enums";
import config from "../../config";
import { googleClient } from "../../lib/googleAuth";
import { Transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { redisClient } from "../../lib/redis";
import { AppError } from "../../utils/AppError";
import { jwtUtils } from "../../utils/jwt";
import {
    IForgotPasswordPaylod,
    IGoogleLoginPayload,
    ILoginUserPayload,
    IRegisterCustomerPayload,
    IRequestUser,
    IResetPasswordPayload,
    IVerifyPaitentPayload,
} from "./auth.interface";

import httpStatus from "http-status";
const registerCustomer = async (payload: IRegisterCustomerPayload) => {
    const { name, password,contactNumber } = payload;
    const email = payload.email.trim().toLowerCase();

    const isUserExists = await prisma.user.findUnique({
        where: { email },
    });

    if (isUserExists) {
        throw new AppError(httpStatus.CONFLICT, "User with this email already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 8);

     
   const expiresInSeconds=5*60
   const otp=crypto.randomInt(100000, 1000000).toString();
  const key=`Verify-Registration-OTP:${email}`
 await redisClient.set(key,otp,{
    expiration:{
       type:'EX',
       value:expiresInSeconds
     },
   })
 
   
 
   const templatePath=path.join(process.cwd(),"src/app/templates/verify-register-user.ejs")
 const renderFileData={
   name,
   email,
   otp,
   expiresInMinutes:expiresInSeconds/60
 }
 
  const html=await ejs.renderFile(templatePath,renderFileData)
 
 await Transporter.sendMail({
   from:config.email_sender,
   to:email,
   subject:"Verify your email",
   html
 })
 
   const CustomerRegistrationKey=`Customer-Registration-Data:${email}`
   const redisUserDataPayload={
     name,
     email,
     password:hashedPassword,
     contactNumber
   }
 
   await redisClient.set(CustomerRegistrationKey,JSON.stringify(redisUserDataPayload),{
     expiration:{
        type:'EX',
        value:expiresInSeconds
     }
   })
 

   
};

/**
 * 
 *const registerPatient = async (payload: IRegisterPatientPayload) => {
   const { name, password, patient: patientData } = payload;
   const email = payload.email.trim().toLowerCase();
 
   const isUserExists = await prisma.user.findUnique({
     where: { email },
   });
 
   if (isUserExists) {
     throw new AppError(httpStatus.CONFLICT, "User with this email already exists");
   }
 
   const hashedPassword = await bcrypt.hash(password, 8);
 
 
 
   const expiresInSeconds=5*60
   const otp=crypto.randomInt(100000, 1000000).toString();
  const key=`Verify-Registration-OTP:${email}`
 await redisClient.set(key,otp,{
    expiration:{
       type:'EX',
       value:expiresInSeconds
     },
   })
 
   
 
   const templatePath=path.join(process.cwd(),"src/app/templates/verify-register-user.ejs")
 const renderFileData={
   name,
   email,
   otp,
   expiresInMinutes:expiresInSeconds/60
 }
 
  const html=await ejs.renderFile(templatePath,renderFileData)
 
 await Transporter.sendMail({
   from:config.email_sender,
   to:email,
   subject:"Verify your email",
   html
 })
 
   const patientRegistrationKey=`Patient-Registration-Data:${email}`
   const redisUserDataPayload={
     name,
     email,
     password:hashedPassword,
     patient:patientData
   }
 
   await redisClient.set(patientRegistrationKey,JSON.stringify(redisUserDataPayload),{
     expiration:{
        type:'EX',
        value:expiresInSeconds
     }
   })
 
   
 
 
 
 /**
  * 
 
  * 
  
 */

const verifyCustomerEmail=async(payload:IVerifyPaitentPayload)=>{
   const email = payload.email.trim().toLowerCase();
   const {otp}=payload

  const isUserExist = await prisma.user.findUnique({
    where: { email },
  });

 

  if (isUserExist?.emailVerified) {
    throw new AppError(httpStatus.BAD_REQUEST, "This Email is verified");
  }
   if (isUserExist?.isDeleted || isUserExist?.status === "DELETED") {
    throw new AppError(httpStatus.FORBIDDEN, "User has been deleted");
  }
  if (isUserExist?.status === "SUSPENDED") {
    throw new AppError(httpStatus.FORBIDDEN, "This user is blocked !.Please contact with admin");
  }
  

  const key=`Verify-Registration-OTP:${email}`
  const redisOtp=await redisClient.get(key)
  

  if (!redisOtp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Please send otp again");
  }

  if (redisOtp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Otp doesn't match");
  }

  await redisClient.del(key)

  const customerRegistrationKey=`Customer-Registration-Data:${email}`
  const redisCustomerData=await redisClient.get(customerRegistrationKey)
  if(!redisCustomerData){
    throw new AppError(httpStatus.NOT_FOUND, "Customer doesn't exist please try again!")
  }
  const customerPayload:IRegisterCustomerPayload=JSON.parse(redisCustomerData)

const createdUser = await prisma.user.create({
  data: {
    name:customerPayload.name,
    email:customerPayload.email,
    password: customerPayload.password,
    role: Role.CUSTOMER,
    status: UserStatus.ACTIVE,
    emailVerified: true,
    contactNumber:customerPayload.contactNumber,
  },
  omit: { password: true },
 
});

await redisClient.del(customerRegistrationKey)

 const templatePath=path.join(process.cwd(),"src/app/templates/welcome-email.ejs")
 const renderData={
  name:createdUser.name
 }
const html=await ejs.renderFile(templatePath,renderData)

await Transporter.sendMail({
  from:config.email_sender,
  to:createdUser.email,
  subject:"Welcome to our platform",
  html
})


const {  ...user } = createdUser;
const jwtPayload = {
  userId: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
};

const accessToken = jwtUtils.createToken(
  jwtPayload,
  config.jwt_access_secret,
  config.jwt_access_expires_in as SignOptions,
);

const refreshToken = jwtUtils.createToken(
  jwtPayload,
  config.jwt_refresh_secret,
  config.jwt_refresh_expires_in as SignOptions,
);

  return {
          user: createdUser,
        accessToken,
        refreshToken,
  };


}


/**
 * 
 *  
    const createdUser = await prisma.user.create({
        data: {
            name,
            email,
            password: hashedPassword,
            role: Role.CUSTOMER,
            status: UserStatus.ACTIVE,
            emailVerified: false,
        },
        omit: { password: true },
    });

    const jwtPayload = {
        userId: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        role: createdUser.role,
    };

    const accessToken = jwtUtils.createToken(
        jwtPayload,
        config.jwt_access_secret,
        config.jwt_access_expires_in as SignOptions,
    );

    const refreshToken = jwtUtils.createToken(
        jwtPayload,
        config.jwt_refresh_secret,
        config.jwt_refresh_expires_in as SignOptions,
    );

    return {
        user: createdUser,
        accessToken,
        refreshToken,
    };
 */

const loginUser = async (payload: ILoginUserPayload) => {
    const { password } = payload;
    const email = payload.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
        where: { email },
    });

    if (!user) {
        throw new AppError(httpStatus.NOT_FOUND, "User not found");
    }

    if (user.status === UserStatus.SUSPENDED) {
        throw new AppError(httpStatus.FORBIDDEN, "User is suspended");
    }

    if (user.isDeleted || user.status === UserStatus.DELETED) {
        throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
    }

    if (!user.password) {
        throw new AppError(httpStatus.BAD_REQUEST, "Please log in using Google authentication");
    }

    const isPasswordMatched = await bcrypt.compare(password, user.password);

    if (!isPasswordMatched) {
        throw new AppError(httpStatus.UNAUTHORIZED, "Invalid credentials");
    }

    const jwtPayload = {
        userId: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
    };

    const accessToken = jwtUtils.createToken(
        jwtPayload,
        config.jwt_access_secret,
        config.jwt_access_expires_in as SignOptions,
    );

    const refreshToken = jwtUtils.createToken(
        jwtPayload,
        config.jwt_refresh_secret,
        config.jwt_refresh_expires_in as SignOptions,
    );

    return {
        accessToken,
        refreshToken,
    };
};

const googleLogin = async (payload: IGoogleLoginPayload) => {
  // const result=await googleClient.verifyIdToken({idToken:payload.googleId})
  // const googleInfo=result.getPayload()
  // googleInfo.

  let googleIdTokenPayload = null;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: payload.idToken,
      audience: config.google_client_id,
    });
    googleIdTokenPayload = ticket.getPayload();
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Google token verification failed:", err.message);
    throw new AppError(httpStatus.UNAUTHORIZED, `Invalid Google ID token: ${err.message}`);
  }
  if (!googleIdTokenPayload) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid or expired google id token");
  }
  if (!googleIdTokenPayload.name) {
    throw new AppError(httpStatus.BAD_REQUEST, "Name not found!");
  }
  if (!googleIdTokenPayload.email) {
    throw new AppError(httpStatus.BAD_REQUEST, "Email not found!");
  }

  const ifPaitentExistWithGoogleAuth = await prisma.user.findUnique({
    where: {
      email: googleIdTokenPayload.email,
      role: Role.CUSTOMER,
      googleId: googleIdTokenPayload.sub,
    },
  });

  let user = ifPaitentExistWithGoogleAuth;

  if (!ifPaitentExistWithGoogleAuth) {
    const ifPaitentExistWithEmail = await prisma.user.findUnique({
      where: {
        email: googleIdTokenPayload.email,
        role: Role.CUSTOMER,
      },
    });

    if (ifPaitentExistWithEmail) {
      if (!ifPaitentExistWithEmail.emailVerified) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          "Email is not verified. Please verify your email first.",
        );
      }
      if (ifPaitentExistWithEmail?.status === UserStatus.SUSPENDED) {
        throw new AppError(httpStatus.FORBIDDEN, "User is suspended");
      }

      if (
        ifPaitentExistWithEmail?.status === UserStatus.DELETED ||
        ifPaitentExistWithEmail?.isDeleted
      ) {
        throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
      }

      user = await prisma.user.update({
        where: {
          id: ifPaitentExistWithEmail?.id,
        },
        data: {
          googleId: googleIdTokenPayload.sub,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          name: googleIdTokenPayload.name,
          email: googleIdTokenPayload.email,
          role: Role.CUSTOMER,
          googleId: googleIdTokenPayload.sub,
          emailVerified: true,
          authProvider: AuthProvider.GOOGLE,
        },
      });


      const templatePath=path.join(process.cwd(),"src/app/templates/welcome-email.ejs")
 const renderData={
  name:user.name
 }
const html=await ejs.renderFile(templatePath,renderData)

await Transporter.sendMail({
  from:config.email_sender,
  to:user.email,
  subject:"Welcome to our platform",
  html
})

    }
  }

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found or created");
  }

  if (user?.status === UserStatus.SUSPENDED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is suspended");
  }

  if (user?.status === UserStatus.DELETED || user?.isDeleted) {
    throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );
  const sanitizedUser = await prisma.user.findUnique({
    where: { id: user.id },
    omit: { password: true },
  });

  return {
    user: sanitizedUser,
    accessToken,
    refreshToken,
  };
};



const getMe = async (user: IRequestUser) => {
    const isUserExists = await prisma.user.findUnique({
        where: {
            id: user.userId,
        },
        include: {
            technician: true,
        },
        omit: {
            password: true,
        },
    });

    if (!isUserExists) {
        throw new AppError(httpStatus.NOT_FOUND, "User not found");
    }

    return isUserExists;
};

const refreshToken = async (token: string) => {
    const verifiedRefreshToken = jwtUtils.verifyToken(
        token,
        config.jwt_refresh_secret,
    );

    if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
        throw new AppError(
            httpStatus.UNAUTHORIZED,
            config.node_env === "development"
                ? String(verifiedRefreshToken.error)
                : "Invalid refresh token",
        );
    }

    const data = verifiedRefreshToken.data as JwtPayload;

    const user = await prisma.user.findUnique({
        where: { id: data.userId },
    });

    if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
        throw new AppError(httpStatus.UNAUTHORIZED, "User is inactive or not found");
    }

    const jwtPayload = {
        userId: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
    };

    const accessToken = jwtUtils.createToken(
        jwtPayload,
        config.jwt_access_secret,
        config.jwt_access_expires_in as SignOptions,
    );

    const refreshToken = jwtUtils.createToken(
        jwtPayload,
        config.jwt_refresh_secret,
        config.jwt_refresh_expires_in as SignOptions,
    );

    return {
        accessToken,
        refreshToken,
    };
};


const forgotPassword = async (payload: IForgotPasswordPaylod) => {
  const { email } = payload;
  const isUserExist = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!isUserExist) {
    throw new AppError(httpStatus.NOT_FOUND, "User doesn't exist");
  }

  if (isUserExist.googleId && isUserExist.authProvider === "GOOGLE") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "User has associate with google so please login with google",
    );
  }
  if (isUserExist.isDeleted || isUserExist.status === UserStatus.DELETED) {
    throw new AppError(httpStatus.FORBIDDEN, "User has been deleted");
  }
  if (isUserExist.status === UserStatus.SUSPENDED) {
    throw new AppError(httpStatus.FORBIDDEN, "This user is suspended !.Please contact with admin");
  }
  if(!isUserExist.emailVerified){
    throw new AppError(httpStatus.FORBIDDEN, "User email isn't verified");

  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  const key = `forget-password-otp:${isUserExist.email}`;
  const expiresInSecond= 5 * 60

  await redisClient.set(key, otp, {
    expiration: {
      type: "EX",
      value:expiresInSecond
    },
  });

  const templatePath=path.join(process.cwd(),"src/app/templates/forgot-password.ejs")

  const renderData={
    name:isUserExist.name,
    otp,
    expiresInMinutes:expiresInSecond/60

  }
  const html=await ejs.renderFile(templatePath,renderData)

  await Transporter.sendMail({
    from:config.email_sender,
    to:isUserExist.email,
    subject:"Forgot Password",
    html
  })



};
const resetPassword = async (payload: IResetPasswordPayload) => {
  const { email, newPassword, otp } = payload;
  const isUserExist = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!isUserExist) {
    throw new AppError(httpStatus.NOT_FOUND, "User doesn't exist");
  }

  if (isUserExist.googleId && isUserExist.authProvider === "GOOGLE") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "User has associate with google so please login with google",
    );
  }
  if (isUserExist.isDeleted || isUserExist.status === UserStatus.DELETED) {
    throw new AppError(httpStatus.FORBIDDEN, "User has been deleted");
  }
  if (isUserExist.status === UserStatus.SUSPENDED) {
    throw new AppError(httpStatus.FORBIDDEN, "This user is suspended !.Please contact with admin");
  }
  const hashedPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  const key = `forget-password-otp:${isUserExist.email}`;

  const redisOtp = await redisClient.get(key);

  if (!redisOtp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Please send otp again");
  }

  if (redisOtp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Otp doesn't match");
  }

  await prisma.user.update({
    where: {
      email,
    },
    data: {
      password: hashedPassword,
    },
  });

  await redisClient.del([key]);

// Connect Path and email and feed it to nodemailer function 
  const templatePath= path.join(process.cwd(),"src/app/templates/reset-password-confirmation.ejs")

  const renderData={
    name:isUserExist.name
  }
  const html=await ejs.renderFile(templatePath,renderData)

  // Send Mail using nodemailer

  await Transporter.sendMail({
    from:config.email_sender,
    to:isUserExist.email,
    subject:"Your Password Reset",
    html
  })
};

export const AuthService = {
    registerCustomer,
  verifyCustomerEmail,
    loginUser,
   googleLogin,
    getMe,
    refreshToken,
    forgotPassword,
    resetPassword
};