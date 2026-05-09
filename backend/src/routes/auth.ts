import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { appAuth, appDb } from '../db';
import { buildProfileData, profileSchema } from '../lib/profileSchema';
import { completeRegistration, saveProfileData } from '../lib/profilePersistence';

export const authRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'namma_thittam_secret_key_2026';
const usernameSchema = z.string().trim().min(4).regex(/^[a-zA-Z0-9_]+$/);
const passwordSchema = z.string().min(8);
const securityAnswerSchema = z.string().trim().min(1);

const registerAccountSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  security_q1: z.string().trim().min(1), security_a1: securityAnswerSchema,
  security_q2: z.string().trim().min(1), security_a2: securityAnswerSchema,
  security_q3: z.string().trim().min(1), security_a3: securityAnswerSchema,
  security_q4: z.string().trim().min(1), security_a4: securityAnswerSchema,
});

const usernameCheckSchema = z.object({
  username: usernameSchema
});

const reserveAccountSchema = z.object({
  username: usernameSchema,
  password: passwordSchema
});

const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1)
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1)
});

const forgotVerifySchema = z.object({
  username: usernameSchema,
  security_a1: securityAnswerSchema,
  security_a2: securityAnswerSchema,
  security_a3: securityAnswerSchema,
  security_a4: securityAnswerSchema,
});

const forgotResetSchema = z.object({
  reset_token: z.string().min(1),
  new_password: passwordSchema
});

async function findExistingUser(username: string) {
  const { data, error } = await appDb
    .from('users')
    .select('id, auth_id, registration_completed_at')
    .eq('username', username)
    .single();

  if (error && error.code !== 'PGRST116' && !error.message?.includes('No rows found')) {
    throw error;
  }

  return data;
}

function toClientError(err: any) {
  const message = err?.message || 'Registration failed';
  if (
    message.includes('schema cache') ||
    message.includes("Could not find") ||
    message.includes('column')
  ) {
    return {
      status: 503,
      error: 'Database schema is not ready. Run SUPABASE_SCHEMA.sql in the app Supabase project, then restart the backend.',
      details: message,
    };
  }

  if (err?.name === 'ZodError') {
    return {
      status: 400,
      error: err.errors?.[0]?.message || 'Invalid registration details',
    };
  }

  return { status: 500, error: message };
}

authRouter.get('/check-username', async (req: Request, res: Response) => {
  try {
    const { username } = usernameCheckSchema.parse(req.query);
    const normalizedUsername = username.toLowerCase();
    const existingUser = await findExistingUser(normalizedUsername);

    return res.json({
      available: !existingUser,
      error: existingUser ? 'Username already taken' : undefined
    });
  } catch (err: any) {
    const clientError = toClientError(err);
    return res.status(clientError.status).json({ available: false, error: clientError.error });
  }
});

authRouter.post('/reserve', async (req: Request, res: Response) => {
  try {
    const { username, password } = reserveAccountSchema.parse(req.body);
    const normalizedUsername = username.toLowerCase();
    const email = `${normalizedUsername}@nammathittam.local`;

    const existingUser = await findExistingUser(normalizedUsername);
    if (existingUser) {
      return res.status(400).json({
        error: existingUser.registration_completed_at
          ? 'Username already taken'
          : 'Username is reserved by an unfinished registration. Please login or use forgot password.'
      });
    }

    const { data: authData, error: authError } = await appDb.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError || !authData.user?.id) {
      const message = authError?.message || 'Failed to reserve account';
      if (message.toLowerCase().includes('already')) {
        return res.status(400).json({ error: 'Username already exists. Please login or use forgot password to recover your account.' });
      }
      throw authError || new Error(message);
    }

    const auth_id = authData.user.id;
    const { data: appUser, error: insertError } = await appDb.from('users').insert({
      auth_id,
      username: normalizedUsername,
      preferred_language: 'ta'
    }).select('id').single();

    if (insertError) {
      await appDb.auth.admin.deleteUser(auth_id).catch(() => undefined);
      throw insertError;
    }

    return res.json({ reserved: true, username: normalizedUsername, auth_id: auth_id });
  } catch (err: any) {
    const clientError = toClientError(err);
    return res.status(clientError.status).json({ error: clientError.error });
  }
});

authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const accountData = registerAccountSchema.parse(req.body);
    const profileInput = profileSchema.parse(req.body);
    const username = accountData.username.toLowerCase();
    const data = { ...accountData, ...profileInput, username };
    const email = `${username}@nammathittam.local`;
    let auth_id: string | undefined;

    const { data: existingUser, error: existingUserError } = await appDb
      .from('users')
      .select('id, auth_id, registration_completed_at')
      .eq('username', username)
      .single();

    if (existingUserError && !existingUser && !existingUserError.message?.includes('No rows found')) {
      console.warn('[auth/register] users lookup error', existingUserError.message);
    }

    if (existingUser) {
      const { data: existingLogin, error: existingLoginError } = await appAuth.auth.signInWithPassword({
        email,
        password: data.password
      });

      if (
        existingLoginError ||
        !existingLogin.user ||
        existingLogin.user.id !== existingUser.auth_id ||
        existingUser.registration_completed_at
      ) {
        return res.status(400).json({
          error: existingUser.registration_completed_at
            ? 'Username already taken'
            : 'Username is reserved by an unfinished registration. Please login or use forgot password.'
        });
      }

      auth_id = existingLogin.user.id;
    }

    if (!auth_id) {
      // Create auth user. If a previous profile setup failed after auth creation,
      // sign in with the same credentials and finish creating the app user row.
      const { data: authData, error: authError } = await appDb.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true
      });

      auth_id = authData.user?.id;

      if (authError || !auth_id) {
        const message = authError?.message || '';
        if (!message.toLowerCase().includes('already')) {
          throw authError || new Error('Failed to create user');
        }

        const { data: existingLogin, error: existingLoginError } = await appAuth.auth.signInWithPassword({
          email,
          password: data.password
        });

        if (existingLoginError || !existingLogin.user) {
          return res.status(400).json({
            error: 'Username already exists. Please login or use forgot password to recover your account.'
          });
        }

        auth_id = existingLogin.user.id;
      }
    }

    const saltRounds = 10;
    const hashedA1 = await bcrypt.hash(data.security_a1, saltRounds);
    const hashedA2 = await bcrypt.hash(data.security_a2, saltRounds);
    const hashedA3 = await bcrypt.hash(data.security_a3, saltRounds);
    const hashedA4 = await bcrypt.hash(data.security_a4, saltRounds);
    const lockedAt = new Date();
    lockedAt.setDate(lockedAt.getDate() + 30);
    const profileData = buildProfileData(profileInput);

    const { data: appUser, error: insertError } = await appDb.from('users').upsert({
      auth_id,
      username: username,
      preferred_language: 'ta',
    }, {
      onConflict: 'auth_id'
    }).select('id').single();

    if (insertError) throw insertError;
    if (!appUser) throw new Error('Failed to create app user');

    const { error: securityError } = await appDb.from('user_security_questions').upsert([
      { user_id: appUser.id, question_no: 1, question_text: data.security_q1, answer_hash: hashedA1 },
      { user_id: appUser.id, question_no: 2, question_text: data.security_q2, answer_hash: hashedA2 },
      { user_id: appUser.id, question_no: 3, question_text: data.security_q3, answer_hash: hashedA3 },
      { user_id: appUser.id, question_no: 4, question_text: data.security_q4, answer_hash: hashedA4 },
    ], { onConflict: 'user_id,question_no' });

    if (securityError) throw securityError;

    await saveProfileData(appUser.id, profileData);
    await completeRegistration(appUser.id, lockedAt.toISOString());

    // Login user to get tokens
    const { data: loginData, error: loginError } = await appAuth.auth.signInWithPassword({
      email,
      password: data.password
    });

    if (loginError) throw loginError;

    return res.json({
      access_token: loginData.session?.access_token,
      refresh_token: loginData.session?.refresh_token,
      user_id: auth_id,
      is_new_user: false
    });

  } catch (err: any) {
    const clientError = toClientError(err);
    return res.status(clientError.status).json(clientError);
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const normalizedUsername = username.toLowerCase();
    const email = `${normalizedUsername}@nammathittam.local`;

    const { data: loginData, error: loginError } = await appAuth.auth.signInWithPassword({
      email,
      password
    });

    if (loginError || !loginData.user) {
      return res.status(401).json({ error: 'பயனர்பெயர் அல்லது கடவுச்சொல் தவறானது (Invalid credentials)' });
    }

    const { data: userData } = await appDb
      .from('user_registration_profiles')
      .select('registration_complete')
      .eq('auth_id', loginData.user.id)
      .single();

    return res.json({
      access_token: loginData.session?.access_token,
      refresh_token: loginData.session?.refresh_token,
      user_id: loginData.user.id,
      is_new_user: !userData?.registration_complete
    });
  } catch (err: any) {
    const clientError = toClientError(err);
    return res.status(clientError.status).json({ error: clientError.error });
  }
});

