import { page } from './page';

export const setupRoutes = {
  layout: page({
    path: '/setup',
    load: () => import('@/features/auth/setup'),
    select: (m) => m.SetupLayout,
    scopes: undefined,
    children: {
      welcome: page({
        path: 'welcome',
        load: () => import('@/features/auth/setup'),
        select: (m) => m.WelcomeStep,
      }),
      language: page({
        path: 'language',
        load: () => import('@/features/auth/setup'),
        select: (m) => m.LanguageStep,
      }),
      account: page({
        path: 'account',
        load: () => import('@/features/auth/setup'),
        select: (m) => m.AccountStep,
      }),
      avatar: page({
        path: 'avatar',
        load: () => import('@/features/auth/setup'),
        select: (m) => m.AvatarStep,
      }),
      location: page({
        path: 'location',
        load: () => import('@/features/auth/setup'),
        select: (m) => m.LocationStep,
      }),
      complete: page({
        path: 'complete',
        load: () => import('@/features/auth/setup'),
        select: (m) => m.CompleteStep,
      }),
    },
  }),
};
