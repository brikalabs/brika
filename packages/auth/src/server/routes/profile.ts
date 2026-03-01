/**
 * Profile routes — update name, avatar upload/remove/serve
 */

import { inject } from '@brika/di';
import { BadRequest, rateLimit, route } from '@brika/router';
import { z } from 'zod';
import { NameSchema, PasswordSchema } from '../../schemas';
import { SessionService } from '../../services/SessionService';
import { UserService } from '../../services/UserService';
import { requireSession } from '../requireSession';
import { ImageQuerySchema, serveImage } from '../serveImage';

const IMAGE_MAGIC_BYTES: Array<{
  mime: string;
  bytes: number[];
}> = [
  {
    mime: 'image/png',
    bytes: [0x89, 0x50, 0x4e, 0x47],
  },
  {
    mime: 'image/jpeg',
    bytes: [0xff, 0xd8, 0xff],
  },
  {
    mime: 'image/webp',
    bytes: [0x52, 0x49, 0x46, 0x46],
  }, // "RIFF"
];

function isValidImage(buffer: Buffer): boolean {
  return IMAGE_MAGIC_BYTES.some(({ bytes }) => bytes.every((b, i) => buffer[i] === b));
}

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: PasswordSchema,
});

const UpdateProfileSchema = z.object({
  name: NameSchema.optional(),
});

/** PUT /profile — Update own profile (name) */
const updateProfile = route.put({
  path: '/profile',
  body: UpdateProfileSchema,
  handler: (ctx) => {
    const session = requireSession(ctx);
    const userService = inject(UserService);
    const user = userService.updateUser(session.userId, {
      name: ctx.body.name,
    });
    return {
      user,
    };
  },
});

/** PUT /profile/avatar — Upload avatar image */
const uploadAvatar = route.put({
  path: '/profile/avatar',
  handler: async (ctx) => {
    const session = requireSession(ctx);
    const contentType = ctx.req.headers.get('content-type') ?? '';
    let imageBuffer: Buffer;

    if (contentType.includes('application/json')) {
      const body = (ctx.body ?? {}) as {
        data: string;
      };
      if (!body.data) {
        throw new BadRequest('Missing image data');
      }
      imageBuffer = Buffer.from(body.data, 'base64');
    } else {
      imageBuffer = Buffer.from(await ctx.req.arrayBuffer());
    }

    if (imageBuffer.length === 0) {
      throw new BadRequest('Empty image data');
    }
    if (imageBuffer.length > 5 * 1024 * 1024) {
      throw new BadRequest('Image too large (max 5MB)');
    }
    if (!isValidImage(imageBuffer)) {
      throw new BadRequest('Invalid image format (PNG, JPEG, or WebP required)');
    }

    const userService = inject(UserService);
    const avatarHash = userService.setAvatar(session.userId, imageBuffer);
    return {
      ok: true,
      avatarHash,
    };
  },
});

/** DELETE /profile/avatar — Remove avatar */
const removeAvatar = route.delete({
  path: '/profile/avatar',
  handler: (ctx) => {
    const session = requireSession(ctx);
    const userService = inject(UserService);
    userService.removeAvatar(session.userId);
    return {
      ok: true,
    };
  },
});

/** PUT /profile/password — Change own password */
const changePassword = route.put({
  path: '/profile/password',
  middleware: [
    rateLimit({
      window: 900,
      max: 10,
    }),
  ],
  body: ChangePasswordSchema,
  handler: async (ctx) => {
    const session = requireSession(ctx);

    const userService = inject(UserService);
    const valid = await userService.verifyPassword(session.userId, ctx.body.currentPassword);
    if (!valid) {
      throw new BadRequest('Invalid current password');
    }

    try {
      await userService.setPassword(session.userId, ctx.body.newPassword);
    } catch (err) {
      throw new BadRequest(err instanceof Error ? err.message : 'Invalid password');
    }

    // Revoke all other sessions after password change to invalidate potentially compromised sessions
    const sessionService = inject(SessionService);
    sessionService.revokeAllUserSessions(session.userId);

    return {
      ok: true,
    };
  },
});

/** GET /avatar/:userId — Serve avatar image (?s=128 square, ?w=200&h=100, ?w=200) */
const getAvatar = route.get({
  path: '/avatar/:userId',
  query: ImageQuerySchema,
  handler: (ctx) => {
    const userService = inject(UserService);
    const { userId } = ctx.params as {
      userId: string;
    };
    const avatar = userService.getAvatarData(userId);
    return serveImage(avatar?.data ?? null, ctx);
  },
});

export const profileRoutes = [updateProfile, changePassword, uploadAvatar, removeAvatar, getAvatar];