authRouter.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refresh_token } = refreshSchema.parse(req.body);
    const { data, error } = await appAuth.auth.refreshSession({ refresh_token });
    if (error) throw error;
    return res.json(data.session);
  } catch (err: any) {
    return res.status(401).json({ error: 'Session expired' });
  }
});

authRouter.get('/security-questions/:username', async (req: Request, res: Response) => {
  try {
    const normalizedUsername = req.params.username.trim().toLowerCase();
    const { data: user, error: userError } = await appDb
      .from('users')
      .select('id')
      .eq('username', normalizedUsername)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { data: questions, error } = await appDb
      .from('user_security_questions')
      .select('question_no, question_text')
      .eq('user_id', user.id)
      .order('question_no', { ascending: true });

    if (error || !questions || questions.length < 4) {
      return res.status(404).json({ error: 'Security questions not found' });
    }

    return res.json({
      security_q1: questions[0].question_text,
      security_q2: questions[1].question_text,
      security_q3: questions[2].question_text,
      security_q4: questions[3].question_text,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

authRouter.post('/forgot-password/verify', async (req: Request, res: Response) => {
  try {
    const { username, security_a1, security_a2, security_a3, security_a4 } = forgotVerifySchema.parse(req.body);
    const normalizedUsername = username.toLowerCase();
    
    const { data: user, error } = await appDb
      .from('users')
      .select('id, auth_id')
      .eq('username', normalizedUsername)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'பதில்கள் சரியில்லை. மீண்டும் முயற்சிக்கவும்.' });
    }

    const { data: answers, error: answersError } = await appDb
      .from('user_security_questions')
      .select('question_no, answer_hash')
      .eq('user_id', user.id)
      .order('question_no', { ascending: true });

    if (answersError || !answers || answers.length < 4) {
      return res.status(401).json({ error: 'Security answers are not available. Please contact support.' });
    }

    const m1 = await bcrypt.compare(security_a1, answers[0].answer_hash);
    const m2 = await bcrypt.compare(security_a2, answers[1].answer_hash);
    const m3 = await bcrypt.compare(security_a3, answers[2].answer_hash);
    const m4 = await bcrypt.compare(security_a4, answers[3].answer_hash);

    if (!m1 || !m2 || !m3 || !m4) {
      return res.status(401).json({ error: 'பதில்கள் சரியில்லை. மீண்டும் முயற்சிக்கவும்.' });
    }

    const reset_token = jwt.sign({ user_id: user.auth_id }, JWT_SECRET, { expiresIn: '15m' });
    return res.json({ reset_token });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

authRouter.post('/forgot-password/reset', async (req: Request, res: Response) => {
  try {
    const { reset_token, new_password } = forgotResetSchema.parse(req.body);
    const decoded = jwt.verify(reset_token, JWT_SECRET) as { user_id: string };
    
    const { error } = await appDb.auth.admin.updateUserById(decoded.user_id, { password: new_password });
    if (error) throw error;

    return res.json({ success: true, message_ta: "கடவுச்சொல் மாற்றப்பட்டது" });
  } catch (err: any) {
    return res.status(400).json({ error: 'Token invalid or expired' });
  }
});
