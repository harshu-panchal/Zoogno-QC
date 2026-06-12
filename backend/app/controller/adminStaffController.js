import Admin from "../models/admin.js";
import Role from "../models/role.js";
import handleResponse from "../utils/helper.js";
import crypto from "crypto";
import nodemailer from "nodemailer";

const createTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
};

const sendAdminInviteEmail = async (email, password) => {
    try {
        const transporter = createTransporter();
        const mailOptions = {
            from: `"${process.env.MAIL_FROM_NAME || 'Zoognu Admin'}" <${process.env.MAIL_FROM || process.env.SMTP_USER}>`,
            to: email,
            subject: "Welcome to Zoognu Admin",
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #4f46e5;">Welcome to Zoognu Admin Panel!</h2>
                    <p>You have been invited to join the admin team.</p>
                    <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 0 0 10px 0;"><strong>Your login credentials:</strong></p>
                        <p style="margin: 0 0 5px 0;"><strong>Email:</strong> ${email}</p>
                        <p style="margin: 0;"><strong>Password:</strong> ${password}</p>
                    </div>
                    <p style="color: #6b7280; font-size: 14px;">Please login and change your password immediately.</p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
        console.log(`Admin invite email sent to ${email}`);
    } catch (error) {
        console.error("Error sending admin invite email:", error);
    }
};

export const sendInviteOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return handleResponse(res, 400, "Email is required");

        let admin = await Admin.findOne({ email });
        
        if (admin && admin.isVerified && admin.isActive) {
            return handleResponse(res, 409, "Admin with this email already exists and is active.");
        }

        if (!admin) {
            admin = new Admin({
                email,
                name: "Pending Invite",
                password: crypto.randomBytes(8).toString('hex'), // Temporary random pass
                role: "admin",
                isVerified: false
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        admin.otp = otp;
        admin.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
        
        await admin.save();

        try {
            const transporter = createTransporter();
            const mailOptions = {
                from: `"${process.env.MAIL_FROM_NAME || 'Zoognu Admin'}" <${process.env.MAIL_FROM || process.env.SMTP_USER}>`,
                to: email,
                subject: "Your Zoognu Admin Verification OTP",
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; text-align: center; border: 1px solid #eee; border-radius: 10px;">
                        <h2 style="color: #4f46e5;">Zoognu Admin Verification</h2>
                        <p>Your OTP to verify your email for the admin panel invitation is:</p>
                        <div style="margin: 30px 0; padding: 20px; background-color: #f3f4f6; border-radius: 8px;">
                            <h1 style="color: #111827; letter-spacing: 8px; margin: 0; font-size: 36px;">${otp}</h1>
                        </div>
                        <p style="color: #6b7280; font-size: 14px;">This OTP will expire in 10 minutes.</p>
                    </div>
                `
            };
            await transporter.sendMail(mailOptions);
            console.log(`OTP email sent to ${email}`);
        } catch (error) {
            console.error("Error sending OTP email:", error);
            return handleResponse(res, 500, "Failed to send OTP via email");
        }

        return handleResponse(res, 200, "Invitation OTP sent to email");
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const getAdmins = async (req, res) => {
    try {
        const admins = await Admin.find({ role: { $in: ["admin", "super_admin"] } })
            .select("-password -otp -verificationToken")
            .populate("adminRole")
            .sort({ createdAt: -1 });
        
        return handleResponse(res, 200, "Admins fetched successfully", admins);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const inviteAdminUser = async (req, res) => {
    try {
        const { email, name, permissions, otp, password } = req.body;

        if (!email || !otp || !password) {
            return handleResponse(res, 400, "Email, OTP, and password are required.");
        }

        // Validate OTP (assuming we used sendAdminOtp to the new email)
        const pendingAdmin = await Admin.findOne({ email }).select("+otp");
        if (!pendingAdmin) {
            return handleResponse(res, 404, "Email not verified. Please send OTP first.");
        }

        if (pendingAdmin.otp !== otp || pendingAdmin.otpExpires < new Date()) {
            return handleResponse(res, 401, "Invalid or expired OTP.");
        }

        // Dynamically find or create/update the role based on permissions
        const roleName = `Role_${email}`;
        let role = await Role.findOne({ name: roleName });
        const allowedPermissions = Array.isArray(permissions) ? permissions : [];
        if (!role) {
            role = new Role({
                name: roleName,
                permissions: allowedPermissions
            });
        } else {
            role.permissions = allowedPermissions;
        }
        await role.save();

        // Update the pending admin with actual details
        pendingAdmin.name = name || email.split("@")[0] || "Sub Admin";
        pendingAdmin.password = password; // The pre-save hook in the Admin model will hash this automatically!
        pendingAdmin.adminRole = role._id;
        pendingAdmin.isVerified = true;
        pendingAdmin.isActive = true;
        pendingAdmin.otp = undefined;
        pendingAdmin.otpExpires = undefined;

        await pendingAdmin.save();

        // Send email with credentials
        await sendAdminInviteEmail(email, password);

        // Remove sensitive info before returning
        const adminObj = pendingAdmin.toObject();
        delete adminObj.password;

        return handleResponse(res, 201, "Admin user invited successfully. Credentials sent via email.", adminObj);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const toggleAdminStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        const admin = await Admin.findById(id);
        if (!admin) {
            return handleResponse(res, 404, "Admin not found.");
        }

        admin.isActive = isActive;
        await admin.save();

        return handleResponse(res, 200, `Admin ${isActive ? 'activated' : 'deactivated'} successfully.`);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const verifyInviteOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return handleResponse(res, 400, "Email and OTP are required.");
        }
        const admin = await Admin.findOne({ email }).select("+otp");
        if (!admin) {
            return handleResponse(res, 404, "Verification session not found.");
        }
        if (admin.otp !== otp || admin.otpExpires < new Date()) {
            return handleResponse(res, 401, "Invalid or expired OTP.");
        }
        return handleResponse(res, 200, "OTP verified successfully.");
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const updateStaffPermissions = async (req, res) => {
    try {
        const { id } = req.params;
        const { permissions } = req.body;

        if (!Array.isArray(permissions)) {
            return handleResponse(res, 400, "Permissions must be an array.");
        }

        const admin = await Admin.findById(id).populate("adminRole");
        if (!admin) {
            return handleResponse(res, 404, "Admin not found.");
        }

        if (!admin.adminRole) {
            return handleResponse(res, 400, "This admin has no assigned role to update.");
        }

        // Update the linked Role document directly
        await Role.findByIdAndUpdate(admin.adminRole._id, { permissions });

        return handleResponse(res, 200, "Permissions updated successfully.");
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

