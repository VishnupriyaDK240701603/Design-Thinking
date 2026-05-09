import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { buildProfileData, profilePatchSchema, profileSchema } from '../lib/profileSchema';
import { completeRegistration, getAppUserByAuthId, getProfileByAuthId, saveProfileData } from '../lib/profilePersistence';

const LOCKED_FIELDS = [
  'age', 'gender', 'social_category', 'religion', 'state_of_residence',
  'has_aadhaar', 'is_armed_forces_family'
];

export const userRouter = Router();

userRouter.use(requireAuth);

function toProfileError(err: any) {
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

userRouter.get('/profile', async (req: Request, res: Response) => {
  try {
    const auth_id = res.locals.user.id;
    const data = await getProfileByAuthId(auth_id);
    return res.json(data);
  } catch (err: any) {
    const clientError = toProfileError(err);
    return res.status(clientError.status).json(clientError.body);
  }
});

userRouter.post('/profile', async (req: Request, res: Response) => {
  try {
    const auth_id = res.locals.user.id;
    const validated = profileSchema.parse(req.body);
    
    // Keep core identity fields editable only during the first 30 days.
    const lockedAt = new Date();
    lockedAt.setDate(lockedAt.getDate() + 30);

    const user = await getAppUserByAuthId(auth_id);
    await saveProfileData(user.id, buildProfileData(validated));
    await completeRegistration(user.id, lockedAt.toISOString());

    const data = await getProfileByAuthId(auth_id);
    return res.json(data);
  } catch (err: any) {
    const clientError = toProfileError(err);
    return res.status(clientError.status).json(clientError.body);
  }
});

userRouter.patch('/profile', async (req: Request, res: Response) => {
  try {
    const auth_id = res.locals.user.id;
    const updates = profilePatchSchema.parse(req.body);

    const user = await getAppUserByAuthId(auth_id);
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

    const currentProfile = await getProfileByAuthId(auth_id);
    const validated = profileSchema.parse({ ...currentProfile, ...updates });
    await saveProfileData(user.id, buildProfileData(validated));

    const data = await getProfileByAuthId(auth_id);
    return res.json(data);
  } catch (err: any) {
    const clientError = toProfileError(err);
    return res.status(clientError.status).json(clientError.body);
  }
});
