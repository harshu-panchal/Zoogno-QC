import Admin from "../models/admin.js";

/**
 * Middleware to check if the admin has a specific permission.
 * If the admin's adminRole is populated and contains the permission, access is granted.
 * Super Admins (or roles with the 'all' permission) are also granted access.
 */
export const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      // Assuming req.user contains the decoded JWT
      if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ success: false, message: "Unauthorized access." });
      }

      // Fetch the admin with their populated custom role
      const admin = await Admin.findById(req.user._id).populate("adminRole");
      
      if (!admin) {
        return res.status(404).json({ success: false, message: "Admin not found." });
      }

      // If no adminRole is assigned, they are a legacy admin, we could either allow or deny.
      // For strict RBAC, deny unless they have a role. 
      // But to prevent lockouts during migration, we might temporarily allow it if no role is set, 
      // or check if they are the primary super admin. Let's deny if strict, but allow if they are legacy.
      if (!admin.adminRole) {
        // Migration fallback: allow if they are the hardcoded first admin, otherwise deny
        if (
          admin.email === "superadmin@zoognu.com" ||
          admin.email === "zoogno61@gmail.com" ||
          admin.email === "harshp0330@gmail.com"
        ) {
             return next();
        }
        return res.status(403).json({ success: false, message: "No dynamic role assigned." });
      }

      const permissions = admin.adminRole.permissions || [];
      
      if (permissions.includes("all") || permissions.includes(requiredPermission)) {
        return next();
      }

      return res.status(403).json({ success: false, message: "Insufficient permissions." });
    } catch (error) {
      console.error("Permission check error:", error);
      res.status(500).json({ success: false, message: "Internal server error during permission check." });
    }
  };
};
