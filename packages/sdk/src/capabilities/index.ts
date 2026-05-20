/**
 * Capability specs and Ctx augmentations.
 *
 * Importing this module triggers each capability file's `declare module
 * '../ctx'` augmentation, so plugin code gets typed `ctx.foo.bar()` methods
 * after a single import of `@brika/sdk`.
 *
 * Hub code imports the spec exports here to register handlers.
 */

export { actionsRegister } from './actions';
export { blocksEmit, blocksLog, blocksRegister } from './blocks';
export { bricksPushData, bricksRegisterType } from './bricks';
export { locationGet, locationTimezone } from './location';
export { prefsSet } from './prefs';
export { routesRegister } from './routes';
export { secretsDelete, secretsGet, secretsSet } from './secrets';
export {
  sparksEmit,
  sparksRegister,
  sparksSubscribe,
  sparksUnsubscribe,
} from './sparks';
