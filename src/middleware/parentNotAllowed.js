const parentNotAllowed = (req, res, next) => {
    if (req.user?.loginAs === "parent") {
        return res.status(403).json({
            message: "parent is not allowed to perform this action"
        });
    }

    next();
};

module.exports = parentNotAllowed;