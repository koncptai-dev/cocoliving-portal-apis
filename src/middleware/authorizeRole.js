const authorizeRole = (...allowedRoles) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ message: "User not authenticated" });
            }

            // Check if role is in allowedRoles
            if (!allowedRoles.includes(req.user.role)) {
                return res.status(403).json({ message: "Access Denied: Insufficient Role" });
            }

            next();
        } catch (error) {
            console.error("Role Authorization Error:", error);
            return res.status(500).json({ message: "Server Error" });
        }
    };
};

module.exports = authorizeRole;