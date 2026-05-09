"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const db_1 = require("../db");
const requireAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }
        const { data, error } = await db_1.appDb.auth.getUser(token);
        if (error || !data.user) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }
        res.locals.user = data.user;
        next();
    }
    catch (err) {
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.requireAuth = requireAuth;
