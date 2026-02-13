const UserPermission = require('../models/userPermissoin');
const Page = require('../models/page');
 
const authorizePage = (pageName, action = "read") => {
  return async (req, res, next) => {
    try {
 
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }
 
      // Super Admin bypass
      if (req.user.role === 1) {
        return next();
      }
 

      const page = await Page.findOne({ where: { page_name: pageName } });
 
      if (!page) {
        return res.status(404).json({ message: "Page not found in system" });
      }
 

      const userPermission = await UserPermission.findOne({
        where: { userId: req.user.id }
      });
 
      if (!userPermission || !userPermission.pages) {
        return res.status(403).json({ message: "No page access assigned" });
      }
 
 
      const allowedPages = userPermission.pages; // JSON array
 
      if (!allowedPages.includes(String(page.id))) {
        return res.status(403).json({ message: "Access Denied: Page not allowed" });
      }
 
 
      if (userPermission.permissions) {
        const pagePermissions = userPermission.permissions[page.id];
 
        if (!pagePermissions || !pagePermissions[action]) {
          return res.status(403).json({ message: `Access Denied: No ${action} permission` });
        }
      }
 
      next();
 
    } catch (error) {
      console.error("Page Authorization Error:", error);
      return res.status(500).json({ message: "Server Error" });
    }
  };
};
 
module.exports = authorizePage;