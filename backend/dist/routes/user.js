"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const profileSchema_1 = require("../lib/profileSchema");
const profilePersistence_1 = require("../lib/profilePersistence");
const LOCKED_FIELDS = [
    'age', 'gender', 'social_category', 'religion', 'state_of_residence',
    'has_aadhaar', 'is_armed_forces_family'
];
exports.userRouter = (0, express_1.Router)();
exports.userRouter.use(auth_1.requireAuth);
function toProfileError(err) {
    if (err?.name === 'ZodError') {
        return {
            status: 400,
            body: {
                error: err.errors?.[0]?.message || 'Invalid profile details',
                issues: err.errors,
            },
        };
    }
    return { status: 500, body: { error: err.message || 'Profile update failed' } };
}
exports.userRouter.get('/profile', async (req, res) => {
    try {
        const auth_id = res.locals.user.id;
        const data = await (0, profilePersistence_1.getProfileByAuthId)(auth_id);
        return res.json(data);
    }
    catch (err) {
        const clientError = toProfileError(err);
        return res.status(clientError.status).json(clientError.body);
    }
});
exports.userRouter.post('/profile', async (req, res) => {
    try {
        const auth_id = res.locals.user.id;
        const validated = profileSchema_1.profileSchema.parse(req.body);
        // Keep core identity fields editable only during the first 30 days.
        const lockedAt = new Date();
        lockedAt.setDate(lockedAt.getDate() + 30);
        const user = await (0, profilePersistence_1.getAppUserByAuthId)(auth_id);
        await (0, profilePersistence_1.saveProfileData)(user.id, (0, profileSchema_1.buildProfileData)(validated));
        await (0, profilePersistence_1.completeRegistration)(user.id, lockedAt.toISOString());
        const data = await (0, profilePersistence_1.getProfileByAuthId)(auth_id);
        return res.json(data);
    }
    catch (err) {
        const clientError = toProfileError(err);
        return res.status(clientError.status).json(clientError.body);
    }
});
exports.userRouter.patch('/profile', async (req, res) => {
    try {
        const auth_id = res.locals.user.id;
        const updates = profileSchema_1.profilePatchSchema.parse(req.body);
        const user = await (0, profilePersistence_1.getAppUserByAuthId)(auth_id);
        const isLocked = user.profile_locked_until && new Date() > new Date(user.profile_locked_until);
        if (isLocked) {
            for (const field of LOCKED_FIELDS) {
                if (field in updates) {
                    return res.status(400).json({
                        code: 'FIELD_LOCKED',
                        message_ta: 'இந்த தகவலை மாற்ற முடியாது',
                        message_en: 'This field cannot be changed after 30 days'
                    });
                }
            }
        }
        const currentProfile = await (0, profilePersistence_1.getProfileByAuthId)(auth_id);
        const validated = profileSchema_1.profileSchema.parse({ ...currentProfile, ...updates });
        await (0, profilePersistence_1.saveProfileData)(user.id, (0, profileSchema_1.buildProfileData)(validated));
        const data = await (0, profilePersistence_1.getProfileByAuthId)(auth_id);
        return res.json(data);
    }
    catch (err) {
        const clientError = toProfileError(err);
        return res.status(clientError.status).json(clientError.body);
    }
});
